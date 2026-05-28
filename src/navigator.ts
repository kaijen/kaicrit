import * as vscode from 'vscode';
import { CriticChange } from './types';

export function findAtCursor(changes: CriticChange[], cursor: vscode.Position): CriticChange | undefined {
  return changes.find(c =>
    !cursor.isBefore(c.fullRange.start) && cursor.isBefore(c.fullRange.end)
  );
}

export function findNext(changes: CriticChange[], cursor: vscode.Position): CriticChange | undefined {
  return changes.find(c => c.fullRange.start.isAfter(cursor));
}

export function findPrev(changes: CriticChange[], cursor: vscode.Position): CriticChange | undefined {
  // last change whose end is before the cursor
  let result: CriticChange | undefined;
  for (const c of changes) {
    if (c.fullRange.end.isBefore(cursor)) { result = c; }
  }
  return result;
}

export function findFirst(changes: CriticChange[]): CriticChange | undefined {
  return changes[0];
}

export function findLast(changes: CriticChange[]): CriticChange | undefined {
  return changes[changes.length - 1];
}

export function revealChange(editor: vscode.TextEditor, change: CriticChange): void {
  const pos = change.fullRange.start;
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(change.fullRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}
