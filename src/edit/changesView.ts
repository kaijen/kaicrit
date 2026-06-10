import * as vscode from 'vscode';
import { ChangeType, CriticChange } from '../core/types';
import { parseCommentMeta } from '../core/comment';
import { DecoratorManager } from './decorator';
import { COLOR_IDS, LABELS, ORDER } from './statusBar';

type Node = TypeNode | ChangeNode;

// Codicon per change type, mirroring the status bar's unicode glyphs
// (⊟ ⊞ ⇄ ☰ 💬). Tree-item labels can't be colored, so the per-type symbol is
// rendered as a `ThemeIcon` instead — the only tree-view surface that accepts a
// `ThemeColor` — tinted with the type's configured `kaicrit.*` color.
const ICONS: Record<ChangeType, string> = {
  [ChangeType.Deletion]:     'diff-removed',
  [ChangeType.Addition]:     'diff-added',
  [ChangeType.Substitution]: 'arrow-swap',
  [ChangeType.Highlight]:    'symbol-color',
  [ChangeType.Comment]:      'comment',
};

function typeIcon(type: ChangeType): vscode.ThemeIcon {
  return new vscode.ThemeIcon(ICONS[type], new vscode.ThemeColor(COLOR_IDS[type]));
}

/** Top-level group node: one per change type present in the document. */
class TypeNode extends vscode.TreeItem {
  // The colored per-type icon sits on the group; the leaf nodes stay icon-free
  // to keep the list compact.
  constructor(readonly type: ChangeType, readonly changes: CriticChange[]) {
    super(`${LABELS[type]} (${changes.length})`, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = typeIcon(type);
    this.contextValue = 'kaicrit.changeType';
  }
}

/**
 * Leaf node: a single change. Clicking it reveals the change in the editor.
 * In the grouped view the leaves stay icon-free (the parent `TypeNode` carries
 * the colored type icon); in the flat/chronological view `showTypeIcon` puts it
 * on each leaf so the type stays visible without a group header.
 */
class ChangeNode extends vscode.TreeItem {
  readonly position: vscode.Position;

  constructor(readonly change: CriticChange, showTypeIcon = false) {
    super(labelFor(change), vscode.TreeItemCollapsibleState.None);
    if (showTypeIcon) { this.iconPath = typeIcon(change.type); }
    this.position = change.fullRange.start;
    this.description = descriptionFor(change);
    this.tooltip = tooltipFor(change);
    this.contextValue = 'kaicrit.change';
    this.command = {
      command: 'kaicrit.revealChangeAt',
      title: 'Reveal Change',
      arguments: [this.position],
    };
  }
}

/**
 * Lists every CriticMarkup change of the active document in a dedicated sidebar
 * view. Two layouts, switched by the `kaicrit.changes.grouping` setting: `"type"`
 * groups changes under per-type parents (sorted by position within each group),
 * `"chronological"` lists them flat in document order with a colored per-type
 * icon on each leaf. Each leaf jumps to its change on click and offers inline Accept /
 * Reject actions; the view title carries Accept-All / Reject-All and the
 * group/flat toggle.
 *
 * Reads the `DecoratorManager`'s change cache (no extra parse) and refreshes on
 * its `onDidUpdate` event, when the active editor switches, and when the grouping
 * setting changes — so the tree mirrors the editor live.
 */
export class ChangesTreeProvider implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly disposables: vscode.Disposable[] = [];
  private doc: vscode.TextDocument | undefined;

  constructor(private readonly dm: DecoratorManager) {
    this.doc = vscode.window.activeTextEditor?.document;
    this.syncGroupingContext();
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        this.doc = editor?.document;
        this._onDidChangeTreeData.fire();
      }),
      // The decorator re-parsed the active document (typing, accept/reject) →
      // the list may have changed.
      dm.onDidUpdate(editor => {
        if (editor.document === this.doc) { this._onDidChangeTreeData.fire(); }
      }),
      // The grouping setting (also written by the view-title toggle) flipped →
      // rebuild the list and update the toggle-button visibility context key.
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('kaicrit.changes.grouping')) {
          this.syncGroupingContext();
          this._onDidChangeTreeData.fire();
        }
      }),
    );
  }

  // Mirror the current grouping mode into the `kaicrit.changesGrouped` context
  // key so the view title shows the right toggle button (group ⇄ flat).
  private syncGroupingContext(): void {
    vscode.commands.executeCommand('setContext', 'kaicrit.changesGrouped', groupingMode() === 'type');
  }

  getTreeItem(node: Node): vscode.TreeItem {
    return node;
  }

  getChildren(element?: Node): Node[] {
    if (!this.doc) { return []; }

    // Flat/chronological: no grouping, every change as a type-icon-carrying leaf
    // in document order (the cache is already in ascending-offset order).
    if (groupingMode() === 'chronological') {
      if (element) { return []; }
      return this.dm.getChanges(this.doc).map(c => new ChangeNode(c, true));
    }

    if (element instanceof TypeNode) {
      return element.changes.map(c => new ChangeNode(c));
    }
    if (element) { return []; }

    // Top level: one group per type that actually occurs, in the shared order.
    const changes = this.dm.getChanges(this.doc);
    const byType = new Map<ChangeType, CriticChange[]>();
    for (const c of changes) {
      const list = byType.get(c.type) ?? [];
      list.push(c);
      byType.set(c.type, list);
    }
    return ORDER
      .filter(t => byType.has(t))
      .map(t => new TypeNode(t, byType.get(t)!));
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    for (const d of this.disposables) { d.dispose(); }
  }
}

// The active sidebar layout. `"type"` groups by change type (default),
// `"chronological"` lists every change flat in document order.
function groupingMode(): 'type' | 'chronological' {
  return vscode.workspace
    .getConfiguration('kaicrit')
    .get<'type' | 'chronological'>('changes.grouping', 'type');
}

// ── Label / description / tooltip helpers ─────────────────────────────────────

function labelFor(change: CriticChange): string {
  let label: string;
  switch (change.type) {
    case ChangeType.Substitution:
      label = `${truncate(change.oldText ?? '', 20)} → ${truncate(change.newText ?? '', 20)}`;
      break;
    case ChangeType.Comment:
      label = truncate(commentBody(change));
      break;
    default:
      label = truncate(change.text ?? '');
  }
  return label || '∅';
}

function descriptionFor(change: CriticChange): string {
  const line = `Ln ${change.fullRange.start.line + 1}`;
  if (change.type === ChangeType.Comment && (change.author !== undefined || change.date !== undefined)) {
    const meta = [
      change.author !== undefined ? `@${change.author}` : undefined,
      change.date,
    ].filter(Boolean).join(' · ');
    return `${meta} · ${line}`;
  }
  return line;
}

function tooltipFor(change: CriticChange): string {
  switch (change.type) {
    case ChangeType.Substitution:
      return `${change.oldText ?? ''} → ${change.newText ?? ''}`;
    case ChangeType.Comment:
      return commentBody(change);
    default:
      return change.text ?? '';
  }
}

// The comment body without its optional metadata prefix (when metadata was
// recognized); the full content otherwise.
function commentBody(change: CriticChange): string {
  if (change.author !== undefined || change.date !== undefined) {
    return parseCommentMeta(change.text ?? '').body;
  }
  return change.text ?? '';
}

function truncate(s: string, max = 40): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
