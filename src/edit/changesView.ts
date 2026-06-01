import * as vscode from 'vscode';
import { ChangeType, CriticChange } from '../core/types';
import { parseCommentMeta } from '../core/comment';
import { DecoratorManager } from './decorator';
import { LABELS, ORDER, SYMBOLS } from './statusBar';

type Node = TypeNode | ChangeNode;

/** Top-level group node: one per change type present in the document. */
class TypeNode extends vscode.TreeItem {
  // The type glyph (⊟ ⊞ ⇄ ☰ 💬) is shown in the label rather than as a codicon
  // icon, so the sidebar uses the same per-type symbols as the status bar. The
  // leaf nodes stay symbol-free to keep the list compact.
  constructor(readonly type: ChangeType, readonly changes: CriticChange[]) {
    super(`${SYMBOLS[type]} ${LABELS[type]} (${changes.length})`, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'kaicrit.changeType';
  }
}

/** Leaf node: a single change. Clicking it reveals the change in the editor. */
class ChangeNode extends vscode.TreeItem {
  readonly position: vscode.Position;

  constructor(readonly change: CriticChange) {
    super(labelFor(change), vscode.TreeItemCollapsibleState.None);
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
 * view, grouped by type. Each leaf jumps to its change on click and offers
 * inline Accept / Reject actions; the view title carries Accept-All / Reject-All.
 *
 * Reads the `DecoratorManager`'s change cache (no extra parse) and refreshes on
 * its `onDidUpdate` event and when the active editor switches — both debounced
 * upstream — so the tree mirrors the editor live.
 */
export class ChangesTreeProvider implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly disposables: vscode.Disposable[] = [];
  private doc: vscode.TextDocument | undefined;

  constructor(private readonly dm: DecoratorManager) {
    this.doc = vscode.window.activeTextEditor?.document;
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
    );
  }

  getTreeItem(node: Node): vscode.TreeItem {
    return node;
  }

  getChildren(element?: Node): Node[] {
    if (!this.doc) { return []; }
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
