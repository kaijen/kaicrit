// Tests for the re-entrancy guard in TrackChangesManager.
// Must import the stub first so `require('vscode')` resolves to the fake.
import './vscodeStub';
import { setApplyEditImpl, setConfig, resetConfig } from './vscodeStub';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import { TrackChangesManager } from './trackChanges';

// A throwaway document fake covering just what handleChange touches.
function makeDoc(uri: string, text: string) {
  return {
    uri: { toString: () => uri },
    getText: () => text,
    positionAt: (off: number) => {
      let line = 0;
      let last = 0;
      for (let i = 0; i < off && i < text.length; i++) {
        if (text[i] === '\n') { line++; last = i + 1; }
      }
      return new vscode.Position(line, off - last);
    },
  };
}

// An insertion of ' world' at offset 5 of 'hello' — yields one compensating edit
// (see trackChangesEngine.test.ts), so handleChange will call applyEdit.
function insertEvent(doc: ReturnType<typeof makeDoc>) {
  return {
    document: doc,
    reason: undefined,
    contentChanges: [{ rangeOffset: 5, rangeLength: 0, text: ' world' }],
  } as unknown as vscode.TextDocumentChangeEvent;
}

const flush = () => new Promise<void>(r => setImmediate(r));

test('guard is released after applyEdit rejects (task 13)', async () => {
  const mgr = new TrackChangesManager();
  const doc = makeDoc('file:///a.md', 'hello');
  mgr.toggle(doc as unknown as vscode.TextDocument); // enable + snapshot 'hello'

  let calls = 0;
  // First edit: applyEdit rejects. The guard must not stay stuck.
  setApplyEditImpl(() => { calls++; return Promise.reject(new Error('boom')); });
  mgr.handleChange(insertEvent(doc));
  await flush();
  assert.equal(calls, 1, 'first applyEdit should have been attempted');

  // Second edit: applyEdit succeeds — only reachable if the guard was cleared.
  setApplyEditImpl(() => { calls++; return Promise.resolve(true); });
  mgr.handleChange(insertEvent(doc));
  await flush();
  assert.equal(calls, 2, 'guard wedged: second edit was dropped after a rejection');

  mgr.dispose();
});

test('guard is per document, not process-wide (task 14)', async () => {
  const mgr = new TrackChangesManager();
  const docA = makeDoc('file:///a.md', 'hello');
  const docB = makeDoc('file:///b.md', 'hello');
  mgr.toggle(docA as unknown as vscode.TextDocument);
  mgr.toggle(docB as unknown as vscode.TextDocument);

  const touched = new Set<string>();
  setApplyEditImpl((we) => {
    const uri = (we.edits[0].uri as { toString(): string }).toString();
    touched.add(uri);
    // Document A's edit never settles, keeping its guard entry in flight.
    if (uri === 'file:///a.md') { return new Promise<boolean>(() => {}); }
    return Promise.resolve(true);
  });

  mgr.handleChange(insertEvent(docA)); // A's applyEdit stays pending
  mgr.handleChange(insertEvent(docB)); // must NOT be blocked by A's in-flight edit
  await flush();

  assert.ok(touched.has('file:///a.md'), 'A should have been attempted');
  assert.ok(touched.has('file:///b.md'), 'B was blocked by A — guard is not per document');

  mgr.dispose();
});

// Normal-mode (Track Changes OFF) flatten-on-paste. The doc is NEVER toggled, so
// handleChange routes to handleNormalMode. makeDoc.getText() returns the
// POST-edit text — handleNormalMode reconstructs the pre-edit text from it.

// Post-edit doc after pasting {++X++} into the content of {++abc++}; the change
// describes that paste. Reconstructed pre-edit text is '{++abc++}'.
function markerPasteEvent(doc: ReturnType<typeof makeDoc>) {
  return {
    document: doc,
    reason: undefined,
    contentChanges: [{ rangeOffset: 5, rangeLength: 0, text: '{++X++}' }],
  } as unknown as vscode.TextDocumentChangeEvent;
}

