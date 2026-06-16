// Must install the vscode stub before importing enablement (which does
// `import * as vscode`).
import './vscodeStub';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { matchAssociation } from './enablement';

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
