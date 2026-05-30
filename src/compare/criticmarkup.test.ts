// Tests for the CriticMarkup renderer.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { render } from './criticmarkup';
import { diff } from './diff';

test('renders each op type with the correct marker', () => {
  const out = render([
    { type: 'equal', text: 'keep ' },
    { type: 'delete', text: 'old' },
    { type: 'insert', text: 'new' },
    { type: 'replace', before: 'a', after: 'b' },
  ]);
  assert.equal(out, 'keep {--old--}{++new++}{~~a~>b~~}');
});

test('skips empty delete and insert runs', () => {
  assert.equal(render([{ type: 'delete', text: '' }]), '');
  assert.equal(render([{ type: 'insert', text: '' }]), '');
});

test('equal text passes through verbatim', () => {
  assert.equal(render([{ type: 'equal', text: 'untouched\ttext\n' }]), 'untouched\ttext\n');
});

test('end-to-end: diff then render produces expected CriticMarkup', () => {
  assert.equal(
    render(diff('The quick brown fox', 'The slow brown cat', 'word', true)),
    'The {~~quick~>slow~~} brown {~~fox~>cat~~}',
  );
  assert.equal(
    render(diff('The quick brown fox', 'The slow brown cat', 'word', false)),
    'The {--quick--}{++slow++} brown {--fox--}{++cat++}',
  );
});
