import * as vscode from 'vscode';
import { findMarkers } from '../core/markers';
import { DecoratorManager } from './decorator';
import { parseCriticMarkup } from './parser';

// Which files the overview lists. `"open"` counts only the documents currently
// open in the editor (cheap, reads the decorator cache / in-memory text);
// `"workspace"` additionally scans every file on disk in the workspace
// (heavier, reads files lazily). Default is `"open"`.
export type FilesScope = 'open' | 'workspace';

// How the overview presents the files. `"list"` is the flat, name-only list
// (the path shows on hover); `"tree"` is a collapsible folder tree mirroring the
// directory structure. Default is `"list"`.
export type FilesDisplayMode = 'list' | 'tree';

// workspaceState key holding the set of folder paths the user has manually
// collapsed in tree mode. Folders default to expanded, so we persist only the
// exceptions.
const COLLAPSED_FOLDERS_KEY = 'kaicrit.files.collapsedFolders';

// Debounce for the (potentially expensive) refresh: a burst of edits / opens /
// closes coalesces into a single re-scan instead of one per event.
const REFRESH_DEBOUNCE_MS = 300;
// Upper bound for the workspace scan so a huge repository can't lock up the
// extension host with file I/O.
const MAX_WORKSPACE_FILES = 5000;
// Skip files larger than this many bytes/characters in the scan — they are
// almost certainly not prose CriticMarkup, and counting markers in them would
// risk the marker regex's O(n²) worst case (mirrors `kaicrit.edit.maxParseLength`).
const MAX_FILE_LENGTH = 2_000_000;

interface FileEntry {
  uri: vscode.Uri;
  count: number;
}

/**
 * One file that contains CriticMarkup changes. The label is the file name, the
 * description carries the change count, and clicking it opens the file. The
 * `resourceUri` gives it the theme's file-type icon.
 */
class FileNode extends vscode.TreeItem {
  constructor(readonly entry: FileEntry) {
    super(basenameOf(entry.uri), vscode.TreeItemCollapsibleState.None);
    this.resourceUri = entry.uri;
    this.description = `${entry.count}`;
    const rel = vscode.workspace.asRelativePath(entry.uri);
    this.tooltip = `${rel} — ${entry.count} CriticMarkup change${entry.count === 1 ? '' : 's'}`;
    this.contextValue = 'kaicrit.file';
    this.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [entry.uri],
    };
  }
}

/**
 * A folder in the tree-mode view, holding its already-built child nodes. The
 * label is the folder's path segment; the description carries the aggregate
 * change count of all files beneath it. Default state is expanded — a folder
 * only exists here because it leads to a changed file — unless the user has
 * collapsed it (tracked by `folderPath`).
 */
class FolderNode extends vscode.TreeItem {
  constructor(
    readonly folderPath: string,
    name: string,
    count: number,
    readonly children: FilesNode[],
    collapsed: boolean,
  ) {
    super(name, collapsed
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.Expanded);
    this.id = folderPath;
    this.iconPath = vscode.ThemeIcon.Folder;
    this.description = `${count}`;
    this.tooltip = `${folderPath} — ${count} CriticMarkup change${count === 1 ? '' : 's'}`;
    this.contextValue = 'kaicrit.folder';
  }
}

// A node in the Files view: a folder (tree mode) or a file leaf (both modes).
type FilesNode = FileNode | FolderNode;

/**
 * Lists every file that contains CriticMarkup changes, with a per-file change
 * count, in a dedicated sidebar view above the per-file Changes list. Clicking
 * a file opens it.
 *
 * Two scopes, switched by the scope button in the view title (and persisted in
 * `kaicrit.files.scope`): `"open"` lists the open documents (read from the
 * decorator's change cache or a direct parse) **plus** the files Git reports as
 * changed in the working tree (read from disk), so an unsaved review set shows
 * even for files not currently open; `"workspace"` additionally scans every file
 * on disk via `findFiles` + `fs.readFile`. Both honour the enablement gate and
 * prefer the in-memory text of any open (possibly unsaved) document.
 *
 * Refreshes — debounced — on the decorator's `onDidUpdate`, document
 * open/close/save, a Git working-tree change (open scope), and a
 * `kaicrit.files.scope` / `kaicrit.enabledLanguages` config change; the view
 * title also offers a manual Refresh.
 */
