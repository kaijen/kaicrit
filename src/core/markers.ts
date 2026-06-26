// Single source of truth for the CriticMarkup marker vocabulary.
//
// Three consumers share this file:
//   - edit/parser.ts   uses findMarkers to locate markers in a document
//   - compare/criticmarkup.ts uses MARKERS to *emit* markers from a diff
//   - preview/markdownIt.ts uses MARKERS to render markers into HTML
//
// The edit parser and the preview tokenizer remain separate implementations
// (they target different engines — a document-wide scan vs. a markdown-it
// inline rule), but every literal delimiter lives here so the five marker
// shapes are defined exactly once.

import { ChangeType } from './types';

/** Opening / separator / closing delimiters for each marker shape. */
export const MARKERS = {
  [ChangeType.Deletion]:     { open: '{--', close: '--}' },
  [ChangeType.Addition]:     { open: '{++', close: '++}' },
  [ChangeType.Substitution]: { open: '{~~', sep: '~>', close: '~~}' },
  [ChangeType.Highlight]:    { open: '{==', close: '==}' },
  [ChangeType.Comment]:      { open: '{>>', close: '<<}' },
} as const;

// Grammar SPECIFICATION (not the scan engine). RE_ALL captures the five marker
// shapes with one group per type — group indices:
//   [1] deletion content
//   [2] addition content
//   [3] substitution old, [4] substitution new
//   [5] highlight content
//   [6] comment content
//
// `findMarkers` below is the actual scanner; it is a hand-rolled linear pass that
// must stay *exactly* equivalent to this regex (a differential test in
// markers.test.ts enforces it match-for-match). The regex is kept as the readable,
// authoritative definition of the grammar — but it is NOT used to scan documents,
// because its global-match retry across start positions is O(n²) on pathological
// input (many unterminated openers, e.g. a stray `{~~`), which froze the extension
// host (issue #63, and the accept/reject "Loading" hang). The linear scanner is O(n).
export const RE_ALL =
  /\{--(.*?)--\}|\{\+\+(.*?)\+\+\}|\{~~(.*?)~>(.*?)~~\}|\{==(.*?)==\}|\{>>(.*?)<<\}/gs;

// One scannable kind per marker shape, derived from MARKERS so the delimiters
// live in exactly one place. `group`/`group2` are the RegExpExecArray slots the
// kind populates, matching RE_ALL's capture layout above (substitution fills
// both 3 and 4; every other type fills a single slot).
interface MarkerKind {
  open: string;
  close: string;
  sep?: string;    // substitution only
  group: number;   // 1..6
  group2?: number; // substitution new side (4)
}

const KINDS: readonly MarkerKind[] = [
  { open: MARKERS[ChangeType.Deletion].open,     close: MARKERS[ChangeType.Deletion].close,     group: 1 },
  { open: MARKERS[ChangeType.Addition].open,     close: MARKERS[ChangeType.Addition].close,     group: 2 },
  {
    open: MARKERS[ChangeType.Substitution].open, close: MARKERS[ChangeType.Substitution].close,
    sep: MARKERS[ChangeType.Substitution].sep,   group: 3, group2: 4,
  },
  { open: MARKERS[ChangeType.Highlight].open,    close: MARKERS[ChangeType.Highlight].close,    group: 5 },
  { open: MARKERS[ChangeType.Comment].open,      close: MARKERS[ChangeType.Comment].close,      group: 6 },
];

// Every opener is exactly 3 chars and starts with '{', so dispatch is an O(1)
// lookup on the 3-char prefix at each '{'.
const OPEN_LEN = 3;
const KIND_BY_OPEN = new Map<string, MarkerKind>(KINDS.map(k => [k.open, k]));

