// Must install the vscode stub before importing filesView (which pulls in
// modules that `import * as vscode`).
import './vscodeStub';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { countMarkers, buildFileTree, FileTreeFolder, FileTreeItem } from './filesView';

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

// Helper: assert a node is a folder and return it narrowed.
function folder(node: FileTreeItem): FileTreeFolder {
  assert.equal(node.kind, 'folder');
  return node as FileTreeFolder;
}

test('buildFileTree: a root-level file (no folder) stays a top-level leaf', () => {
  const tree = buildFileTree([{ path: 'README.md', count: 2 }]);
  assert.equal(tree.length, 1);
  assert.deepEqual(tree[0], { kind: 'file', name: 'README.md', path: 'README.md', count: 2 });
});

test('buildFileTree: a single nested file builds the folder chain', () => {
  const tree = buildFileTree([{ path: 'docs/api/auth.mdx', count: 3 }]);
  assert.equal(tree.length, 1);
  const docs = folder(tree[0]);
  assert.equal(docs.name, 'docs');
  assert.equal(docs.path, 'docs');
  const api = folder(docs.children[0]);
  assert.equal(api.name, 'api');
  assert.equal(api.path, 'docs/api');
  assert.deepEqual(api.children[0], { kind: 'file', name: 'auth.mdx', path: 'docs/api/auth.mdx', count: 3 });
});

test('buildFileTree: folder counts aggregate descendants up the tree', () => {
  const tree = buildFileTree([
    { path: 'docs/api/auth.mdx', count: 3 },
    { path: 'docs/guide/intro.mdx', count: 2 },
    { path: 'src/parser.ts', count: 1 },
  ]);
  const docs = folder(tree.find(n => n.name === 'docs')!);
  assert.equal(docs.count, 5); // 3 + 2
  const src = folder(tree.find(n => n.name === 'src')!);
  assert.equal(src.count, 1);
  const api = folder(docs.children.find(n => n.name === 'api')!);
  assert.equal(api.count, 3);
});

test('buildFileTree: each level sorts folders before files, alphabetically', () => {
  const tree = buildFileTree([
    { path: 'zebra.md', count: 1 },
    { path: 'beta/x.md', count: 1 },
    { path: 'alpha/y.md', count: 1 },
    { path: 'apple.md', count: 1 },
  ]);
  // Folders (alpha, beta) come first, then files (apple.md, zebra.md).
  assert.deepEqual(
    tree.map(n => `${n.kind}:${n.name}`),
    ['folder:alpha', 'folder:beta', 'file:apple.md', 'file:zebra.md'],
  );
});

test('buildFileTree: empty input yields no nodes', () => {
  assert.deepEqual(buildFileTree([]), []);
});
