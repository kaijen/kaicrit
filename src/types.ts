import * as vscode from 'vscode';

export const enum ChangeType {
  Deletion     = 'deletion',
  Addition     = 'addition',
  Substitution = 'substitution',
  Highlight    = 'highlight',
  Comment      = 'comment',
}

export interface CriticChange {
  type: ChangeType;
  fullRange: vscode.Range;

  // Non-substitution types: range of the text content (excluding markers)
  contentRange?: vscode.Range;

  // Substitution only
  oldRange?: vscode.Range;
  newRange?: vscode.Range;

  // Extracted strings (used by accept/reject logic)
  text?: string;       // deletion, addition, highlight, comment content
  oldText?: string;    // substitution: old part
  newText?: string;    // substitution: new part
}
