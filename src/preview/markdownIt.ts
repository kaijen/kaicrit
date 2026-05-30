// Renders CriticMarkup in VS Code's built-in Markdown preview.
//
// The `markdown.markdownItPlugins` contribution in package.json tells the
// preview to call the extension's `extendMarkdownIt` (see extension.ts) with
// its live markdown-it instance — there is no webview and no separate build.
// markdown-it has no bundled types here, so the state/instance are typed `any`.

// CriticMarkup span definitions, keyed by the two characters that follow the
// opening brace. Substitution (`~~`) is special-cased (it splits on `~>`); the
// rest map to a single HTML tag + CSS class (styled by media/critic.css).
const SPANS: Record<string, { close: string; tag: string; cls: string }> = {
  '++': { close: '++}', tag: 'ins', cls: 'critic-ins' },
  '--': { close: '--}', tag: 'del', cls: 'critic-del' },
  '==': { close: '==}', tag: 'mark', cls: 'critic-mark' },
  '>>': { close: '<<}', tag: 'span', cls: 'critic-comment' },
};

export function criticMarkupPlugin(md: any): any {
  // Inline rule (not a core src-rewrite pass) so CriticMarkup inside code
  // fences/spans is left untouched and nested Markdown is parsed naturally.
  // `{` is already a terminator char for markdown-it's text rule, so the inline
  // parser hands us control whenever it sees one.
  md.inline.ruler.before('emphasis', 'criticmarkup', critic);
  return md;
}

function critic(state: any, silent: boolean): boolean {
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

// Emit `<tag class="cls">`, re-parse src[from, to) as inline Markdown into the
// token stream, then emit the closing tag.
function pushSpan(state: any, tag: string, cls: string, from: number, to: number): void {
  const open = state.push(tag + '_open', tag, 1);
  open.attrSet('class', cls);

  const oldPos = state.pos;
  const oldMax = state.posMax;
  state.pos = from;
  state.posMax = to;
  state.md.inline.tokenize(state);
  state.pos = oldPos;
  state.posMax = oldMax;

  state.push(tag + '_close', tag, -1);
}
