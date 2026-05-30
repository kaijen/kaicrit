// Tests for the diff engine. Run with `npm test` (Node's built-in test runner).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { diff, tokenize, DiffOp, Granularity } from './diff';

/** Reconstruct file 1 by rejecting every marker. */
function rejectAll(ops: DiffOp[]): string {
  return ops
    .map((op) => {
      switch (op.type) {
        case 'equal':
          return op.text;
        case 'delete':
          return op.text;
        case 'replace':
          return op.before;
        case 'insert':
          return '';
      }
    })
    .join('');
}

/** Reconstruct file 2 by accepting every marker. */
function acceptAll(ops: DiffOp[]): string {
  return ops
    .map((op) => {
      switch (op.type) {
        case 'equal':
          return op.text;
        case 'insert':
          return op.text;
        case 'replace':
          return op.after;
        case 'delete':
          return '';
      }
    })
    .join('');
}

const SAMPLES: Array<[string, string]> = [
  ['The quick brown fox', 'The slow brown cat'],
  ['line one\nline two\nline three\n', 'line one\nline 2\nline three\n'],
  ['abcdef', 'abXdef'],
  ['Hello world', 'Hello world'],
  ['', 'brand new text'],
  ['delete me entirely', ''],
  ['a b c d e', 'a x c y e'],
  ['', ''],
  ['one\ntwo\n', 'zero\none\ntwo\nthree\n'],
  ['tabs\tand  spaces', 'tabs\tand spaces'],
];

const GRANULARITIES: Granularity[] = ['character', 'word', 'line'];

test('reconstruction invariant holds for every sample and granularity', () => {
  for (const [a, b] of SAMPLES) {
    for (const granularity of GRANULARITIES) {
      for (const combine of [true, false]) {
        const ops = diff(a, b, granularity, combine);
        assert.equal(
          rejectAll(ops),
          a,
          `reject-all should yield file 1 (${granularity}, combine=${combine}, ${JSON.stringify(a)})`,
        );
        assert.equal(
          acceptAll(ops),
          b,
          `accept-all should yield file 2 (${granularity}, combine=${combine}, ${JSON.stringify(b)})`,
        );
      }
    }
  }
});

test('identical files produce only equal ops', () => {
  const ops = diff('same text here', 'same text here', 'word', true);
  assert.deepEqual(ops, [{ type: 'equal', text: 'same text here' }]);
});

test('combineSubstitutions merges adjacent delete + insert into replace', () => {
  const combined = diff('The quick fox', 'The slow fox', 'word', true);
  assert.ok(combined.some((op) => op.type === 'replace'));
  assert.ok(!combined.some((op) => op.type === 'delete' || op.type === 'insert'));

  const separate = diff('The quick fox', 'The slow fox', 'word', false);
  assert.ok(separate.some((op) => op.type === 'delete'));
  assert.ok(separate.some((op) => op.type === 'insert'));
  assert.ok(!separate.some((op) => op.type === 'replace'));
});

test('pure insertion yields a single insert op', () => {
  const ops = diff('', 'all new', 'word', true);
  assert.deepEqual(ops, [{ type: 'insert', text: 'all new' }]);
});

test('pure deletion yields a single delete op', () => {
  const ops = diff('gone', '', 'word', true);
  assert.deepEqual(ops, [{ type: 'delete', text: 'gone' }]);
});

test('word tokenization preserves whitespace as standalone tokens', () => {
  assert.deepEqual(tokenize('a  b', 'word'), ['a', '  ', 'b']);
  assert.deepEqual(tokenize('hi!', 'word'), ['hi', '!']);
});

test('line tokenization keeps terminators and is lossless', () => {
  const text = 'a\n\nb';
  const tokens = tokenize(text, 'line');
  assert.deepEqual(tokens, ['a\n', '\n', 'b']);
  assert.equal(tokens.join(''), text);
});

test('character tokenization handles surrogate pairs without splitting', () => {
  const tokens = tokenize('a😀b', 'character');
  assert.deepEqual(tokens, ['a', '😀', 'b']);
});
