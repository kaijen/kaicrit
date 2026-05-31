// Pure, VS Code-free core of the Track Changes mode.
//
// Given the document text *before* a raw edit (`preText`) and the raw content
// changes that VS Code reported, it computes the compensating replacements that
// wrap the edited regions in CriticMarkup markers, plus the resulting caret
// offsets. Keeping this logic free of the VS Code API mirrors compare/diff.ts
// and lets it be unit-tested without an extension host (Task 9).
//
// Coordinate systems:
//   - `RawEdit.offset` / `oldLength` are in PRE-edit coordinates (what
//     TextDocumentContentChangeEvent.rangeOffset / rangeLength report).
//   - `CompEdit.start` / `end` are in POST-raw-edit coordinates — i.e. the live
//     document at the moment the change event fires, which is exactly what the
//     caller turns into Ranges via `document.positionAt`.
//   - `selections` are offsets in the FINAL text (after the compensating edit),
//     ready for `document.positionAt` once `applyEdit` has resolved.

import { ChangeType } from '../core/types';
import { MARKERS, RE_ALL } from '../core/markers';

export interface RawEdit {
  offset: number;     // start of the replaced span in the pre-edit text
  oldLength: number;  // length of the replaced (deleted) span
  newText: string;    // text the user inserted
}

export interface CompEdit {
  start: number;       // post-raw-edit coordinates
  end: number;
  replacement: string;
}

export interface TrackResult {
  edits: CompEdit[];      // ascending, non-overlapping; empty ⇒ nothing to wrap
  selections: number[];   // final caret offsets, one per input edit (sorted order)
}

interface MarkerSpan {
  type: ChangeType;
  start: number;        // full marker start in preText
  end: number;          // full marker end in preText
  contentStart: number; // first content char (after the 3-char opener)
  contentEnd: number;   // one past the last content char (before the 3-char closer)
  content: string;
}

const OPEN_LEN = 3;   // every marker opener is 3 chars ({--, {++, {~~, {==, {>>)
const CLOSE_LEN = 3;  // every marker closer is 3 chars (--}, ++}, ~~}, ==}, <<})

// Scan the markers that could touch [region.start, region.end]. We stop as soon
// as a marker starts past region.end (markers further right cannot enclose or be
// adjacent to the region), bounding the work to the text up to the edit.
function scanMarkers(preText: string, regionEnd: number): MarkerSpan[] {
  const spans: MarkerSpan[] = [];
  RE_ALL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_ALL.exec(preText)) !== null) {
    const start = m.index;
    if (start > regionEnd) { break; }
    const end = start + m[0].length;
    let type: ChangeType;
    if (m[1] !== undefined) { type = ChangeType.Deletion; }
    else if (m[2] !== undefined) { type = ChangeType.Addition; }
    else if (m[3] !== undefined) { type = ChangeType.Substitution; }
    else if (m[5] !== undefined) { type = ChangeType.Highlight; }
    else { type = ChangeType.Comment; }
    spans.push({
      type,
      start,
      end,
      contentStart: start + OPEN_LEN,
      contentEnd: end - CLOSE_LEN,
      content: preText.substring(start + OPEN_LEN, end - CLOSE_LEN),
    });
  }
  return spans;
}

function addMarker(text: string): string {
  return MARKERS[ChangeType.Addition].open + text + MARKERS[ChangeType.Addition].close;
}
function delMarker(text: string): string {
  return MARKERS[ChangeType.Deletion].open + text + MARKERS[ChangeType.Deletion].close;
}
function substMarker(oldText: string, newText: string): string {
  const m = MARKERS[ChangeType.Substitution];
  return m.open + oldText + m.sep + newText + m.close;
}

// What a single raw edit resolves to once classified against the surrounding
// markers. `skip` means the raw text already lives inside an addition (or is the
// removal of just-added text), so no marker wrap is emitted.
type Plan =
  | { kind: 'skip'; postStart: number; rawNewLen: number }
  | { kind: 'wrap'; start: number; end: number; replacement: string; cursorWithin: number };

