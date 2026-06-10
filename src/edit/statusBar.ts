import * as vscode from 'vscode';
import { ChangeType, CriticChange } from '../core/types';
import { DecoratorManager } from './decorator';

// One glyph per change type, shown left-to-right in the status bar entry, e.g.
// `⊟3 ⊞5 ⇄2 ☰1 💬4` (deletions / additions / substitutions / highlights / comments).
export const SYMBOLS: Record<ChangeType, string> = {
  [ChangeType.Deletion]:     '⊟',
  [ChangeType.Addition]:     '⊞',
  [ChangeType.Substitution]: '⇄',
  [ChangeType.Highlight]:    '☰',
  [ChangeType.Comment]:      '💬',
};

export const LABELS: Record<ChangeType, string> = {
  [ChangeType.Deletion]:     'Deletions',
  [ChangeType.Addition]:     'Additions',
  [ChangeType.Substitution]: 'Substitutions',
  [ChangeType.Highlight]:    'Highlights',
  [ChangeType.Comment]:      'Comments',
};

// Stable display order (matches SYMBOLS/LABELS insertion order). Shared with the
// changes Tree View so the status bar and the sidebar list types identically.
export const ORDER: ChangeType[] = [
  ChangeType.Deletion,
  ChangeType.Addition,
  ChangeType.Substitution,
  ChangeType.Highlight,
  ChangeType.Comment,
];

// The `kaicrit.*` ThemeColor id (from package.json `contributes.colors`) that
// represents each change type in UI chrome — the status-bar counts and the
// sidebar's tree-item icons. Deletion/addition/substitution use their content
// foreground; highlight and comment use their *background* (the foregrounds are
// dark/light grays picked to sit on those backgrounds, so standing alone they
// would be near-invisible on one of the theme families) — the same choice the
// overview-ruler markers in `decorationTypes.ts` make.
export const COLOR_IDS: Record<ChangeType, string> = {
  [ChangeType.Deletion]:     'kaicrit.deletionForeground',
  [ChangeType.Addition]:     'kaicrit.additionForeground',
  [ChangeType.Substitution]: 'kaicrit.substitutionNewForeground',
  [ChangeType.Highlight]:    'kaicrit.highlightBackground',
  [ChangeType.Comment]:      'kaicrit.commentBackground',
};

/**
 * Shows the number of CriticMarkup changes in the active editor, grouped by
 * type. Reads the `DecoratorManager`'s change cache instead of re-parsing, so
 * it adds no extra document scans. Clicking a count jumps to the first change.
 *
 * One `StatusBarItem` per change type (not a single joined item): a status-bar
 * item has exactly one `color`, so per-type tinting — each count in its
 * configured `kaicrit.*` color — requires one item per type. Descending
 * priorities keep them adjacent and in `ORDER`; all five show/hide together so
 * the summary still reads as one entry.
 */
export class StatusBarManager {
  private readonly items: Record<ChangeType, vscode.StatusBarItem>;

  constructor(private readonly dm: DecoratorManager) {
    this.items = {} as Record<ChangeType, vscode.StatusBarItem>;
    ORDER.forEach((t, i) => {
      const item = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        -10 - i * 0.01,
      );
      item.command = 'kaicrit.firstChange';
      item.color = new vscode.ThemeColor(COLOR_IDS[t]);
      this.items[t] = item;
    });
  }

  /** Refresh the items from the decorator's cached changes for `editor`. */
  update(editor: vscode.TextEditor | undefined): void {
    const changes = editor ? this.dm.getChanges(editor.document) : [];
    if (changes.length === 0) {
      for (const t of ORDER) { this.items[t].hide(); }
      return;
    }

    const counts = countByType(changes);
    const tooltip = buildTooltip(counts, changes.length);
    for (const t of ORDER) {
      const item = this.items[t];
      item.text = `${SYMBOLS[t]}${counts[t]}`;
      item.tooltip = tooltip;
      item.show();
    }
  }

  dispose(): void {
    for (const t of ORDER) { this.items[t].dispose(); }
  }
}

export function countByType(changes: CriticChange[]): Record<ChangeType, number> {
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
