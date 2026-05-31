import * as vscode from 'vscode';
import { ChangeType, CriticChange } from '../core/types';
import { DecoratorManager } from './decorator';

// One glyph per change type, shown left-to-right in the status bar entry, e.g.
// `⊟3 ⊞5 ⇄2 ☰1 💬4` (deletions / additions / substitutions / highlights / comments).
const SYMBOLS: Record<ChangeType, string> = {
  [ChangeType.Deletion]:     '⊟',
  [ChangeType.Addition]:     '⊞',
  [ChangeType.Substitution]: '⇄',
  [ChangeType.Highlight]:    '☰',
  [ChangeType.Comment]:      '💬',
};

const LABELS: Record<ChangeType, string> = {
  [ChangeType.Deletion]:     'Deletions',
  [ChangeType.Addition]:     'Additions',
  [ChangeType.Substitution]: 'Substitutions',
  [ChangeType.Highlight]:    'Highlights',
  [ChangeType.Comment]:      'Comments',
};

// Stable display order (matches SYMBOLS/LABELS insertion order).
const ORDER: ChangeType[] = [
  ChangeType.Deletion,
  ChangeType.Addition,
  ChangeType.Substitution,
  ChangeType.Highlight,
  ChangeType.Comment,
];

/**
 * Shows the number of CriticMarkup changes in the active editor, grouped by
 * type. Reads the `DecoratorManager`'s change cache instead of re-parsing, so
 * it adds no extra document scans. Clicking the item jumps to the first change.
 */
export class StatusBarManager {
  private readonly item: vscode.StatusBarItem;

  constructor(private readonly dm: DecoratorManager) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -10);
    this.item.command = 'kaicrit.firstChange';
  }

  /** Refresh the item from the decorator's cached changes for `editor`. */
  update(editor: vscode.TextEditor | undefined): void {
    if (!editor) { this.item.hide(); return; }

    const changes = this.dm.getChanges(editor.document);
    if (changes.length === 0) { this.item.hide(); return; }

    const counts = countByType(changes);
    this.item.text = ORDER.map(t => `${SYMBOLS[t]}${counts[t]}`).join(' ');
    this.item.tooltip = buildTooltip(counts, changes.length);
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}

function countByType(changes: CriticChange[]): Record<ChangeType, number> {
  const counts: Record<ChangeType, number> = {
    [ChangeType.Deletion]:     0,
    [ChangeType.Addition]:     0,
    [ChangeType.Substitution]: 0,
    [ChangeType.Highlight]:    0,
    [ChangeType.Comment]:      0,
  };
  for (const c of changes) { counts[c.type]++; }
  return counts;
}

function buildTooltip(counts: Record<ChangeType, number>, total: number): string {
  const lines = ORDER.map(t => `${SYMBOLS[t]} ${LABELS[t]}: ${counts[t]}`);
  return [
    `CriticMarkup — ${total} change${total === 1 ? '' : 's'}`,
    ...lines,
    'Click to jump to the first change.',
  ].join('\n');
}