function classify(
  preText: string,
  edit: RawEdit,
  delta: number,
  single: boolean,
): Plan {
  const { offset, oldLength, newText } = edit;
  const delEnd = offset + oldLength;
  const oldText = preText.substring(offset, delEnd);
  const postStart = offset + delta;

  const spans = scanMarkers(preText, delEnd);
  // The smallest addition whose *content* fully contains the edited region.
  const enclosingAdd = spans.find(
    s => s.type === ChangeType.Addition &&
      offset >= s.contentStart && delEnd <= s.contentEnd,
  );

  const isInsert = oldLength === 0 && newText.length > 0;
  const isDelete = oldLength > 0 && newText.length === 0;

  if (isInsert) {
    // Typing inside (or at either content edge of) an existing addition just
    // grows it — the inserted text is already annotated.
    const inside = spans.find(
      s => s.type === ChangeType.Addition &&
        offset >= s.contentStart && offset <= s.contentEnd,
    );
    if (inside) { return { kind: 'skip', postStart, rawNewLen: newText.length }; }
    const replacement = addMarker(newText);
    return {
      kind: 'wrap',
      start: postStart,
      end: postStart + newText.length,
      replacement,
      cursorWithin: OPEN_LEN + newText.length, // park caret before ++}
    };
  }

  if (isDelete) {
    // Removing text you just added: let it vanish (rejecting an addition would
    // have removed it anyway). No deletion marker.
    if (enclosingAdd) { return { kind: 'skip', postStart, rawNewLen: 0 }; }

    // Single-edit adjacency merge with a neighbouring deletion.
    if (single) {
      const right = spans.find(s => s.type === ChangeType.Deletion && s.start === delEnd);
      if (right) {
        // The raw delete already removed [offset, delEnd); the marker shifted
        // left by oldLength. Rewrite it with the merged content.
        return {
          kind: 'wrap',
          start: offset,
          end: right.end - oldLength,
          replacement: delMarker(oldText + right.content),
          cursorWithin: 0,
        };
      }
      const left = spans.find(s => s.type === ChangeType.Deletion && s.end === offset);
      if (left) {
        return {
          kind: 'wrap',
          start: left.start,
          end: left.end,
          replacement: delMarker(left.content + oldText),
          cursorWithin: 0,
        };
      }
    }

    return {
      kind: 'wrap',
      start: postStart,
      end: postStart, // raw delete already emptied the span; insert the marker
      replacement: delMarker(oldText),
      cursorWithin: 0, // park caret before {--
    };
  }

  // Replacement (both sides non-empty). If it happened inside an addition, the
  // net effect is still "added text", so leave it as-is.
  if (enclosingAdd) { return { kind: 'skip', postStart, rawNewLen: newText.length }; }
  const replacement = substMarker(oldText, newText);
  return {
    kind: 'wrap',
    start: postStart,
    end: postStart + newText.length,
    replacement,
    cursorWithin: replacement.length - CLOSE_LEN, // before ~~}
  };
}

export function computeTrackChanges(preText: string, rawEdits: RawEdit[]): TrackResult {
  const sorted = [...rawEdits].sort((a, b) => a.offset - b.offset);
  const single = sorted.length === 1;

  const plans: Plan[] = [];
  let delta = 0;
  for (const e of sorted) {
    plans.push(classify(preText, e, delta, single));
    delta += e.newText.length - e.oldLength; // pre→post-raw coordinate shift
  }

  // Second pass: emit compensating edits and resolve final caret offsets,
  // accounting for the length change each wrap introduces.
  const edits: CompEdit[] = [];
  const selections: number[] = [];
  let cdelta = 0;
  for (const p of plans) {
    if (p.kind === 'skip') {
      // No text change; the caret stays where the raw edit left it.
      selections.push(p.postStart + p.rawNewLen + cdelta);
      continue;
    }
    const finalStart = p.start + cdelta;
    edits.push({ start: p.start, end: p.end, replacement: p.replacement });
    selections.push(finalStart + p.cursorWithin);
    cdelta += p.replacement.length - (p.end - p.start);
  }

  return { edits, selections };
}
