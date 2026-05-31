// Tests for the pure navigation helpers over CriticChange[]. Run with `npm test`.
//
// navigator.ts imports the VS Code API (Position/Range comparisons), so
// ./vscodeStub is imported first to shim `require('vscode')` — see parser.test.ts.
import { TextDocument } from './vscodeStub';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseCriticMarkup } from './parser';
import { findAtCursor, findNext, findPrev, findFirst, findLast } from './navigator';

// Three changes:                 offsets
//   {--a--}  deletion            [0, 7)
//   {++b++}  addition            [12, 19)
//   {==c==}  highlight           [20, 27)   (on line 1)
const DOC = '{--a--} mid {++b++}\n{==c==}';
const doc = new TextDocument(DOC);
const changes = parseCriticMarkup(doc as any);

/** Position for a UTF-16 offset in DOC (typed `any`: the stub Position is a
 * structural subset of vscode.Position, enough for the navigator helpers). */
function at(off: number): any {
  return doc.positionAt(off);
}

test('the fixture yields exactly the three expected changes', () => {
  assert.equal(changes.length, 3);
});

test('findFirst / findLast return the boundary changes', () => {
  assert.equal(findFirst(changes), changes[0]);
  assert.equal(findLast(changes), changes[2]);
  assert.equal(findFirst([]), undefined);
  assert.equal(findLast([]), undefined);
});

test('findAtCursor matches the change containing the cursor', () => {
  assert.equal(findAtCursor(changes, at(3)), changes[0]);   // inside {--a--}
  assert.equal(findAtCursor(changes, at(15)), changes[1]);  // inside {++b++}
});

test('findAtCursor includes the start offset but excludes the end offset', () => {
  assert.equal(findAtCursor(changes, at(0)), changes[0]);   // exactly at start → inside
  assert.equal(findAtCursor(changes, at(7)), undefined);    // exactly at end → outside
});

test('findAtCursor returns undefined between changes', () => {
  assert.equal(findAtCursor(changes, at(9)), undefined);    // in " mid "
});

test('findNext returns the first change starting strictly after the cursor', () => {
  assert.equal(findNext(changes, at(9)), changes[1]);
  // A cursor exactly at a change start skips to the following change.
  assert.equal(findNext(changes, at(0)), changes[1]);
  // Past the last change → undefined (the command layer handles wrap-around).
  assert.equal(findNext(changes, at(27)), undefined);
});

test('findPrev returns the last change ending strictly before the cursor', () => {
  assert.equal(findPrev(changes, at(20)), changes[1]);
  // Before any change → undefined.
  assert.equal(findPrev(changes, at(0)), undefined);
});
