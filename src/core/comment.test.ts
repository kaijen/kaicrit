import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseCommentMeta } from './comment';

test('extracts author and date', () => {
  const m = parseCommentMeta('@kai 2026-05-31: needs a source');
  assert.equal(m.author, 'kai');
  assert.equal(m.date, '2026-05-31');
  assert.equal(m.body, 'needs a source');
});

test('extracts author without a date', () => {
  const m = parseCommentMeta('@kai: looks good');
  assert.equal(m.author, 'kai');
  assert.equal(m.date, undefined);
  assert.equal(m.body, 'looks good');
});

test('extracts date without an author', () => {
  const m = parseCommentMeta('2026-05-31: revisit later');
  assert.equal(m.author, undefined);
  assert.equal(m.date, '2026-05-31');
  assert.equal(m.body, 'revisit later');
});

test('a plain comment carries no metadata', () => {
  const m = parseCommentMeta('just a plain comment');
  assert.equal(m.author, undefined);
  assert.equal(m.date, undefined);
  assert.equal(m.body, 'just a plain comment');
  assert.equal(m.bodyOffset, 0);
});

test('a colon in prose is not treated as metadata', () => {
  const m = parseCommentMeta('Note: fix this');
  assert.equal(m.author, undefined);
  assert.equal(m.date, undefined);
  assert.equal(m.body, 'Note: fix this');
});

test('an author without a colon is not metadata', () => {
  const m = parseCommentMeta('@kai needs a source');
  assert.equal(m.author, undefined);
  assert.equal(m.date, undefined);
  assert.equal(m.body, '@kai needs a source');
});

test('bodyOffset locates the body after the prefix', () => {
  const content = '@kai 2026-05-31: text';
  const m = parseCommentMeta(content);
  assert.equal(content.slice(m.bodyOffset), m.body);
});

test('metadata survives a multi-line body', () => {
  const m = parseCommentMeta('@kai 2026-05-31: line one\nline two');
  assert.equal(m.author, 'kai');
  assert.equal(m.body, 'line one\nline two');
});