export class FilesTreeProvider implements vscode.TreeDataProvider<FilesNode>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  // Folder paths the user has manually collapsed in tree mode (default is
  // expanded), seeded from and written back to workspaceState so the layout
  // survives a refresh and a reload.
  private readonly collapsed: Set<string>;
  // Lazily-activated built-in Git extension API (untyped — it ships no type
  // defs, same as `compare/commands.ts`). Used by the open scope to list
  // working-tree-changed files alongside the open documents.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private gitApi: any;
  // Re-entrancy guard for `initGit` only — NOT a permanent latch: a failed or
  // too-early init (Git extension not yet registered) leaves it false so a later
  // scan / `onDidChange` retries (issue: closed git-modified files never listed).
  private gitInitInFlight = false;

  constructor(
    private readonly dm: DecoratorManager,
    private readonly isEnabled: (doc: vscode.TextDocument) => boolean,
    private readonly isUriEnabled: (uri: vscode.Uri) => boolean,
    private readonly state: vscode.Memento,
  ) {
    this.collapsed = new Set(state.get<string[]>(COLLAPSED_FOLDERS_KEY, []));
    this.syncScopeContext();
    this.syncDisplayModeContext();
    this.disposables.push(
      // A document's change set was re-parsed (typing, accept/reject) → counts
      // may have changed.
      this.dm.onDidUpdate(() => this.scheduleRefresh()),
      vscode.workspace.onDidOpenTextDocument(() => this.scheduleRefresh()),
      vscode.workspace.onDidCloseTextDocument(() => this.scheduleRefresh()),
      // In the workspace scope the disk copy is what gets re-read, so a save can
      // change the count even when no decorator update fired.
      vscode.workspace.onDidSaveTextDocument(() => this.scheduleRefresh()),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('kaicrit.files.scope')) {
          this.syncScopeContext();
          this.refresh();
        } else if (e.affectsConfiguration('kaicrit.files.displayMode')) {
          this.syncDisplayModeContext();
          this.refresh();
        } else if (e.affectsConfiguration('kaicrit.enabledLanguages')
          || e.affectsConfiguration('files.associations')) {
          // Both halves of the list are enablement-gated, so a whitelist edit —
          // or a `files.associations` change that re-maps a file's language —
          // can add or drop files.
          this.refresh();
        }
      }),
      // Recover the open scope's Git half if `vscode.git` only becomes available
      // after the first scan (e.g. it activates after kaicrit's view first
      // renders at startup): retry the init, which fires its own refresh on
      // success. Without this, a too-early first `initGit` would leave the
      // Git-changed files silently absent until some unrelated event.
      vscode.extensions.onDidChange(() => { if (!this.gitApi) { void this.initGit(); } }),
    );
  }

  /** Force an immediate rebuild (used by the manual Refresh + scope toggle). */
  refresh(): void {
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); this.refreshTimer = undefined; }
    this._onDidChangeTreeData.fire();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this._onDidChangeTreeData.fire();
    }, REFRESH_DEBOUNCE_MS);
  }

  // Mirror the active scope into the `kaicrit.filesScopeIsWorkspace` context key
  // so the view title shows the right toggle button (open ⇄ workspace).
  private syncScopeContext(): void {
    vscode.commands.executeCommand('setContext', 'kaicrit.filesScopeIsWorkspace', scope() === 'workspace');
  }

  // Mirror the active display mode into the `kaicrit.filesDisplayIsTree` context
  // key so the view title shows the right toggle button (list ⇄ tree).
  private syncDisplayModeContext(): void {
    vscode.commands.executeCommand('setContext', 'kaicrit.filesDisplayIsTree', displayMode() === 'tree');
  }

  // Record a folder's manual expand/collapse so a refresh (or reload) keeps it,
  // instead of snapping every folder back to the expand-by-default state. Wired
  // to the TreeView's onDidExpand/onDidCollapse events in extension.ts; a no-op
  // for file leaves.
  setExpanded(node: FilesNode, expanded: boolean): void {
    if (!(node instanceof FolderNode)) { return; }
    if (expanded) { this.collapsed.delete(node.folderPath); }
    else { this.collapsed.add(node.folderPath); }
    void this.state.update(COLLAPSED_FOLDERS_KEY, [...this.collapsed]);
  }

  getTreeItem(node: FilesNode): vscode.TreeItem {
    return node;
  }

  async getChildren(element?: FilesNode): Promise<FilesNode[]> {
    if (element instanceof FolderNode) { return element.children; }
    if (element) { return []; }

    const entries = scope() === 'workspace'
      ? await this.scanWorkspace()
      : await this.scanOpen();

    if (displayMode() === 'tree') {
      return this.toTreeNodes(entries);
    }

    entries.sort((a, b) =>
      vscode.workspace.asRelativePath(a.uri).localeCompare(vscode.workspace.asRelativePath(b.uri)));
    return entries.map(e => new FileNode(e));
  }

  // Build the whole folder tree once (at the top level): convert the flat
  // entries to relative-path items, nest them with the pure `buildFileTree`, and
  // map the result to FolderNode/FileNode, recovering each file's entry by path.
  private toTreeNodes(entries: FileEntry[]): FilesNode[] {
    const byPath = new Map<string, FileEntry>();
    const items = entries.map(e => {
      const path = vscode.workspace.asRelativePath(e.uri);
      byPath.set(path, e);
      return { path, count: e.count };
    });
    const convert = (node: FileTreeItem): FilesNode => {
      if (node.kind === 'file') {
        return new FileNode(byPath.get(node.path)!);
      }
      return new FolderNode(
        node.path,
        node.name,
        node.count,
        node.children.map(convert),
        this.collapsed.has(node.path),
      );
    };
    return buildFileTree(items).map(convert);
  }

  // Activate the built-in Git extension and subscribe to working-tree changes so
  // the open scope refreshes live as files are modified, staged, or reverted
  // (even from outside the editor). Fire-and-forget: the first render may show
  // only the open documents; the post-init refresh fills in the Git-changed
  // files a moment later. Retry-capable, not a one-shot latch — if the Git
  // extension isn't registered yet (or activation throws) `gitApi` stays unset
  // and a later scan / the `extensions.onDidChange` listener retries; a no-op
  // (open scope = open docs only) while Git stays unavailable.
  private async initGit(): Promise<void> {
    // Already initialised, or an init is in flight — nothing to do. (No
    // permanent latch: the early-return paths below leave a retry open.)
    if (this.gitApi || this.gitInitInFlight) { return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ext = vscode.extensions.getExtension<any>('vscode.git');
    // Extension not registered yet (can happen if kaicrit's view renders before
    // `vscode.git` at startup) — do NOT latch; the next scan / `onDidChange`
    // retries.
    if (!ext) { return; }
    this.gitInitInFlight = true;
    try {
      const git = ext.isActive ? ext.exports : await ext.activate();
      const api = git.getAPI(1);
      this.gitApi = api;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const watch = (repo: any) =>
        this.disposables.push(repo.state.onDidChange(() => this.scheduleRefresh()));
      for (const repo of api.repositories) { watch(repo); }
      this.disposables.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        api.onDidOpenRepository((repo: any) => { watch(repo); this.scheduleRefresh(); }),
      );
      // Existing repos may already carry changes — show them on the next tick.
      this.scheduleRefresh();
    } catch {
      // Activation failed — leave `gitApi` unset so a later scan / `onDidChange`
      // can retry; open scope falls back to the open documents until then.
    } finally {
      this.gitInitInFlight = false;
    }
  }

  // Every file URI Git reports as changed in the working tree, across all repos
  // (modified, added, untracked, deleted, renamed — the user-chosen "all
  // working-tree changes"). Empty until `initGit` has resolved, or when Git is
  // unavailable.
  private gitModifiedUris(): vscode.Uri[] {
    const api = this.gitApi;
    if (!api) { return []; }
    const uris: vscode.Uri[] = [];
    for (const repo of api.repositories) {
      for (const change of repo.state.workingTreeChanges) {
        uris.push(change.uri);
      }
    }
    return uris;
  }

  // Open scope: the currently open documents **plus** the files Git reports as
  // changed in the working tree (modified, added, untracked, renamed, …). Open
  // documents use the decorator's warm cache where available (no re-parse) and
  // the per-file enablement override, so they mirror exactly what the per-file
  // Changes view sees; Git-changed files that aren't open are read from disk and
  // gated by `isUriEnabled` (language resolved from the path), like the
  // workspace scan. The two halves are deduped by URI (an open doc wins).
  private async scanOpen(): Promise<FileEntry[]> {
    void this.initGit();
    const byUri = new Map<string, FileEntry>();
    const seen = new Set<string>();

    for (const doc of vscode.workspace.textDocuments) {
      if (doc.isClosed) { continue; }
      if (!isCountableScheme(doc.uri)) { continue; }
      seen.add(doc.uri.toString());
      if (!this.isEnabled(doc)) { continue; }
      const count = this.dm.hasCache(doc)
        ? this.dm.getChanges(doc).length
        : parseCriticMarkup(doc).length;
      if (count > 0) { byUri.set(doc.uri.toString(), { uri: doc.uri, count }); }
    }

    for (const uri of this.gitModifiedUris()) {
      const key = uri.toString();
      if (seen.has(key)) { continue; }
      seen.add(key);
      if (!isCountableScheme(uri)) { continue; }
      if (!this.isUriEnabled(uri)) { continue; }
      const count = await this.diskMarkerCount(uri);
      if (count > 0) { byUri.set(key, { uri, count }); }
    }
    return [...byUri.values()];
  }

  // Workspace scope: every file on disk plus the open (possibly unsaved)
  // documents. Open documents win over their disk copy so in-memory edits are
  // reflected before a save. Both halves honour the same enablement gate as the
  // open scope — open docs via `isEnabled(doc)` (real languageId + per-file
  // override), disk files via `isUriEnabled(uri)` (language resolved from the
  // path) — so the overview never lists a file type kaicrit isn't active for.
  // Oversized/unreadable files are skipped.
  private async scanWorkspace(): Promise<FileEntry[]> {
    const byUri = new Map<string, FileEntry>();

    // In-memory documents first (covers open files + untitled buffers). A doc is
    // marked seen even when disabled, so its disk copy isn't re-read and the
    // open-document decision (override included) wins over the path heuristic.
    const seenInMemory = new Set<string>();
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.isClosed) { continue; }
      if (!isCountableScheme(doc.uri)) { continue; }
      seenInMemory.add(doc.uri.toString());
      if (!this.isEnabled(doc)) { continue; }
      const count = countMarkers(doc.getText());
      if (count > 0) { byUri.set(doc.uri.toString(), { uri: doc.uri, count }); }
    }

    const files = await vscode.workspace.findFiles('**/*', undefined, MAX_WORKSPACE_FILES);
    for (const uri of files) {
      const key = uri.toString();
      if (seenInMemory.has(key)) { continue; }
      // Skip non-enabled file types before any disk I/O — keeps the scan
      // consistent with activation and avoids reading files we'd never list.
      if (!this.isUriEnabled(uri)) { continue; }
      const count = await this.diskMarkerCount(uri);
      if (count > 0) { byUri.set(key, { uri, count }); }
    }
    return [...byUri.values()];
  }

  // Read a file from disk and count its markers, with the same size guard as the
  // open-doc path. Returns 0 for an oversized, unreadable, binary or vanished
  // file (e.g. a Git-deleted entry). Shared by the workspace scan and the open
  // scope's Git-changed half.
  private async diskMarkerCount(uri: vscode.Uri): Promise<number> {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_FILE_LENGTH) { return 0; }
      const bytes = await vscode.workspace.fs.readFile(uri);
      return countMarkers(Buffer.from(bytes).toString('utf8'));
    } catch {
      return 0;
    }
  }

  dispose(): void {
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); }
    this._onDidChangeTreeData.dispose();
    for (const d of this.disposables) { d.dispose(); }
  }
}