test('normal mode: pasting markup into a marker flattens it (tracking off)', async () => {
  const mgr = new TrackChangesManager();
  const doc = makeDoc('file:///n.md', '{++ab{++X++}c++}'); // post-edit text
  let calls = 0;
  let editText: string | undefined;
  setApplyEditImpl((we) => { calls++; editText = we.edits[0]?.text; return Promise.resolve(true); });

  mgr.handleChange(markerPasteEvent(doc));
  await flush();

  assert.equal(calls, 1, 'flatten edit should have been applied');
  assert.equal(editText, 'X', 'inner marker flattened to its accept-form');
  mgr.dispose();
});

test('normal mode: plain text paste is pure passthrough (no applyEdit)', async () => {
  const mgr = new TrackChangesManager();
  const doc = makeDoc('file:///n.md', 'helloX world'); // post-edit text
  let calls = 0;
  setApplyEditImpl(() => { calls++; return Promise.resolve(true); });

  mgr.handleChange({
    document: doc,
    reason: undefined,
    contentChanges: [{ rangeOffset: 5, rangeLength: 0, text: 'X' }],
  } as unknown as vscode.TextDocumentChangeEvent);
  await flush();

  assert.equal(calls, 0, 'plain text must stay plain — no compensating edit');
  mgr.dispose();
});

test('normal mode: preventNestingOnPaste=false disables the flatten', async () => {
  setConfig('edit.preventNestingOnPaste', false);
  const mgr = new TrackChangesManager();
  const doc = makeDoc('file:///n.md', '{++ab{++X++}c++}');
  let calls = 0;
  setApplyEditImpl(() => { calls++; return Promise.resolve(true); });

  mgr.handleChange(markerPasteEvent(doc));
  await flush();

  assert.equal(calls, 0, 'with the setting off, even an in-marker paste stays literal');
  mgr.dispose();
  resetConfig();
});

test('normal mode: undo/redo never triggers a flatten', async () => {
  const mgr = new TrackChangesManager();
  const doc = makeDoc('file:///n.md', '{++ab{++X++}c++}');
  let calls = 0;
  setApplyEditImpl(() => { calls++; return Promise.resolve(true); });

  mgr.handleChange({
    document: doc,
    reason: vscode.TextDocumentChangeReason.Undo,
    contentChanges: [{ rangeOffset: 5, rangeLength: 0, text: '{++X++}' }],
  } as unknown as vscode.TextDocumentChangeEvent);
  await flush();

  assert.equal(calls, 0, 'undo must be left untouched');
  mgr.dispose();
});

test('normal mode: own compensating edit is not re-processed (guard held)', async () => {
  const mgr = new TrackChangesManager();
  const doc = makeDoc('file:///n.md', '{++ab{++X++}c++}');
  let calls = 0;
  setApplyEditImpl(() => { calls++; return new Promise<boolean>(() => {}); }); // stays pending

  mgr.handleChange(markerPasteEvent(doc)); // calls=1, guard set
  mgr.handleChange(markerPasteEvent(doc)); // dropped by the per-doc guard
  await flush();

  assert.equal(calls, 1, 'a re-fired own edit while the guard is held must be dropped');
  mgr.dispose();
});

test('normal mode: guard is released after applyEdit rejects', async () => {
  const mgr = new TrackChangesManager();
  const doc = makeDoc('file:///n.md', '{++ab{++X++}c++}');
  let calls = 0;
  setApplyEditImpl(() => { calls++; return Promise.reject(new Error('boom')); });
  mgr.handleChange(markerPasteEvent(doc));
  await flush();
  assert.equal(calls, 1);

  setApplyEditImpl(() => { calls++; return Promise.resolve(true); });
  mgr.handleChange(markerPasteEvent(doc));
  await flush();
  assert.equal(calls, 2, 'guard wedged: second edit dropped after a rejection');
  mgr.dispose();
});
