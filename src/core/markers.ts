// Single source of truth for the CriticMarkup marker vocabulary.
//
// Three consumers share this file:
//   - edit/parser.ts   uses findMarkers (over RE_ALL) to locate markers in a document
//   - compare/criticmarkup.ts uses MARKERS to *emit* markers from a diff
//   - preview/markdownIt.ts uses MARKERS to render markers into HTML
//
// The edit parser and the preview tokenizer remain separate implementations
// (they target different engines — a document-wide regex vs. a markdown-it
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

// Single-pass regex — group indices:
// [1] deletion content
// [2] addition content
// [3] substitution old, [4] substitution new
// [5] highlight content
// [6] comment content
export const RE_ALL =
  /\{--(.*?)--\}|\{\+\+(.*?)\+\+\}|\{~~(.*?)~>(.*?)~~\}|\{==(.*?)==\}|\{>>(.*?)<<\}/gs;

/**
 * Iterate over every CriticMarkup marker in `text`, in document order.
 *
 * Backed by `String.prototype.matchAll`, which runs against an internal clone
 * of the regex. The shared, global `RE_ALL` is therefore never mutated — there
 * is no `lastIndex` state shared between callers, so concurrent / reentrant use
 * is safe. Prefer this helper over calling `RE_ALL.exec` directly.
 */
export function findMarkers(text: string): IterableIterator<RegExpExecArray> {
  return text.matchAll(RE_ALL) as IterableIterator<RegExpExecArray>;
}
