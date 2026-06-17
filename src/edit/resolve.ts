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

/** How many characters to also remove on each side of a marker when it collapses,
 * so no orphaned whitespace is left behind. Offsets into the document text. */
export interface CollapseAdjustment {
  extendStart: number;
  extendEnd: number;
}

/**
 * When a change collapses to *empty* (`replacement === ''`), compute how much
 * surrounding whitespace to also remove so no orphan is left (issues #79, #73):
 *
 *   - **blank line** — the marker sits alone on its own line (only whitespace
 *     flanks it up to the surrounding line breaks): remove the line's
 *     leading/trailing whitespace plus ONE adjacent line break, so the now-empty
 *     line disappears instead of becoming a blank line;
 *   - **double space** — the marker sits between two ASCII spaces: remove ONE
 *     trailing space, so the two surrounding spaces don't merge into a stray one.
 *
 * Returns `{0, 0}` for every non-empty replacement (substitution / highlight /
 * reject-of-deletion stay exact) and for markers not flanked by collapsible
 * whitespace. Pure and offset-based, so it carries no VS Code dependency and is
 * unit-tested directly.
 *
 * `start`/`end` are the marker's start/end offsets in `fullText`; `replacement`
 * is the string the marker resolves to (from `resolveReplacement`).
 */
export function collapseAdjustment(
  fullText: string,
  start: number,
  end: number,
  replacement: string,
): CollapseAdjustment {
  const none: CollapseAdjustment = { extendStart: 0, extendEnd: 0 };
  if (replacement !== '') { return none; }

  // Bounds of the line the marker sits on.
  const lineStart = fullText.lastIndexOf('\n', start - 1) + 1; // 0 when none precedes
  let lineEnd = fullText.indexOf('\n', end);                   // index of the next '\n'
  if (lineEnd === -1) { lineEnd = fullText.length; }
  const isWs = (s: number, e: number): boolean => /^[ \t]*$/.test(fullText.slice(s, e));

  // Blank-line case: nothing but whitespace flanks the marker on its own line.
  if (isWs(lineStart, start) && isWs(end, lineEnd)) {
    if (lineEnd < fullText.length) {
      // Eat the line's whitespace and its trailing line break. Removing each
      // such marker as [lineStart, nextLineStart) makes consecutive blank-line
      // markers tile without overlapping in an Accept-All.
      return { extendStart: start - lineStart, extendEnd: (lineEnd + 1) - end };
    }
    if (lineStart > 0) {
      // Last line, no trailing break: eat the preceding break and the line.
      return { extendStart: start - (lineStart - 1), extendEnd: lineEnd - end };
    }
    return none; // marker is the whole, only line — no break to remove
  }

  // Double-space case: only literal ' ' on both sides qualifies, so indentation
  // and other whitespace on a content line are left untouched.
  if (fullText[start - 1] === ' ' && fullText[end] === ' ') {
    return { extendStart: 0, extendEnd: 1 };
  }
  return none;
}
