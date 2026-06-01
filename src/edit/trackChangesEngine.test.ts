// Tests for the Track Changes engine. Run with `npm test` (Node's test runner).
// The engine is VS Code-free, so these run without an extension host.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { computeTrackChanges, RawEdit, CompEdit } from './trackChangesEngine';

/** Apply non-overlapping {start,end,replacement} edits (descending, no drift). */
function splice(text: string, edits: { start: number; end: number; replacement: string }[]): string {
  return [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce((t, e) => t.slice(0, e.start) + e.replacement + t.slice(e.end), text);
}

/** Reproduce VS Code: apply the raw user edits to the pre-edit text. */
function applyRaw(preText: string, raw: RawEdit[]): string {
  return splice(preText, raw.map(r => ({
    start: r.offset, end: r.offset + r.oldLength, replacement: r.newText,
  })));
}

/** Final document = pre-edit text + raw edits + compensating wraps. */
function finalText(preText: string, raw: RawEdit[], edits: CompEdit[]): string {
  return splice(applyRaw(preText, raw), edits);
}

/** Reject every marker (deletion→content, addition→'', substitution→old). */
function rejectAll(text: string): string {
  return text
    .replace(/\{--(.*?)--\}/gs, '$1')
    .replace(/\{\+\+(.*?)\+\+\}/gs, '')
    .replace(/\{~~(.*?)~>(.*?)~~\}/gs, '$1');
}

test('insertion into plain text wraps as addition, caret inside', () => {
  const pre = 'Hello world';
  const raw: RawEdit[] = [{ offset: 5, oldLength: 0, newText: 'X' }];
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), 'Hello{++X++} world');
  assert.deepEqual(r.selections, [9]); // before ++}
  assert.equal(rejectAll(finalText(pre, raw, r.edits)), pre);
});

test('deletion wraps as deletion, caret before marker', () => {
  const pre = 'Hello world';
  const raw: RawEdit[] = [{ offset: 6, oldLength: 5, newText: '' }];
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), 'Hello {--world--}');
  assert.deepEqual(r.selections, [6]);
  assert.equal(rejectAll(finalText(pre, raw, r.edits)), pre);
});

test('replacing a selection wraps as substitution', () => {
  const pre = 'Hello world';
  const raw: RawEdit[] = [{ offset: 6, oldLength: 5, newText: 'earth' }];
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), 'Hello {~~world~>earth~~}');
  assert.deepEqual(r.selections, [21]); // before ~~}
  assert.equal(rejectAll(finalText(pre, raw, r.edits)), pre);
});

test('typing inside an existing addition grows it (no new marker)', () => {
  const pre = 'a{++b++}c';
  const raw: RawEdit[] = [{ offset: 5, oldLength: 0, newText: 'X' }]; // before ++}
  const r = computeTrackChanges(pre, raw);
  assert.equal(r.edits.length, 0);
  assert.equal(applyRaw(pre, raw), 'a{++bX++}c');
  assert.deepEqual(r.selections, [6]);
});

test('typing inside a substitution new side grows it (no nested marker) — issue #34', () => {
  // Caret parked before ~~}, inside the new side of a just-made substitution.
  const pre = 'to {~~stick~>J~~} to';
  const raw: RawEdit[] = [{ offset: 14, oldLength: 0, newText: 'u' }];
  const r = computeTrackChanges(pre, raw);
  assert.equal(r.edits.length, 0); // absorbed, not wrapped in a new {++…++}
  assert.equal(applyRaw(pre, raw), 'to {~~stick~>Ju~~} to');
  assert.deepEqual(r.selections, [15]); // after the typed char, before ~~}
});

test('no nested markup forms when typing into any marker interior — issue #34', () => {
  // Highlight / comment / deletion interiors all stay literal (no inner marker).
  for (const pre of ['a{==hi==}b', 'a{>>note<<}b', 'a{--del--}b']) {
    const raw: RawEdit[] = [{ offset: 5, oldLength: 0, newText: 'X' }];
    const r = computeTrackChanges(pre, raw);
    assert.equal(r.edits.length, 0, `expected no wrap inside ${pre}`);
  }
});

test('deleting just-added text (inside an addition) leaves no deletion marker', () => {
  const pre = 'a{++bX++}c';
  const raw: RawEdit[] = [{ offset: 5, oldLength: 1, newText: '' }]; // remove the X
  const r = computeTrackChanges(pre, raw);
  assert.equal(r.edits.length, 0);
  assert.equal(applyRaw(pre, raw), 'a{++b++}c');
});

test('backspace next to a deletion merges into one marker', () => {
  const pre = 'ab{--c--}';
  const raw: RawEdit[] = [{ offset: 1, oldLength: 1, newText: '' }]; // delete the b
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), 'a{--bc--}');
  assert.deepEqual(r.selections, [1]);
  assert.equal(rejectAll(finalText(pre, raw, r.edits)), 'abc');
});

test('multi-cursor insertion wraps each edit independently', () => {
  const pre = 'ab';
  const raw: RawEdit[] = [
    { offset: 0, oldLength: 0, newText: 'X' },
    { offset: 2, oldLength: 0, newText: 'Y' },
  ];
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), '{++X++}ab{++Y++}');
  assert.deepEqual(r.selections, [4, 13]);
  assert.equal(rejectAll(finalText(pre, raw, r.edits)), pre);
});

test('unsorted multi-edit input is handled in order', () => {
  const pre = 'ab';
  const raw: RawEdit[] = [
    { offset: 2, oldLength: 0, newText: 'Y' },
    { offset: 0, oldLength: 0, newText: 'X' },
  ];
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), '{++X++}ab{++Y++}');
});
