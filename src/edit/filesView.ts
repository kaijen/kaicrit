import * as vscode from 'vscode';
import { findMarkers } from '../core/markers';
import { DecoratorManager } from './decorator';
import { parseCriticMarkup } from './parser';

// Which files the overview lists. `"open"` counts only the documents currently
// open in the editor (cheap, reads the decorator cache / in-memory text);
// `"workspace"` additionally scans every file on disk in the workspace
// (heavier, reads files lazily). Default is `"open"`.
export type FilesScope = 'open' | 'workspace';

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
 * Lists every file that contains CriticMarkup changes, with a per-file change
 * count, in a dedicated sidebar view above the per-file Changes list. Clicking
 * a file opens it.
 *
 * Two scopes, switched by the scope button in the view title (and persisted in
 * `kaicrit.files.scope`): `"open"` lists only open documents (read from the
 * decorator's change cache or a direct parse, so it honours the enablement
 * gate); `"workspace"` additionally scans every file on disk via
 * `findFiles` + `fs.readFile`, preferring the in-memory text of any open
 * (possibly unsaved) document so edits show before a save.
 *
 * Refreshes — debounced — on the decorator's `onDidUpdate`, document
 * open/close/save, and a `kaicrit.files.scope` / `kaicrit.enabledLanguages`
 * config change; the view title also offers a manual Refresh.
 */
export class FilesTreeProvider implements vscode.TreeDataProvider<FileNode>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly dm: DecoratorManager,
    private readonly isEnabled: (doc: vscode.TextDocument) => boolean,
  ) {
    this.syncScopeContext();
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
        } else if (e.affectsConfiguration('kaicrit.enabledLanguages')) {
          // The open-scope list is enablement-gated, so a whitelist edit can add
          // or drop files.
          this.refresh();
        }
      }),
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

  getTreeItem(node: FileNode): vscode.TreeItem {
    return node;
  }

  async getChildren(element?: FileNode): Promise<FileNode[]> {
    if (element) { return []; }
    const entries = scope() === 'workspace'
      ? await this.scanWorkspace()
      : this.scanOpen();
    entries.sort((a, b) =>
      vscode.workspace.asRelativePath(a.uri).localeCompare(vscode.workspace.asRelativePath(b.uri)));
    return entries.map(e => new FileNode(e));
  }

  // Open scope: count changes in the currently open documents only. Uses the
  // decorator's warm cache where available (no re-parse) and honours the
  // enablement gate, so it mirrors exactly what the per-file Changes view sees.
  private scanOpen(): FileEntry[] {
    const entries: FileEntry[] = [];
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.isClosed) { continue; }
      if (!isCountableScheme(doc.uri)) { continue; }
      if (!this.isEnabled(doc)) { continue; }
      const count = this.dm.hasCache(doc)
        ? this.dm.getChanges(doc).length
        : parseCriticMarkup(doc).length;
      if (count > 0) { entries.push({ uri: doc.uri, count }); }
    }
    return entries;
  }

  // Workspace scope: every file on disk plus the open (possibly unsaved)
  // documents. Open documents win over their disk copy so in-memory edits are
  // reflected before a save. The on-disk scan counts markers directly on the raw
  // text (no language/enablement filter — the disk copy carries no languageId)
  // and skips oversized/unreadable files.
  private async scanWorkspace(): Promise<FileEntry[]> {
    const byUri = new Map<string, FileEntry>();

    // In-memory documents first (covers open files + untitled buffers).
    const seenInMemory = new Set<string>();
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.isClosed) { continue; }
      if (!isCountableScheme(doc.uri)) { continue; }
      seenInMemory.add(doc.uri.toString());
      const count = countMarkers(doc.getText());
      if (count > 0) { byUri.set(doc.uri.toString(), { uri: doc.uri, count }); }
    }

    const files = await vscode.workspace.findFiles('**/*', undefined, MAX_WORKSPACE_FILES);
    for (const uri of files) {
      const key = uri.toString();
      if (seenInMemory.has(key)) { continue; }
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.size > MAX_FILE_LENGTH) { continue; }
        const bytes = await vscode.workspace.fs.readFile(uri);
        const count = countMarkers(Buffer.from(bytes).toString('utf8'));
        if (count > 0) { byUri.set(key, { uri, count }); }
      } catch {
        // Unreadable / binary / vanished file — skip it.
      }
    }
    return [...byUri.values()];
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
