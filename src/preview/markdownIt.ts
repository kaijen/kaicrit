// Renders CriticMarkup in VS Code's built-in Markdown preview.
//
// The `markdown.markdownItPlugins` contribution in package.json tells the
// preview to call the extension's `extendMarkdownIt` (see extension.ts) with
// its live markdown-it instance — there is no webview and no separate build.
// markdown-it has no bundled types here, so the state/instance are typed `any`.

import { parseCommentMeta } from '../core/comment';

// CriticMarkup span definitions, keyed by the two characters that follow the
// opening brace. Substitution (`~~`) and comments (`>>`) are special-cased; the
// rest map to a single HTML tag + CSS class (styled by media/critic.css).
const SPANS: Record<string, { close: string; tag: string; cls: string }> = {
  '++': { close: '++}', tag: 'ins', cls: 'critic-ins' },
  '--': { close: '--}', tag: 'del', cls: 'critic-del' },
  '==': { close: '==}', tag: 'mark', cls: 'critic-mark' },
};

export function criticMarkupPlugin(md: any, opts?: { commentMetadata?: boolean }): any {
  // Whether to split the optional `@author YYYY-MM-DD:` prefix out of comments.
  const commentMeta = opts?.commentMetadata !== false;
  // Inline rule (not a core src-rewrite pass) so CriticMarkup inside code
  // fences/spans is left untouched and nested Markdown is parsed naturally.
  // `{` is already a terminator char for markdown-it's text rule, so the inline
  // parser hands us control whenever it sees one.
  md.inline.ruler.before('emphasis', 'criticmarkup',
    (state: any, silent: boolean) => critic(state, silent, commentMeta));
  return md;
}

function critic(state: any, silent: boolean, commentMeta: boolean): boolean {
  const src: string = state.src;
  const start: number = state.pos;

  if (src.charCodeAt(start) !== 0x7b /* { */) {
    return false;
  }

  const marker = src.slice(start + 1, start + 3);
  const contentStart = start + 3;

  // Substitution: {~~ old ~> new ~~}
  if (marker === '~~') {
    const closeIdx = src.indexOf('~~}', contentStart);
    if (closeIdx < 0) {
      return false;
    }
    if (silent) {
      return true;
    }

    const arrowIdx = src.indexOf('~>', contentStart);
    if (arrowIdx >= 0 && arrowIdx < closeIdx) {
      pushSpan(state, 'del', 'critic-del', contentStart, arrowIdx);
      pushSpan(state, 'ins', 'critic-ins', arrowIdx + 2, closeIdx);
    } else {
      // No arrow: treat the whole body as a deletion rather than dropping it.
      pushSpan(state, 'del', 'critic-del', contentStart, closeIdx);
    }
    state.pos = closeIdx + 3;
    return true;
  }

  // Comment: {>> [@author] [date]: text <<}
  // `indexOf` scans across embedded newlines, so a multi-line comment such as
  // `{>>line1\nline2<<}` (within one paragraph block) is captured as a single
  // span up to `<<}` — the same way every other type is matched. The captured
  // body is re-tokenized below, and media/critic.css keeps its line breaks
  // visible via `white-space: pre-wrap`.
  if (marker === '>>') {
    const closeIdx = src.indexOf('<<}', contentStart);
    if (closeIdx < 0) {
      return false;
    }
    if (silent) {
      return true;
    }
    pushComment(state, contentStart, closeIdx, commentMeta);
    state.pos = closeIdx + 3;
    return true;
  }

  const def = SPANS[marker];
  if (!def) {
    return false;
  }

  const closeIdx = src.indexOf(def.close, contentStart);
  if (closeIdx < 0) {
    return false;
  }
  if (silent) {
    return true;
  }

  pushSpan(state, def.tag, def.cls, contentStart, closeIdx);
  state.pos = closeIdx + def.close.length;
  return true;
}

// Emit a comment span. When metadata is enabled and present, the
// `@author date` prefix is emitted as a separate `.critic-comment-meta` span
// (plain text, not re-tokenized) and only the remaining body is parsed as
// inline Markdown. A plain comment renders exactly as before.
function pushComment(state: any, from: number, to: number, commentMeta: boolean): void {
  const open = state.push('span_open', 'span', 1);
  open.attrSet('class', 'critic-comment');

  let bodyFrom = from;
  if (commentMeta) {
    const meta = parseCommentMeta(state.src.slice(from, to));
    if (meta.author !== undefined || meta.date !== undefined) {
      const label = [
        meta.author !== undefined ? '@' + meta.author : '',
        meta.date ?? '',
      ].filter(Boolean).join(' ');
      const metaOpen = state.push('span_open', 'span', 1);
      metaOpen.attrSet('class', 'critic-comment-meta');
      const token = state.push('text', '', 0);
      token.content = label;
      state.push('span_close', 'span', -1);
      bodyFrom = from + meta.bodyOffset;
    }
  }

  tokenizeInline(state, bodyFrom, to);
  state.push('span_close', 'span', -1);
}

// Emit `<tag class="cls">`, re-parse src[from, to) as inline Markdown into the
// token stream, then emit the closing tag.
function pushSpan(state: any, tag: string, cls: string, from: number, to: number): void {
  const open = state.push(tag + '_open', tag, 1);
  open.attrSet('class', cls);
  tokenizeInline(state, from, to);
  state.push(tag + '_close', tag, -1);
}

// Re-tokenize src[from, to) as inline Markdown into the current token stream,
// restoring the parser's position afterwards.
function tokenizeInline(state: any, from: number, to: number): void {
  const oldPos = state.pos;
  const oldMax = state.posMax;
  state.pos = from;
  state.posMax = to;
  state.md.inline.tokenize(state);
  state.pos = oldPos;
  state.posMax = oldMax;
}
