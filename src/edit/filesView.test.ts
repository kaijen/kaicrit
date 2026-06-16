// Must install the vscode stub before importing filesView (which pulls in
// modules that `import * as vscode`).
import './vscodeStub';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { countMarkers } from './filesView';

test('countMarkers: marker-free text counts nothing', () => {
  assert.equal(countMarkers(''), 0);
  assert.equal(countMarkers('plain prose with no markers'), 0);
  // Has a brace but no real marker — exercises the indexOf('{') fast path then
  // the regex, which finds nothing.
  assert.equal(countMarkers('code { json: true }'), 0);
});

test('countMarkers: counts each of the five marker types', () => {
  assert.equal(countMarkers('{--del--}'), 1);
  assert.equal(countMarkers('{++add++}'), 1);
  assert.equal(countMarkers('{~~old~>new~~}'), 1);
  assert.equal(countMarkers('{==hi==}'), 1);
  assert.equal(countMarkers('{>>note<<}'), 1);
});

test('countMarkers: counts multiple markers across the text', () => {
  const text = 'a {++add++} b {--del--} c {~~o~>n~~} d {==h==} e {>>note<<} f';
  assert.equal(countMarkers(text), 5);
});

test('countMarkers: arrow-less substitution is not a marker (matches the parser)', () => {
  // {~~...~~} without ~> is neither a substitution nor a deletion per the spec,
  // so RE_ALL ignores it.
  assert.equal(countMarkers('{~~nochange~~}'), 0);
});

test('countMarkers: matches across newlines (multi-line comment)', () => {
  assert.equal(countMarkers('{>>line one\nline two<<}'), 1);
});
