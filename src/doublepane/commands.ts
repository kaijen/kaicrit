// Registers the Double-Pane command: split the active CriticMarkup document into
// two side-by-side editors — "Original" (reject result) and "New" (accept
// result) — with the change content kept and coloured but the marker delimiters
// removed. Snapshot on command, like the Compare feature (no live mode).

import * as vscode from 'vscode';
import { buildDoublePane, Pane, PaneCategory } from './build';
import { createContentDecorationTypes, ContentDecorationTypes } from '../edit/decorationTypes';

/**
 * Apply a pane's spans as decorations on its editor. Spans are grouped by
 * category and converted to ranges via `positionAt`, then handed to the
 * matching decoration type (the category names line up 1:1 with the type keys).
 */
function applyPaneDecorations(
  editor: vscode.TextEditor,
  pane: Pane,
  types: ContentDecorationTypes,
): void {
  const byCategory = new Map<PaneCategory, vscode.Range[]>();
  for (const span of pane.spans) {
    const range = new vscode.Range(
      editor.document.positionAt(span.start),
      editor.document.positionAt(span.end),
    );
    const ranges = byCategory.get(span.category) ?? [];
    ranges.push(range);
    byCategory.set(span.category, ranges);
  }
  for (const [category, ranges] of byCategory) {
    editor.setDecorations(types[category], ranges);
  }
}

/** Command handler: build the two panes from the active editor and show them. */
async function openDoublePane(types: ContentDecorationTypes): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.setStatusBarMessage(
      'kaicrit: open a CriticMarkup file first to use the Double-Pane view.',
      3000,
    );
    return;
  }

  const language = editor.document.languageId;
  const { original, modified } = buildDoublePane(editor.document.getText());

  // Open both panes as untitled docs and show them side by side: Original on the
  // left (column One), New beside it. `preview: false` so neither is a transient
  // preview tab. (Consistent with the Compare feature; same known limitation
  // that the docs are editable and carry generic tab titles.)
  const [originalDoc, modifiedDoc] = await Promise.all([
    vscode.workspace.openTextDocument({ content: original.text, language }),
    vscode.workspace.openTextDocument({ content: modified.text, language }),
  ]);

  const originalEditor = await vscode.window.showTextDocument(originalDoc, {
    viewColumn: vscode.ViewColumn.One,
    preview: false,
  });
  const modifiedEditor = await vscode.window.showTextDocument(modifiedDoc, {
    viewColumn: vscode.ViewColumn.Beside,
    preview: false,
  });

  applyPaneDecorations(originalEditor, original, types);
  applyPaneDecorations(modifiedEditor, modified, types);
}

export function registerDoublePaneCommands(context: vscode.ExtensionContext): void {
  // One fresh decoration-type set, owned by (and disposed with) this command —
  // kept separate from DecoratorManager's set so the manager's empty-parse
  // clear (triggered when a pane editor is focused) can't wipe the pane colours.
  const types = createContentDecorationTypes();
  context.subscriptions.push(
    types.deletion,
    types.addition,
    types.substitutionOld,
    types.substitutionNew,
    types.highlight,
    types.comment,
    vscode.commands.registerCommand('kaicrit.openDoublePane', () => openDoublePane(types)),
  );
}