// Build a RegExpExecArray-compatible result so every existing consumer (parser,
// trackChangesEngine, build, filesView) keeps reading `m.index` / `m[0]` /
// `m[1..6]` unchanged. Slots not filled by this kind stay `undefined`, exactly as
// an unmatched alternative is in a real RE_ALL match.
function makeMatch(
  text: string,
  index: number,
  end: number,
  groups: ReadonlyArray<readonly [number, string]>,
): RegExpExecArray {
  const arr: Array<string | undefined> = [text.slice(index, end), undefined, undefined, undefined, undefined, undefined, undefined];
  for (const [g, v] of groups) { arr[g] = v; }
  const result = arr as unknown as RegExpExecArray;
  result.index = index;
  result.input = text;
  // RE_ALL has no named groups; mirror that so the shapes match exactly.
  (result as { groups?: RegExpExecArray['groups'] }).groups = undefined;
  return result;
}

/**
 * Iterate over every CriticMarkup marker in `text`, in document order.
 *
 * A single left-to-right pass: at each `{`, dispatch on the 3-char opener and
 * locate the matching closer (and, for a substitution, the `~>` separator) with
 * `indexOf`. The lazy/shortest-match semantics of RE_ALL fall out naturally —
 * `indexOf` returns the *first* closer, i.e. the shortest content. A marker found
 * inside another marker's content is skipped (scanning resumes past the closer),
 * just as RE_ALL's global match resumes from `lastIndex`.
 *
 * Crucially the pass is O(n): once a closer token has no further occurrence the
 * `find` memo records it as exhausted and never scans to the end again, so a
 * document full of unterminated openers (e.g. a stray `{~~`) costs O(n) instead of
 * the regex's — and a naive re-`indexOf`'s — O(n²). This is what removes the
 * extension-host freeze (issue #63 and the accept/reject "Loading" hang). The
 * yielded objects are RegExpExecArray-compatible, so callers are unchanged.
 */
export function* findMarkers(text: string): IterableIterator<RegExpExecArray> {
  // Forward-only token search. Openers are visited strictly left-to-right, so the
  // `from` passed for any given token is monotonically non-decreasing — which lets
  // us cache: a hit still ahead of `from` is reused, and a token that has run out
  // (at === -1) stays out, so we never re-scan the tail. Keyed by token string
  // (the distinct closers `--}`/`++}`/`~~}`/`==}`/`<<}` and the separator `~>`).
  const memo = new Map<string, { from: number; at: number }>();
  const find = (token: string, from: number): number => {
    const m = memo.get(token);
    if (m) {
      if (m.at === -1) { return -1; }    // exhausted at m.from <= from ⇒ still none
      if (m.at >= from) { return m.at; } // cached hit still at/after from
    }
    const at = text.indexOf(token, from);
    memo.set(token, { from, at });
    return at;
  };

  let i = text.indexOf('{');
  while (i !== -1) {
    const kind = KIND_BY_OPEN.get(text.slice(i, i + OPEN_LEN));
    if (kind === undefined) { i = text.indexOf('{', i + 1); continue; }

    const contentStart = i + OPEN_LEN;

    if (kind.sep !== undefined) {
      // Substitution: first `~>` after the opener, then first closer after it. If
      // the first `~>` has no following closer, no later `~>` can either (it is
      // further right), so failing here matches RE_ALL's backtracking outcome.
      const arrow = find(kind.sep, contentStart);
      if (arrow === -1) { i = text.indexOf('{', i + 1); continue; }
      const close = find(kind.close, arrow + kind.sep.length);
      if (close === -1) { i = text.indexOf('{', i + 1); continue; }
      const end = close + kind.close.length;
      yield makeMatch(text, i, end, [
        [kind.group, text.slice(contentStart, arrow)],
        [kind.group2 as number, text.slice(arrow + kind.sep.length, close)],
      ]);
      i = text.indexOf('{', end);
      continue;
    }

    const close = find(kind.close, contentStart);
    if (close === -1) { i = text.indexOf('{', i + 1); continue; }
    const end = close + kind.close.length;
    yield makeMatch(text, i, end, [[kind.group, text.slice(contentStart, close)]]);
    i = text.indexOf('{', end);
  }
}
