// Factory for the six CriticMarkup *content* decoration types.
//
// Extracted from DecoratorManager's constructor so both the editor decorations
// and the Double-Pane view share one definition of the styles + `kaicrit.*`
// ThemeColor IDs (from package.json `contributes.colors`).
//
// IMPORTANT: each call returns *fresh* instances. DecoratorManager and the
// Double-Pane command each call the factory exactly once, so they hold two
// *separate* instance sets. That separation is what keeps DecoratorManager.update
// (which runs an empty parse — and thus clears its own decoration instances —
// when a pane editor is focused) from wiping the pane editors' decorations: it
// only ever clears the instances it owns.
//
// The dimmed marker-character decoration is *not* here: it is local to the
// editor and has no place in the delimiter-free panes.

import * as vscode from 'vscode';

function themeColor(id: string): vscode.ThemeColor {
  return new vscode.ThemeColor(id);
}

/** Keyed by the same names as build.ts's `PaneCategory`. */
export interface ContentDecorationTypes {
  deletion: vscode.TextEditorDecorationType;
  addition: vscode.TextEditorDecorationType;
  substitutionOld: vscode.TextEditorDecorationType;
  substitutionNew: vscode.TextEditorDecorationType;
  highlight: vscode.TextEditorDecorationType;
  comment: vscode.TextEditorDecorationType;
}

/**
 * Create one fresh set of the six content decoration types, with the exact
 * styles + ThemeColor IDs used by the editor decorations. Each content
 * decoration also paints a marker in the overview ruler (Right lane).
 */
export function createContentDecorationTypes(): ContentDecorationTypes {
  return {
    deletion: vscode.window.createTextEditorDecorationType({
      textDecoration: 'line-through',
      color: themeColor('kaicrit.deletionForeground'),
      overviewRulerColor: themeColor('kaicrit.deletionForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    }),
    addition: vscode.window.createTextEditorDecorationType({
      textDecoration: 'underline',
      color: themeColor('kaicrit.additionForeground'),
      overviewRulerColor: themeColor('kaicrit.additionForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    }),
    substitutionOld: vscode.window.createTextEditorDecorationType({
      textDecoration: 'line-through',
      color: themeColor('kaicrit.substitutionOldForeground'),
      overviewRulerColor: themeColor('kaicrit.substitutionOldForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    }),
    substitutionNew: vscode.window.createTextEditorDecorationType({
      textDecoration: 'underline',
      color: themeColor('kaicrit.substitutionNewForeground'),
      overviewRulerColor: themeColor('kaicrit.substitutionNewForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    }),
    highlight: vscode.window.createTextEditorDecorationType({
      backgroundColor: themeColor('kaicrit.highlightBackground'),
      color: themeColor('kaicrit.highlightForeground'),
      overviewRulerColor: themeColor('kaicrit.highlightBackground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    }),
    comment: vscode.window.createTextEditorDecorationType({
      backgroundColor: themeColor('kaicrit.commentBackground'),
      fontStyle: 'italic',
      color: themeColor('kaicrit.commentForeground'),
      overviewRulerColor: themeColor('kaicrit.commentBackground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      before: { contentText: '⟨ ', color: new vscode.ThemeColor('editorLineNumber.foreground') },
      after:  { contentText: ' ⟩', color: new vscode.ThemeColor('editorLineNumber.foreground') },
    }),
  };
}
