// Tests for the pure Double-Pane builder. VS Code-free, so these run without an
// Extension Host (and without the vscode stub) — like actions.test.ts.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildDoublePane, PaneCategory } from './build';

/** Convenience: the [category, sliced-text] of every span in a pane. */
function spanTexts(text: string, spans: { category: PaneCategory; start: number; end: number }[]) {
  return spans.map(s => [s.category, text.slice(s.start, s.end)] as const);
}

test('deletion: original keeps it (deletion), modified drops it', () => {
  const { original, modified } = buildDoublePane('a {--gone--} b');
  assert.equal(original.text, 'a gone b');
  assert.equal(modified.text, 'a  b');
  assert.deepEqual(spanTexts(original.text, original.spans), [['deletion', 'gone']]);
  assert.deepEqual(modified.spans, []);
});

test('addition: modified keeps it (addition), original drops it', () => {
  const { original, modified } = buildDoublePane('a {++new++} b');
  assert.equal(original.text, 'a  b');
  assert.equal(modified.text, 'a new b');
  assert.deepEqual(original.spans, []);
  assert.deepEqual(spanTexts(modified.text, modified.spans), [['addition', 'new']]);
});

test('substitution: old → original, new → modified', () => {
  const { original, modified } = buildDoublePane('say {~~hi~>hello~~}!');
  assert.equal(original.text, 'say hi!');
  assert.equal(modified.text, 'say hello!');
  assert.deepEqual(spanTexts(original.text, original.spans), [['substitutionOld', 'hi']]);
  assert.deepEqual(spanTexts(modified.text, modified.spans), [['substitutionNew', 'hello']]);
});

test('highlight: same text + category on both sides', () => {
  const { original, modified } = buildDoublePane('a {==mark==} b');
  assert.equal(original.text, 'a mark b');
  assert.equal(modified.text, 'a mark b');
  assert.deepEqual(spanTexts(original.text, original.spans), [['highlight', 'mark']]);
  assert.deepEqual(spanTexts(modified.text, modified.spans), [['highlight', 'mark']]);
});

test('comment: same text + category on both sides', () => {
  const { original, modified } = buildDoublePane('a {>>note<<} b');
  assert.equal(original.text, 'a note b');
  assert.equal(modified.text, 'a note b');
  assert.deepEqual(spanTexts(original.text, original.spans), [['comment', 'note']]);
  assert.deepEqual(spanTexts(modified.text, modified.spans), [['comment', 'note']]);
});

test('comment: @author prefix is kept verbatim in the content', () => {
  const { original, modified } = buildDoublePane('x {>>@kai 2026-06-02: looks good<<} y');
  assert.equal(original.text, 'x @kai 2026-06-02: looks good y');
  assert.deepEqual(spanTexts(original.text, original.spans), [
    ['comment', '@kai 2026-06-02: looks good'],
  ]);
  assert.equal(modified.text, original.text);
});

test('plain text with no markers is copied verbatim, uncoloured, to both', () => {
  const { original, modified } = buildDoublePane('just plain text');
  assert.equal(original.text, 'just plain text');
  assert.equal(modified.text, 'just plain text');
  assert.deepEqual(original.spans, []);
  assert.deepEqual(modified.spans, []);
});

test('several markers in a row: correct offsets and per-side content', () => {
  const { original, modified } = buildDoublePane('{--d--}{++a++}{~~o~>n~~}{==h==}{>>c<<}');
  // Original: deletion + (no addition) + subst-old + highlight + comment
  assert.equal(original.text, 'dohc');
  assert.deepEqual(spanTexts(original.text, original.spans), [
    ['deletion', 'd'],
    ['substitutionOld', 'o'],
    ['highlight', 'h'],
    ['comment', 'c'],
  ]);
  // Modified: (no deletion) + addition + subst-new + highlight + comment
  assert.equal(modified.text, 'anhc');
  assert.deepEqual(spanTexts(modified.text, modified.spans), [
    ['addition', 'a'],
    ['substitutionNew', 'n'],
    ['highlight', 'h'],
    ['comment', 'c'],
  ]);
});

test('empty contents emit no span (and add no text)', () => {
  // Empty deletion / addition / highlight / comment, and a substitution with an
  // empty old and an empty new side.
  const { original, modified } = buildDoublePane('A{----}{++++}{~~~>~~}{====}{>><<}B');
  assert.equal(original.text, 'AB');
  assert.equal(modified.text, 'AB');
  assert.deepEqual(original.spans, []);
  assert.deepEqual(modified.spans, []);
});

test('substitution with empty old side: nothing on original, new on modified', () => {
  const { original, modified } = buildDoublePane('{~~~>added~~}');
  assert.equal(original.text, '');
  assert.deepEqual(original.spans, []);
  assert.equal(modified.text, 'added');
  assert.deepEqual(spanTexts(modified.text, modified.spans), [['substitutionNew', 'added']]);
});

test('multi-line comment content is preserved across newlines', () => {
  const { original } = buildDoublePane('{>>line1\nline2<<}');
  assert.equal(original.text, 'line1\nline2');
  assert.deepEqual(spanTexts(original.text, original.spans), [['comment', 'line1\nline2']]);
});

test('offsets are absolute within the pane string after a leading gap', () => {
  const { modified } = buildDoublePane('hello {++world++}');
  const span = modified.spans[0];
  assert.equal(span.category, 'addition');
  assert.equal(modified.text.slice(span.start, span.end), 'world');
  assert.equal(span.start, 'hello '.length);
});
