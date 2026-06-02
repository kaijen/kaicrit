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
import { MARKERS, findMarkers } from '../core/markers';
import { resolveReplacement, Resolvable } from './resolve';

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

// Map a RE_ALL match to its ChangeType. Shared by scanMarkers (markers already in
// the document) and matchToResolvable (markers found inside freshly inserted text).
function markerType(m: RegExpMatchArray): ChangeType {
  if (m[1] !== undefined) { return ChangeType.Deletion; }
  if (m[2] !== undefined) { return ChangeType.Addition; }
  if (m[3] !== undefined) { return ChangeType.Substitution; }
  if (m[5] !== undefined) { return ChangeType.Highlight; }
  return ChangeType.Comment;
}

// Scan the markers that could touch [region.start, region.end]. We stop as soon
// as a marker starts past region.end (markers further right cannot enclose or be
// adjacent to the region), bounding the work to the text up to the edit.
function scanMarkers(preText: string, regionEnd: number): MarkerSpan[] {
  const spans: MarkerSpan[] = [];
  for (const m of findMarkers(preText)) {
    const start = m.index;
    if (start > regionEnd) { break; }
    const end = start + m[0].length;
    spans.push({
      type: markerType(m),
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

// Half-open interval overlap test: do [aStart, aEnd) and [bStart, bEnd) share
// at least one position?
function intersects(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

// Project a scanned marker span onto the slice of CriticChange that
// resolveReplacement needs. Substitutions store their two sides as one
// `O~>N` string in `content`; split it back on the shared `~>` separator (RE_ALL
// guarantees the arrow is present for substitutions).
function toResolvable(s: { type: ChangeType; content: string }): Resolvable {
  if (s.type === ChangeType.Substitution) {
    const sep = MARKERS[ChangeType.Substitution].sep;
    const i = s.content.indexOf(sep);
    return {
      type: s.type,
      oldText: i === -1 ? s.content : s.content.slice(0, i),
      newText: i === -1 ? '' : s.content.slice(i + sep.length),
    };
  }
  return { type: s.type, text: s.content };
}

// Same projection, but for a marker found *inside* freshly inserted text (a
// RE_ALL match rather than a scanned MarkerSpan). The content is the match minus
// its 3-char opener/closer; toResolvable handles the substitution split.
function matchToResolvable(m: RegExpMatchArray): Resolvable {
  return toResolvable({
    type: markerType(m),
    content: m[0].slice(OPEN_LEN, -CLOSE_LEN),
  });
}

// Flatten any complete CriticMarkup markers inside `text` to their accept-form
// (plain text), leaving the surrounding plain runs untouched. Used when text is
// absorbed *into* an existing marker's content: keeping the inner markers verbatim
// would nest (paste {++any++} inside {++an|y++} → {++an{++any++}y++}). Returns the
// flattened string, or `null` when there is nothing to flatten — `text` contains
// no whole marker, or flattening leaves it unchanged. Only one level deep:
// already-nested material (`{++a{++b++}++}`) and unterminated delimiters (`{++`)
// match no whole marker and stay literal.
function flattenInnerMarkers(text: string): string | null {
  const inner = text.length > 0 ? [...findMarkers(text)] : [];
  if (inner.length === 0) { return null; }
  let flat = '';
  let pos = 0;
  for (const m of inner) {
    flat += text.slice(pos, m.index);
    flat += resolveReplacement(matchToResolvable(m), 'accept');
    pos = m.index + m[0].length;
  }
  flat += text.slice(pos);
  return flat !== text ? flat : null;
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

  // Issue #34 — never create a marker inside another marker. If the edited
  // region lies inside an existing marker's *content*, the edit is absorbed and
  // no wrap is emitted: typing or deleting inside an addition (or a
  // substitution's new side) just grows that side, and editing the interior of a
  // highlight/comment/deletion stays literal. Either way no nested markup can
  // form. We match the innermost enclosing marker so adjacent markers can't
  // shadow a tighter one. A delete contributes `rawNewLen` 0 (newText is empty).
  const enclosing = spans
    .filter(s => offset >= s.contentStart && delEnd <= s.contentEnd)
    .sort((a, b) => (a.contentEnd - a.contentStart) - (b.contentEnd - b.contentStart))[0];
  if (enclosing) {
    // If the absorbed text itself contains complete markers, keeping it verbatim
    // would nest (paste {++any++} inside {++an|y++} → {++an{++any++}y++}). Flatten
    // each inner marker to its accept-form so the enclosing change just grows by
    // the resulting plain text — this is the inside-a-marker counterpart to the
    // #40 plain-text paste handling below. Plain typing (no marker) keeps the skip.
    const flat = flattenInnerMarkers(newText);
    if (flat !== null) {
      return {
        kind: 'wrap',
        start: postStart,
        end: postStart + newText.length,
        replacement: flat,
        cursorWithin: flat.length, // caret after the flattened text
      };
    }
    return { kind: 'skip', postStart, rawNewLen: newText.length };
  }

  // Issue #38 — removing (deleting or replacing) any *delimiter* character of an
  // existing marker is interpreted as REJECTING that whole marker, reusing the
  // shared accept/reject semantics (resolveReplacement). This is the boundary
  // counterpart to the #34 absorption above: an edit *inside* a marker's content
  // grows/keeps it (skip), an edit that removes part of a marker's opener/closer
  // resolves it. A pure insertion (oldLength === 0) removes no delimiter char, so
  // it never triggers a reject. We only act when the edited span stays within a
  // single marker; an edit spilling past the marker bounds (e.g. a selection that
  // also eats following prose) falls through to the normal wrap handling. The
  // emitted edit replaces the marker's *post-raw-edit* span — its live length is
  // the original length adjusted by this raw edit (− oldLength + newText.length) —
  // and `delta` shifts the marker from pre- to post-raw-edit coordinates.
  if (oldLength > 0) {
    const hit = spans.find(s =>
      offset >= s.start && delEnd <= s.end &&
      (intersects(offset, delEnd, s.start, s.contentStart) ||
        intersects(offset, delEnd, s.contentEnd, s.end)));
    if (hit) {
      const replacement = resolveReplacement(toResolvable(hit), 'reject');
      const start = hit.start + delta;
      const end = start + (hit.end - hit.start) - oldLength + newText.length;
      return { kind: 'wrap', start, end, replacement, cursorWithin: replacement.length };
    }
  }

  // Issue #40 — inserted/pasted text that already contains complete CriticMarkup
  // must not be re-wrapped (that would nest, e.g. paste {++a++} → {++{++a++}++}).
  // We keep every embedded marker literal and wrap only the surrounding plain
  // runs as additions; a replaced plain selection (oldLength > 0) is tracked as a
  // leading deletion so the gesture still reads as "old removed, new inserted".
  // This sits after the #34 absorption and #38 delimiter-reject checks: pasting
  // markup *inside* a marker is still absorbed, and overwriting a marker's
  // delimiter still rejects it. Unterminated/partial input (e.g. `{++a`) matches
  // no marker here and falls through to the normal wrap below.
  const inserted = newText.length > 0 ? [...findMarkers(newText)] : [];
  if (inserted.length > 0) {
    let body = '';
    let pos = 0;
    for (const m of inserted) {
      if (m.index > pos) { body += addMarker(newText.slice(pos, m.index)); }
      body += m[0]; // keep the already-complete marker verbatim
      pos = m.index + m[0].length;
    }
    if (pos < newText.length) { body += addMarker(newText.slice(pos)); }

    const replacement = (oldLength > 0 ? delMarker(oldText) : '') + body;
    if (replacement === newText) {
      // Pure insertion of nothing-but-markers: the raw text is already final.
      return { kind: 'skip', postStart, rawNewLen: newText.length };
    }
    return {
      kind: 'wrap',
      start: postStart,
      end: postStart + newText.length,
      replacement,
      cursorWithin: replacement.length, // caret after the whole pasted block
    };
  }

  const isInsert = oldLength === 0 && newText.length > 0;
  const isDelete = oldLength > 0 && newText.length === 0;

  if (isInsert) {
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

  // Replacement (both sides non-empty) of plain text → a substitution marker.
  // (Replacements inside an existing marker were already absorbed above.)
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

// Normal-mode (Track Changes OFF) counterpart that does ONE thing: when an
// insertion lands inside the *content* of an existing marker and the inserted
// text itself contains complete markers, flatten those inner markers to their
// accept-form so no nested (spec-invalid) markup is created. This reuses only the
// issue-#34 flatten — it never wraps plain text as an addition, never rejects a
// delimiter (#38), and never wraps standalone pasted markup (#40). Every other
// case returns no edits, so the caller leaves the edit untouched (pure
// passthrough): plain text pasted in normal mode stays plain text.
//
// `preText` need only be byte-accurate up to each edit's region — the deleted
// span's content is never inspected (scanMarkers reads the intact prefix and the
// marker lengths), which lets the caller reconstruct it from the post-edit
// document without the original deleted text. See trackChanges.handleNormalMode.
export function computeNormalModeFlatten(preText: string, rawEdits: RawEdit[]): TrackResult {
  const sorted = [...rawEdits].sort((a, b) => a.offset - b.offset);

  const edits: CompEdit[] = [];
  const selections: number[] = [];
  let delta = 0;   // pre→post-raw coordinate shift
  let cdelta = 0;  // length change introduced by the flatten edits we emit
  for (const e of sorted) {
    const delEnd = e.offset + e.oldLength;
    const postStart = e.offset + delta;
    delta += e.newText.length - e.oldLength;

    const spans = scanMarkers(preText, delEnd);
    const enclosing = spans
      .filter(s => e.offset >= s.contentStart && delEnd <= s.contentEnd)
      .sort((a, b) => (a.contentEnd - a.contentStart) - (b.contentEnd - b.contentStart))[0];
    if (!enclosing) { continue; }

    const flat = flattenInnerMarkers(e.newText);
    if (flat === null) { continue; }

    const start = postStart;
    const end = postStart + e.newText.length;
    edits.push({ start, end, replacement: flat });
    selections.push(start + cdelta + flat.length); // caret after the flattened text
    cdelta += flat.length - (end - start);
  }

  return { edits, selections };
}
