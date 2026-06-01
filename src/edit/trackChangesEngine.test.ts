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

// Issue #38 — removing a delimiter character of an existing marker rejects the
// whole marker (reusing the accept/reject semantics), instead of wrapping the
// edited delimiter as a new (nested) change.

test('deleting the opener of an addition rejects it — issue #38', () => {
  // The motivating example: {++a++}, backspace the leading {.
  const pre = '{++a++}';
  const raw: RawEdit[] = [{ offset: 0, oldLength: 1, newText: '' }];
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), ''); // addition rejected → gone
  assert.deepEqual(r.selections, [0]);
});

test('deleting an opener char of a deletion rejects it (text kept) — issue #38', () => {
  const pre = '{--alt--}';
  const raw: RawEdit[] = [{ offset: 1, oldLength: 1, newText: '' }]; // a '-' of {--
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), 'alt'); // deletion rejected → text stays
  assert.deepEqual(r.selections, [3]); // caret after the restored text
});

test('deleting a closer char of a substitution rejects it (old side) — issue #38', () => {
  const pre = '{~~old~>new~~}';
  const raw: RawEdit[] = [{ offset: 11, oldLength: 1, newText: '' }]; // a '~' of ~~}
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), 'old'); // reverts to the old side
  assert.deepEqual(r.selections, [3]);
});

test('deleting a closer char of a highlight rejects it (text kept) — issue #38', () => {
  const pre = '{==hi==}';
  const raw: RawEdit[] = [{ offset: 7, oldLength: 1, newText: '' }]; // the }
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), 'hi');
  assert.deepEqual(r.selections, [2]);
});

test('deleting an opener char of a comment rejects it (gone) — issue #38', () => {
  const pre = '{>>note<<}';
  const raw: RawEdit[] = [{ offset: 1, oldLength: 1, newText: '' }]; // a '>' of {>>
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), '');
  assert.deepEqual(r.selections, [0]);
});

test('a selection spanning content and the closer rejects the whole marker — issue #38', () => {
  // Selecting `c++}` (content + part of the closer) and deleting rejects the
  // entire addition, not just the selected slice.
  const pre = '{++abc++}';
  const raw: RawEdit[] = [{ offset: 5, oldLength: 4, newText: '' }];
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), '');
  assert.deepEqual(r.selections, [0]);
});

test('a content-only edit is still absorbed, not rejected — issue #38 boundary', () => {
  // Editing strictly inside the content keeps the #34 behaviour (no reject).
  const pre = '{++abc++}';
  const raw: RawEdit[] = [{ offset: 4, oldLength: 1, newText: '' }]; // delete the b
  const r = computeTrackChanges(pre, raw);
  assert.equal(r.edits.length, 0);
  assert.equal(applyRaw(pre, raw), '{++ac++}');
});

// Issue #40 — pasting/inserting text that is already complete CriticMarkup must
// not be re-wrapped (it would nest). Embedded markers stay literal; surrounding
// plain runs are tracked as additions; a replaced plain selection becomes a
// leading deletion.

test('pasting a single complete marker is kept as-is (not nested) — issue #40', () => {
  const pre = 'Hello  world';
  const raw: RawEdit[] = [{ offset: 6, oldLength: 0, newText: '{++a++}' }];
  const r = computeTrackChanges(pre, raw);
  assert.equal(r.edits.length, 0); // skip: raw text already final
  assert.equal(applyRaw(pre, raw), 'Hello {++a++} world');
  assert.deepEqual(r.selections, [13]); // caret after the pasted marker
});

test('pasting several concatenated markers is kept as-is — issue #40', () => {
  const pre = '';
  const raw: RawEdit[] = [{ offset: 0, oldLength: 0, newText: '{--x--}{++y++}' }];
  const r = computeTrackChanges(pre, raw);
  assert.equal(r.edits.length, 0);
  assert.equal(applyRaw(pre, raw), '{--x--}{++y++}');
  assert.deepEqual(r.selections, [14]);
});

test('pasting markup surrounded by plain text wraps only the plain runs — issue #40', () => {
  const pre = '';
  const raw: RawEdit[] = [{ offset: 0, oldLength: 0, newText: 'foo {++a++} bar' }];
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), '{++foo ++}{++a++}{++ bar++}');
  assert.deepEqual(r.selections, [27]); // after the whole pasted block
  assert.equal(rejectAll(finalText(pre, raw, r.edits)), ''); // nothing was real text
});

test('pasting a trailing-plain mix wraps only the tail — issue #40', () => {
  const pre = '';
  const raw: RawEdit[] = [{ offset: 0, oldLength: 0, newText: '{++a++} tail' }];
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), '{++a++}{++ tail++}');
});

test('pasting markup over a selection tracks the old text as a deletion — issue #40', () => {
  const pre = 'Hello foo world';
  const raw: RawEdit[] = [{ offset: 6, oldLength: 3, newText: '{++a++}' }]; // replace "foo"
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), 'Hello {--foo--}{++a++} world');
  assert.deepEqual(r.selections, [22]); // after the pasted block
  assert.equal(rejectAll(finalText(pre, raw, r.edits)), pre); // reject restores "foo"
});

test('pasting plain text is still wrapped as a single addition — issue #40', () => {
  const pre = '';
  const raw: RawEdit[] = [{ offset: 0, oldLength: 0, newText: 'plain text' }];
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), '{++plain text++}');
  assert.deepEqual(r.selections, [13]); // before ++}, unchanged plain-insert behaviour
});

test('pasting unterminated markup falls through to a normal addition wrap — issue #40', () => {
  const pre = '';
  const raw: RawEdit[] = [{ offset: 0, oldLength: 0, newText: '{++a' }];
  const r = computeTrackChanges(pre, raw);
  assert.equal(finalText(pre, raw, r.edits), '{++{++a++}'); // no marker matched → wrapped
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
