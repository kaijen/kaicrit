// Tests for the CriticMarkup edit parser. Run with `npm test` (Node's runner).
//
// parser.ts imports the VS Code API; ./vscodeStub installs a `require('vscode')`
// shim and MUST be imported first (TypeScript keeps CommonJS import order), so
// the parser binds to the fake Range/Position/workspace below instead of failing
// to load outside an Extension Host.
import { TextDocument, setConfig, resetConfig } from './vscodeStub';
import { test, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseCriticMarkup } from './parser';
import { ChangeType } from '../core/types';

// parser.ts reads kaicrit.edit.commentMetadata; default it to enabled (the
// extension's own default) unless a test overrides it.
beforeEach(() => {
  resetConfig();
  setConfig('edit.commentMetadata', true);
});

/** Parse `text` through a fake document and return the changes. */
function parse(text: string) {
  return parseCriticMarkup(new TextDocument(text) as any);
}

/** UTF-16 offset of a range endpoint, recovered via the fake document. */
function offset(text: string, pos: { line: number; character: number }): number {
  return new TextDocument(text).offsetAt(pos as any);
}

test('empty document with no brace parses to nothing (cheap pre-check)', () => {
  assert.deepEqual(parse('plain text, no markers'), []);
});

test('all five marker types are recognised', () => {
  const changes = parse('{--d--}{++a++}{~~o~>n~~}{==h==}{>>c<<}');
  assert.deepEqual(changes.map(c => c.type), [
    ChangeType.Deletion,
    ChangeType.Addition,
    ChangeType.Substitution,
    ChangeType.Highlight,
    ChangeType.Comment,
  ]);
});

test('deletion / addition / highlight extract content text', () => {
  assert.equal(parse('{--gone--}')[0].text, 'gone');
  assert.equal(parse('{++new++}')[0].text, 'new');
  assert.equal(parse('{==hl==}')[0].text, 'hl');
});

test('substitution extracts old + new and sub-ranges', () => {
  const text = '{~~old~>new~~}';
  const [c] = parse(text);
  assert.equal(c.type, ChangeType.Substitution);
  assert.equal(c.oldText, 'old');
  assert.equal(c.newText, 'new');
  // {~~ = 3, old = 3 → oldRange [3,6); ~> = 2 → newRange [8,11)
  assert.equal(offset(text, c.oldRange!.start), 3);
  assert.equal(offset(text, c.oldRange!.end), 6);
  assert.equal(offset(text, c.newRange!.start), 8);
  assert.equal(offset(text, c.newRange!.end), 11);
});

test('comment carries metadata when present and enabled', () => {
  const [c] = parse('{>>@kai 2026-05-31: needs work<<}');
  assert.equal(c.type, ChangeType.Comment);
  assert.equal(c.author, 'kai');
  assert.equal(c.date, '2026-05-31');
});

test('plain comment carries neither author nor date', () => {
  const [c] = parse('{>>just a note<<}');
  assert.equal(c.author, undefined);
  assert.equal(c.date, undefined);
});

test('metadata is not extracted when commentMetadata is disabled', () => {
  setConfig('edit.commentMetadata', false);
  const [c] = parse('{>>@kai 2026-05-31: text<<}');
  assert.equal(c.author, undefined);
  assert.equal(c.date, undefined);
  // The full body (prefix included) is still the comment text.
  assert.equal(c.text, '@kai 2026-05-31: text');
});

test('adjacent markers are parsed as separate changes with correct ranges', () => {
  const text = '{--a--}{++b++}';
  const changes = parse(text);
  assert.equal(changes.length, 2);
  assert.equal(offset(text, changes[0].fullRange.start), 0);
  assert.equal(offset(text, changes[0].fullRange.end), 7);
  assert.equal(offset(text, changes[1].fullRange.start), 7);
  assert.equal(offset(text, changes[1].fullRange.end), 14);
});

test('empty content markers are still recognised', () => {
  assert.equal(parse('{----}')[0].type, ChangeType.Deletion);
  assert.equal(parse('{----}')[0].text, '');
  assert.equal(parse('{++++}')[0].text, '');
  assert.equal(parse('{====}')[0].text, '');
  assert.equal(parse('{>><<}')[0].text, '');
});

test('substitution with an empty side is recognised', () => {
  const ins = parse('{~~~>new~~}')[0];
  assert.equal(ins.type, ChangeType.Substitution);
  assert.equal(ins.oldText, '');
  assert.equal(ins.newText, 'new');

  const del = parse('{~~old~>~~}')[0];
  assert.equal(del.oldText, 'old');
  assert.equal(del.newText, '');
});

test('arrow-less {~~x~~} is ignored (matches RE_ALL / the preview)', () => {
  assert.deepEqual(parse('{~~x~~}'), []);
});

test('multi-line comment spans newlines', () => {
  const [c] = parse('{>>line1\nline2<<}');
  assert.equal(c.type, ChangeType.Comment);
  assert.equal(c.text, 'line1\nline2');
});

test('offsets are correct in UTF-16 code units before a marker (surrogate pair)', () => {
  // '😀' is two UTF-16 code units, so the marker starts at offset 2.
  const text = '😀{--x--}';
  const [c] = parse(text);
  assert.equal(c.text, 'x');
  assert.equal(offset(text, c.fullRange.start), 2);
  assert.equal(offset(text, c.fullRange.end), text.length);
});

test('offsets are correct with a surrogate pair inside the marker', () => {
  const text = '{--😀--}';
  const [c] = parse(text);
  assert.equal(c.text, '😀');
  // content [3, 3+2) because the emoji is two code units
  assert.equal(offset(text, c.contentRange!.start), 3);
  assert.equal(offset(text, c.contentRange!.end), 5);
  assert.equal(offset(text, c.fullRange.end), 8);
});
