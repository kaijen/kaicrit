// Pure accept/reject semantics — the single source of truth for what each
// CriticMarkup type collapses to when a change is accepted or rejected.
//
// Deliberately free of the VS Code API (it only needs the extracted strings and
// the type) so it can be unit-tested without an Extension Host and reused by the
// command layer (edit/commands.ts builds the WorkspaceEdit around it).
//
// Mapping (mirrors the table in CLAUDE.md):
//   Deletion     {--T--}      accept → ''   reject → T
//   Addition     {++T++}      accept → T    reject → ''
//   Substitution {~~O~>N~~}   accept → N    reject → O
//   Highlight    {==T==}      accept → T    reject → T
//   Comment      {>>T<<}      accept → ''   reject → ''

import { ChangeType } from '../core/types';

/** The slice of a CriticChange the resolution depends on. */
export interface Resolvable {
  type: ChangeType;
  text?: string;       // deletion, addition, highlight, comment content
  oldText?: string;    // substitution: old part
  newText?: string;    // substitution: new part
}

/** The replacement string a change collapses to for the given mode. */
export function resolveReplacement(change: Resolvable, mode: 'accept' | 'reject'): string {
  switch (change.type) {
    case ChangeType.Deletion:
      return mode === 'accept' ? '' : (change.text ?? '');
    case ChangeType.Addition:
      return mode === 'accept' ? (change.text ?? '') : '';
    case ChangeType.Substitution:
      return mode === 'accept' ? (change.newText ?? '') : (change.oldText ?? '');
    case ChangeType.Highlight:
      return change.text ?? '';
    case ChangeType.Comment:
      return '';
  }
}
