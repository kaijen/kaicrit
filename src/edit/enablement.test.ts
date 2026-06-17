// Must install the vscode stub before importing enablement (which does
// `import * as vscode`).
import './vscodeStub';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { matchAssociation, builtinLanguageForBase } from './enablement';

test('matchAssociation: `*.ext` matches by extension, anywhere', () => {
  assert.equal(matchAssociation('*.md', 'README.md'), true);
  assert.equal(matchAssociation('*.md', 'page.de-DE.md'), true);
  assert.equal(matchAssociation('*.md', 'notes.txt'), false);
});

test('matchAssociation: `**/*.ext` matches by extension too', () => {
  assert.equal(matchAssociation('**/*.mdx', 'guide.mdx'), true);
  assert.equal(matchAssociation('**/*.mdx', 'guide.md'), false);
});

test('matchAssociation: an exact file name matches only that name', () => {
  assert.equal(matchAssociation('Dockerfile', 'Dockerfile'), true);
  assert.equal(matchAssociation('Dockerfile', 'Dockerfile.dev'), false);
});

test('matchAssociation: complex globs are left to VS Code (no match here)', () => {
  // Path-bearing or mid-pattern globs aren't handled — they fall through to the
  // contributed-language extension match instead.
  assert.equal(matchAssociation('src/**/*.ts', 'main.ts'), false);
  assert.equal(matchAssociation('Dockerfile.*', 'Dockerfile.dev'), false);
});

test('builtinLanguageForBase: resolves the default prose extensions', () => {
  // The fallback that keeps the workspace scan honouring `.md`/`.txt` even when
  // the language-basics extension isn't enumerable (Remote/Server/WSL).
  assert.equal(builtinLanguageForBase('README.md'), 'markdown');
  assert.equal(builtinLanguageForBase('page.de-DE.markdown'), 'markdown');
  assert.equal(builtinLanguageForBase('NOTES.MD'), 'markdown');
  assert.equal(builtinLanguageForBase('notes.txt'), 'plaintext');
});

test('builtinLanguageForBase: unknown / extension-less names stay unresolved', () => {
  assert.equal(builtinLanguageForBase('main.ts'), undefined);
  assert.equal(builtinLanguageForBase('Makefile'), undefined);
  assert.equal(builtinLanguageForBase('.gitignore'), undefined);
});