// The active scope, read fresh each query so a setting edit (or the toggle)
// takes effect on the next refresh.
function scope(): FilesScope {
  return vscode.workspace.getConfiguration('kaicrit').get<FilesScope>('files.scope', 'open');
}

// The active display mode, read fresh each query so a setting edit (or the
// toggle) takes effect on the next refresh.
function displayMode(): FilesDisplayMode {
  return vscode.workspace.getConfiguration('kaicrit').get<FilesDisplayMode>('files.displayMode', 'list');
}

export interface FileTreeFolder {
  kind: 'folder';
  name: string;
  /** Cumulative relative path of the folder, e.g. `docs/api`. */
  path: string;
  /** Aggregate change count of every file beneath this folder. */
  count: number;
  children: FileTreeItem[];
}
export interface FileTreeFile {
  kind: 'file';
  name: string;
  /** Full relative path, e.g. `docs/api/auth.mdx` — keys back to the FileEntry. */
  path: string;
  count: number;
}
export type FileTreeItem = FileTreeFolder | FileTreeFile;

/**
 * Pure (VS Code-free) folder-tree builder for the Files overview's tree mode.
 * Each item carries a relative `path` and a marker `count`; the path is split on
 * `/`, files nest under their folder chain, and every folder's `count`
 * aggregates the files beneath it. Within each level folders come first, then
 * files, each sorted alphabetically (case-insensitive). Tested directly with
 * plain strings (no stub), like `countMarkers`.
 */
