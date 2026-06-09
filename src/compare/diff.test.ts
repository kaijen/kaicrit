// Tests for the diff engine. Run with `npm test` (Node's built-in test runner).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { diff, tokenize, DiffOp, DiffTooLargeError, Granularity } from './diff';

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

test('word tokenization keeps Unicode letters inside their word (issue #55)', () => {
  // ASCII-only \w would split these into single "other" characters; the Unicode
  // property classes keep umlauts, ß and accents inside the word.
  assert.deepEqual(tokenize('schön', 'word'), ['schön']);
  assert.deepEqual(tokenize('Müller', 'word'), ['Müller']);
  assert.deepEqual(tokenize('Straße café', 'word'), ['Straße', ' ', 'café']);
  // Digits stay attached too, punctuation still splits off.
  assert.deepEqual(tokenize('über99!', 'word'), ['über99', '!']);
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

test('ignoreWhitespace does not mark pure whitespace-amount differences', () => {
  for (const granularity of GRANULARITIES) {
    const ops = diff('the  quick   fox', 'the quick fox', granularity, true, true);
    assert.ok(
      !ops.some((op) => op.type !== 'equal'),
      `expected no markers for whitespace-only diff (${granularity})`,
    );
  }
});

test('ignoreWhitespace still preserves file 1 on reject (strong invariant)', () => {
  for (const [a, b] of SAMPLES) {
    for (const granularity of GRANULARITIES) {
      for (const combine of [true, false]) {
        const ops = diff(a, b, granularity, combine, true);
        assert.equal(
          rejectAll(ops),
          a,
          `reject-all should yield file 1 with ignoreWhitespace (${granularity}, combine=${combine}, ${JSON.stringify(a)})`,
        );
      }
    }
  }
});

test('ignoreWhitespace still reports genuine content changes', () => {
  const ops = diff('the quick fox', 'the slow fox', 'word', true, true);
  assert.ok(
    ops.some((op) => op.type === 'replace' || op.type === 'delete' || op.type === 'insert'),
    'a real word change must still be marked even when ignoring whitespace',
  );
});

test('ignoreWhitespace ignores indentation differences at line granularity', () => {
  const ops = diff('    code\n', 'code\n', 'line', true, true);
  assert.ok(
    !ops.some((op) => op.type !== 'equal'),
    'a line that differs only by leading whitespace should not be marked',
  );
});

test('ignoreWhitespace=false (default) still marks whitespace differences', () => {
  const ops = diff('a  b', 'a b', 'word', true);
  assert.ok(
    ops.some((op) => op.type !== 'equal'),
    'with ignoreWhitespace off, a whitespace change is a normal diff',
  );
});

test('size guard throws DiffTooLargeError when the token product exceeds the limit', () => {
  // Two fully different inputs whose token product exceeds a small limit.
  const a = 'a '.repeat(40); // ~80 tokens at word granularity
  const b = 'x '.repeat(40);
  assert.throws(
    () => diff(a, b, 'word', true, false, 100),
    (error: unknown) => {
      assert.ok(error instanceof DiffTooLargeError, 'should be a DiffTooLargeError');
      assert.ok(error.tokenProduct > error.limit, 'reports the offending product');
      assert.equal(error.limit, 100);
      return true;
    },
  );
});

test('size guard leaves small inputs untouched (under the limit)', () => {
  const ops = diff('the quick fox', 'the slow fox', 'word', true, false, 1_000_000);
  assert.ok(ops.length > 0, 'a normal diff still runs under the limit');
  assert.ok(
    ops.some((op) => op.type !== 'equal'),
    'the genuine change is still reported',
  );
});

test('size guard is disabled when maxDiffTokens is 0 (default)', () => {
  const a = 'a '.repeat(200);
  const b = 'x '.repeat(200);
  // No limit passed → defaults to 0 → no guard, must not throw.
  assert.doesNotThrow(() => diff(a, b, 'word', true));
  assert.doesNotThrow(() => diff(a, b, 'word', true, false, 0));
});

test('coarser granularity stays under a limit that a finer one would exceed', () => {
  // Many short, fully different lines: word/character products are huge, but
  // the line-token product is small — this is exactly the auto fall-back path.
  const a = Array.from({ length: 50 }, (_, i) => `alpha line ${i}`).join('\n');
  const b = Array.from({ length: 50 }, (_, i) => `omega line ${i}`).join('\n');
  const limit = 5_000;
  assert.throws(() => diff(a, b, 'word', true, false, limit), DiffTooLargeError);
  assert.doesNotThrow(() => diff(a, b, 'line', true, false, limit));
});
