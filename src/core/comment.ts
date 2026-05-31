// Comment metadata convention (an extension on top of CriticMarkup).
//
// A comment may optionally start with an author and/or an ISO date, separated
// from the comment body by a colon:
//
//   {>>@kai 2026-05-31: needs a source<<}
//   {>>@kai: looks good<<}
//   {>>2026-05-31: revisit later<<}
//
// The convention is strictly backwards compatible: a comment whose body does
// not match the `[@author] [YYYY-MM-DD]:` prefix is treated as a plain comment
// with no metadata. Both the edit parser and the preview tokenizer split the
// metadata via this single pure helper so the convention is defined once.

export interface CommentMeta {
  /** `@author` token without the leading `@` (undefined when absent). */
  author?: string;
  /** ISO `YYYY-MM-DD` date (undefined when absent). */
  date?: string;
  /** Comment text after the metadata prefix (the whole content when none). */
  body: string;
  /** Offset within the content where `body` starts (0 when no metadata). */
  bodyOffset: number;
}

// Leading `@author`, optional ISO date, then a `:` separator. At least one of
// author/date must be present for the prefix to count as metadata (enforced by
// the caller checking the captured groups), so a plain `Note: ...` comment is
// left untouched.
const META_RE = /^[ \t]*(?:@(\S+))?[ \t]*(\d{4}-\d{2}-\d{2})?[ \t]*:[ \t]?/;

export function parseCommentMeta(content: string): CommentMeta {
  const m = META_RE.exec(content);
  if (m && (m[1] !== undefined || m[2] !== undefined)) {
    return {
      author: m[1],
      date: m[2],
      body: content.slice(m[0].length),
      bodyOffset: m[0].length,
    };
  }
  return { body: content, bodyOffset: 0 };
}
