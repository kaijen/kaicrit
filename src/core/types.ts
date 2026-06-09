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

  // Verbatim marker text (`match[0]`) captured at parse time. Lets a consumer
  // confirm that the cached `fullRange` still spans this exact marker before
  // resolving it — a guard against acting on a stale (debounced) cache whose
  // offsets predate an in-flight edit (issue #52).
  raw?: string;

  // Non-substitution types: range of the text content (excluding markers)
  contentRange?: vscode.Range;

  // Substitution only
  oldRange?: vscode.Range;
  newRange?: vscode.Range;

  // Extracted strings (used by accept/reject logic)
  text?: string;       // deletion, addition, highlight, comment content
  oldText?: string;    // substitution: old part
  newText?: string;    // substitution: new part

  // Comment metadata (optional convention: {>>@author YYYY-MM-DD: text<<}).
  // Absent on comments without metadata and on all other types.
  author?: string;
  date?: string;
}
