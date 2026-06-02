// Pure core of the Double-Pane view — VS Code-free, separately testable
// (mirrors the pattern of edit/resolve.ts / edit/trackChangesEngine.ts).
//
// Splits a CriticMarkup source string into two parallel panes:
//   - `original`  — the state *before* the changes (the reject result), with
//     deleted / substituted-old text kept and coloured.
//   - `modified`  — the state *after* the changes (the accept result), with
//     added / substituted-new text kept and coloured.
//
// Highlights and comments appear on *both* sides; plain text between markers is
// copied verbatim and uncoloured to both. Marker delimiters themselves never
// appear in either pane.
//
// Unlike edit/resolve.ts (which returns only the replacement text), each
// emitted piece also carries a colour *category* and its offset span within the
// pane string, so the command layer can re-create the editor decorations — hence
// a dedicated function rather than reusing resolveReplacement.
//
// Mapping (mirrors the table in docs/doublepane.md):
//   Deletion     {--T--}      original: T (deletion)        modified: —
//   Addition     {++T++}      original: —                   modified: T (addition)
//   Substitution {~~O~>N~~}   original: O (substitutionOld)  modified: N (substitutionNew)
//   Highlight    {==T==}      original: T (highlight)        modified: T (highlight)
//   Comment      {>>T<<}      original: T (comment)          modified: T (comment)

import { findMarkers } from '../core/markers';

/** Colour categories — one per existing content decoration type. */
export type PaneCategory =
  | 'deletion'
  | 'addition'
  | 'substitutionOld'
  | 'substitutionNew'
  | 'highlight'
  | 'comment';

/** A coloured run inside a pane's text, by offset (half-open `[start, end)`). */
export interface PaneSpan {
  category: PaneCategory;
  start: number;
  end: number;
}

/** One side of the view: the rendered text plus the spans to colour. */
export interface Pane {
  text: string;
  spans: PaneSpan[];
}

export interface DoublePane {
  original: Pane;
  modified: Pane;
}

/** Append uncoloured plain text (the gaps between markers) to a pane. */
function appendPlain(pane: Pane, text: string): void {
  pane.text += text;
}

/**
 * Append coloured content to a pane and record its span. Empty content emits
 * nothing (and no span) — there is nothing to show or colour.
 */
function appendSpan(pane: Pane, text: string, category: PaneCategory): void {
  if (text.length === 0) {
    return;
  }
  const start = pane.text.length;
  pane.text += text;
  pane.spans.push({ category, start, end: pane.text.length });
}

/**
 * Build the two panes from a CriticMarkup source string. Match-group indices
 * follow core/markers.ts's `RE_ALL`:
 *   [1]=deletion, [2]=addition, [3]/[4]=substitution old/new,
 *   [5]=highlight, [6]=comment.
 */
export function buildDoublePane(source: string): DoublePane {
  const original: Pane = { text: '', spans: [] };
  const modified: Pane = { text: '', spans: [] };

  let lastIndex = 0;
  for (const m of findMarkers(source)) {
    // Plain-text gap before this marker → verbatim to both sides.
    const gap = source.slice(lastIndex, m.index);
    if (gap.length > 0) {
      appendPlain(original, gap);
      appendPlain(modified, gap);
    }
    lastIndex = m.index + m[0].length;

    if (m[1] !== undefined) {
      // Deletion — original only.
      appendSpan(original, m[1], 'deletion');
    } else if (m[2] !== undefined) {
      // Addition — modified only.
      appendSpan(modified, m[2], 'addition');
    } else if (m[3] !== undefined || m[4] !== undefined) {
      // Substitution — old to original, new to modified.
      appendSpan(original, m[3] ?? '', 'substitutionOld');
      appendSpan(modified, m[4] ?? '', 'substitutionNew');
    } else if (m[5] !== undefined) {
      // Highlight — both sides.
      appendSpan(original, m[5], 'highlight');
      appendSpan(modified, m[5], 'highlight');
    } else if (m[6] !== undefined) {
      // Comment — both sides (content verbatim, incl. any @author prefix).
      appendSpan(original, m[6], 'comment');
      appendSpan(modified, m[6], 'comment');
    }
  }

  // Trailing plain text after the last marker.
  const tail = source.slice(lastIndex);
  if (tail.length > 0) {
    appendPlain(original, tail);
    appendPlain(modified, tail);
  }

  return { original, modified };
}
