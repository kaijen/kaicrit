// Tests for the pure CodeLens/Hover string builders. VS Code-free, so these run
// without an Extension Host (and without the vscode stub).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { shortText, actionHoverMarkdown } from './actions';

test('shortText: collapses whitespace and newlines to single spaces', () => {
  assert.equal(shortText('one   two\n\tthree'), 'one two three');
});

test('shortText: trims surrounding whitespace', () => {
  assert.equal(shortText('  hi  '), 'hi');
});

test('shortText: truncates with an ellipsis past max (default 18)', () => {
  assert.equal(shortText('impossible for God on this planet'), 'impossible for God…');
});

test('shortText: keeps strings at or below max unchanged', () => {
  assert.equal(shortText('short', 18), 'short');
  assert.equal(shortText('exactly eighteen!!', 18), 'exactly eighteen!!');
});

test('actionHoverMarkdown: both command links with the exact encoded position arg', () => {
  const md = actionHoverMarkdown({ line: 3, character: 5 });
  const enc = encodeURIComponent(JSON.stringify([{ line: 3, character: 5 }]));
  assert.ok(md.includes(`command:kaicrit.acceptChangeAt?${enc}`));
  assert.ok(md.includes(`command:kaicrit.rejectChangeAt?${enc}`));
  assert.ok(md.includes('$(check) Accept'));
  assert.ok(md.includes('$(x) Reject'));
});