export function buildFileTree(items: { path: string; count: number }[]): FileTreeItem[] {
  const root: FileTreeFolder = { kind: 'folder', name: '', path: '', count: 0, children: [] };

  for (const { path, count } of items) {
    const segments = path.split('/');
    const fileName = segments.pop()!;
    let folder = root;
    let prefix = '';
    for (const seg of segments) {
      prefix = prefix ? `${prefix}/${seg}` : seg;
      let next = folder.children.find(
        (c): c is FileTreeFolder => c.kind === 'folder' && c.name === seg,
      );
      if (!next) {
        next = { kind: 'folder', name: seg, path: prefix, count: 0, children: [] };
        folder.children.push(next);
      }
      folder = next;
    }
    folder.children.push({ kind: 'file', name: fileName, path, count });
  }

  // Sum folder counts bottom-up and sort each level (folders first, then files).
  const finalize = (folder: FileTreeFolder): number => {
    let total = 0;
    for (const child of folder.children) {
      total += child.kind === 'folder' ? finalize(child) : child.count;
    }
    folder.count = total;
    folder.children.sort(compareTreeItems);
    return total;
  };
  finalize(root);

  return root.children;
}

function compareTreeItems(a: FileTreeItem, b: FileTreeItem): number {
  if (a.kind !== b.kind) { return a.kind === 'folder' ? -1 : 1; }
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

// Count CriticMarkup markers in raw text. Mirrors `parseCriticMarkup`'s match
// count without building positions: the cheap `indexOf('{')` pre-check skips
// marker-free text, and the length cap bounds the regex's worst case.
export function countMarkers(text: string): number {
  if (text.indexOf('{') === -1) { return 0; }
  if (text.length > MAX_FILE_LENGTH) { return 0; }
  let n = 0;
  for (const _ of findMarkers(text)) { void _; n++; }
  return n;
}

function isCountableScheme(uri: vscode.Uri): boolean {
  return uri.scheme === 'file' || uri.scheme === 'untitled';
}

function basenameOf(uri: vscode.Uri): string {
  const parts = uri.path.split('/');
  return parts[parts.length - 1] || uri.path;
}
