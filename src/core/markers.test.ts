import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { findMarkers, RE_ALL } from './markers';

// Shape of one marker hit, reduced to the fields every consumer reads
// (index, full match, the six capture slots). Used to compare the linear scanner
// against the RE_ALL reference match-for-match.
function snapshot(m: RegExpExecArray): (string | number | undefined)[] {
  return [m.index, m[0], m[1], m[2], m[3], m[4], m[5], m[6]];
}

function scanner(text: string): (string | number | undefined)[][] {
  return [...findMarkers(text)].map(snapshot);
}

// Reference: drive RE_ALL itself (the grammar spec) over the same input.
function reference(text: string): (string | number | undefined)[][] {
  return [...text.matchAll(RE_ALL)].map(m => snapshot(m as RegExpExecArray));
}

// ── Differential equivalence: findMarkers ≡ RE_ALL ─────────────────────────────

const CORPUS: string[] = [
  '',
  'plain text, no markers',
  '{', '{{', '{-', '{--', '{++', '{~~', '{==', '{>>',
  '{--a--}', '{++a++}', '{==a==}', '{>>a<<}', '{~~a~>b~~}',
  '{----}', '{++++}', '{====}', '{>><<}', '{~~~>~~}',          // empty contents
  '{~~~>x~~}', '{~~o~>~~}',                                     // empty old / empty new
  'pre {--del--} mid {++add++} post',
  'two {==a==}{==b==} adjacent',
  '{--a--b--}',                                                 // lazy: first closer wins
  '{++ {--inner--} ++}',                                        // inner marker is content, skipped
  '{{--a--}',                                                   // opener prefixed by a stray '{'
  '{--a',                                                       // unterminated deletion
  '{~~a~>b',                                                    // unterminated substitution (has ~>)
  '{~~no arrow here~~}',                                        // no ~> ⇒ not a substitution
  '{~~a~>b~~ c~>d~~}',                                          // first ~> spans to final closer
  '{--line1\nline2--}',                                         // multiline (s-flag)
  '{>>@kai 2026-06-26: note<<}',
  '{--a--} trailing {++unfinished',
  'mix {~~old~>new~~} and {==hi==} and {>>c<<} end',
  '}{--a--}{',
  '{--a--}{++b++}{~~c~>d~~}{==e==}{>>f<<}',
  'nested-ish {--a {++b++} c--}',                               // first --} closes, inner ++ is content
];

for (const [i, input] of CORPUS.entries()) {
  test(`findMarkers ≡ RE_ALL on corpus #${i}: ${JSON.stringify(input).slice(0, 40)}`, () => {
    assert.deepEqual(scanner(input), reference(input));
  });
}

// ── A few explicit assertions on the result shape ──────────────────────────────

test('deletion fills only group 1', () => {
  const [m] = [...findMarkers('{--x--}')];
  assert.equal(m.index, 0);
  assert.equal(m[0], '{--x--}');
  assert.equal(m[1], 'x');
  assert.equal(m[2], undefined);
  assert.equal(m[3], undefined);
});

test('substitution fills groups 3 and 4', () => {
  const [m] = [...findMarkers('{~~old~>new~~}')];
  assert.equal(m[3], 'old');
  assert.equal(m[4], 'new');
  assert.equal(m[1], undefined);
  assert.equal(m[5], undefined);
});

test('empty deletion content is "" not undefined', () => {
  const [m] = [...findMarkers('{----}')];
  assert.equal(m[1], '');
});

// ── Termination / performance guard ────────────────────────────────────────────
//
// These inputs froze the old RE_ALL scan (O(n²)): a stray unterminated opener
// plus a large tail. The linear scanner is O(n); assert it completes well under a
// second. If it ever regresses to O(n²) this takes ~12s+ and trips the threshold.

test('many unterminated {~~ openers scan in O(n) (no host freeze)', () => {
  const pathological = '{~~'.repeat(20000) + '~>'.repeat(20000);
  const t0 = process.hrtime.bigint();
  const found = [...findMarkers(pathological)];
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(found.length, 0);
  assert.ok(ms < 1000, `scan took ${ms.toFixed(0)}ms — expected O(n)`);
});

test('large prose with one stray {~~ scans fast', () => {
  const pathological = '{~~' + 'lorem ~ ipsum {dolor} ~> sit amet. '.repeat(20000);
  const t0 = process.hrtime.bigint();
  const found = [...findMarkers(pathological)];
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(found.length, 0);
  assert.ok(ms < 1000, `scan took ${ms.toFixed(0)}ms — expected O(n)`);
});

test('a real marker after a long unterminated opener is still found', () => {
  const text = '{~~' + 'x'.repeat(100000) + ' {++added++}';
  const found = [...findMarkers(text)];
  assert.equal(found.length, 1);
  assert.equal(found[0][2], 'added');
});
