// Tests for the accept/reject mapping. The logic is VS Code-free, so these run
// without an Extension Host (and without the vscode stub).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveReplacement } from './resolve';
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
