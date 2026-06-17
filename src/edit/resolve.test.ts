// Tests for the accept/reject mapping. The logic is VS Code-free, so these run
// without an Extension Host (and without the vscode stub).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveReplacement, collapseAdjustment } from './resolve';
import { ChangeType } from '../core/types';

test('deletion: accept removes, reject keeps the text', () => {
  const c = { type: ChangeType.Deletion, text: 'gone' };
  assert.equal(resolveReplacement(c, 'accept'), '');
  assert.equal(resolveReplacement(c, 'reject'), 'gone');
});

test('addition: accept keeps, reject removes the text', () => {
  const c = { type: ChangeType.Addition, text: 'new' };
  assert.equal(resolveReplacement(c, 'accept'), 'new');
  assert.equal(resolveReplacement(c, 'reject'), '');
});

test('substitution: accept → new, reject → old', () => {
  const c = { type: ChangeType.Substitution, oldText: 'old', newText: 'new' };
  assert.equal(resolveReplacement(c, 'accept'), 'new');
  assert.equal(resolveReplacement(c, 'reject'), 'old');
});

test('highlight: both accept and reject keep the text', () => {
  const c = { type: ChangeType.Highlight, text: 'hl' };
  assert.equal(resolveReplacement(c, 'accept'), 'hl');
  assert.equal(resolveReplacement(c, 'reject'), 'hl');
});

test('comment: both accept and reject remove it', () => {
  const c = { type: ChangeType.Comment, text: 'note' };
  assert.equal(resolveReplacement(c, 'accept'), '');
  assert.equal(resolveReplacement(c, 'reject'), '');
});

test('missing strings collapse to empty (defensive)', () => {
  assert.equal(resolveReplacement({ type: ChangeType.Deletion }, 'reject'), '');
  assert.equal(resolveReplacement({ type: ChangeType.Substitution }, 'accept'), '');
  assert.equal(resolveReplacement({ type: ChangeType.Substitution }, 'reject'), '');
});

// ── collapseAdjustment (issues #79, #73) ──────────────────────────────────────
// `M` stands in for a marker spanning the given start/end offsets; the helper only
// inspects the boundaries / the marker's line, never the content.

test('collapseAdjustment: empty between two spaces drops one trailing space', () => {
  assert.deepEqual(collapseAdjustment('a M b', 2, 3, ''), { extendStart: 0, extendEnd: 1 });
});

test('collapseAdjustment: non-empty replacement stays exact', () => {
  // reject-of-deletion / substitution / highlight all resolve non-empty.
  assert.deepEqual(collapseAdjustment('a M b', 2, 3, 'kept'), { extendStart: 0, extendEnd: 0 });
});

test('collapseAdjustment: a single flanking space does not collapse', () => {
  assert.deepEqual(collapseAdjustment('aM b', 1, 2, ''), { extendStart: 0, extendEnd: 0 });
  assert.deepEqual(collapseAdjustment('a Mb', 2, 3, ''), { extendStart: 0, extendEnd: 0 });
});

test('collapseAdjustment: marker at a document edge does not collapse', () => {
  assert.deepEqual(collapseAdjustment('M b', 0, 1, ''), { extendStart: 0, extendEnd: 0 });
  assert.deepEqual(collapseAdjustment('a M', 2, 3, ''), { extendStart: 0, extendEnd: 0 });
});

test('collapseAdjustment: blank line mid-document eats the line + trailing break', () => {
  // 'foo\nM\nbaz' → remove [4,6) ("M\n") → 'foo\nbaz'
  assert.deepEqual(collapseAdjustment('foo\nM\nbaz', 4, 5, ''), { extendStart: 0, extendEnd: 1 });
});

test('collapseAdjustment: blank line eats surrounding indentation too', () => {
  // 'foo\n\t M \nbaz' → remove [4,9) ("\t M \n") → 'foo\nbaz'
  assert.deepEqual(collapseAdjustment('foo\n\t M \nbaz', 6, 7, ''), { extendStart: 2, extendEnd: 2 });
});

test('collapseAdjustment: blank line on the last line eats the preceding break', () => {
  // 'foo\nM' → remove [3,5) ("\nM") → 'foo'
  assert.deepEqual(collapseAdjustment('foo\nM', 4, 5, ''), { extendStart: 1, extendEnd: 0 });
});

test('collapseAdjustment: marker as the only line has no break to remove', () => {
  assert.deepEqual(collapseAdjustment('M', 0, 1, ''), { extendStart: 0, extendEnd: 0 });
});

test('collapseAdjustment: a marker with content on its line is left exact', () => {
  // line-leading marker followed by text is not an orphan, and 'before' is a newline.
  assert.deepEqual(collapseAdjustment('foo\nM bar', 4, 5, ''), { extendStart: 0, extendEnd: 0 });
});
