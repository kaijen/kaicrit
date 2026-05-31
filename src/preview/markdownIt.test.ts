// Tests for the markdown-it CriticMarkup plugin.
//
// markdown-it is supplied by VS Code's built-in preview at runtime and is not a
// dependency here, so these tests drive the inline rule directly through a
// minimal fake `state`/`md` pair. We capture the rule registered via
// `md.inline.ruler.before`, run it over a source string, and inspect the tokens
// it pushes — no Extension Host (and no markdown-it) required.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { criticMarkupPlugin } from './markdownIt';

interface FakeToken {
  type: string;
  tag: string;
  nesting: number;
  attrs: Record<string, string>;
  content: string;
  attrSet(key: string, value: string): void;
}

type Rule = (state: any, silent: boolean) => boolean;

function makeMd(): { md: any; getRule: () => Rule } {
  let rule: Rule | undefined;
  const md = {
    inline: {
      ruler: {
        before(_anchor: string, _name: string, fn: Rule) {
          rule = fn;
        },
      },
      // Stand-in for markdown-it's inline tokenizer: emit one text token for the
      // current [pos, posMax) slice so re-tokenized content is observable.
      tokenize(state: any) {
        const token = makeToken('text', '', 0);
        token.content = state.src.slice(state.pos, state.posMax);
        state.tokens.push(token);
      },
    },
  };
  return { md, getRule: () => rule! };
}

function makeToken(type: string, tag: string, nesting: number): FakeToken {
  return {
    type,
    tag,
    nesting,
    attrs: {},
    content: '',
    attrSet(key: string, value: string) {
      this.attrs[key] = value;
    },
  };
}

function makeState(src: string, md: any) {
  return {
    src,
    pos: 0,
    posMax: src.length,
    md,
    tokens: [] as FakeToken[],
    push(type: string, tag: string, nesting: number): FakeToken {
      const token = makeToken(type, tag, nesting);
      this.tokens.push(token);
      return token;
    },
  };
}

/** Run the plugin's inline rule once at pos 0 over `src`. */
function run(src: string, opts?: { commentMetadata?: boolean }) {
  const { md, getRule } = makeMd();
  criticMarkupPlugin(md, opts);
  const state = makeState(src, md);
  const handled = getRule()(state, false);
  const classes = state.tokens
    .map((t) => t.attrs['class'])
    .filter((c): c is string => c !== undefined);
  return { handled, state, classes };
}

test('substitution with ~> renders del + ins spans', () => {
  const { handled, classes, state } = run('{~~old~>new~~}');
  assert.equal(handled, true);
  assert.deepEqual(classes, ['critic-del', 'critic-ins']);
  assert.equal(state.pos, '{~~old~>new~~}'.length);
});

test('arrow-less {~~x~~} is ignored, matching the editor parser', () => {
  const { handled, classes, state } = run('{~~x~~}');
  // Not handled by the critic rule -> left to markdown-it's normal text rules,
  // exactly as RE_ALL ignores it (neither a deletion nor a substitution).
  assert.equal(handled, false);
  assert.equal(classes.length, 0);
  assert.equal(state.tokens.length, 0);
  assert.equal(state.pos, 0);
});

test('deletion renders a del span (and is distinct from arrow-less substitution)', () => {
  const { handled, classes } = run('{--gone--}');
  assert.equal(handled, true);
  assert.deepEqual(classes, ['critic-del']);
});

test('addition and highlight render their spans', () => {
  assert.deepEqual(run('{++new++}').classes, ['critic-ins']);
  assert.deepEqual(run('{==hl==}').classes, ['critic-mark']);
});

test('comment renders a critic-comment span', () => {
  const { handled, classes } = run('{>>note<<}');
  assert.equal(handled, true);
  assert.deepEqual(classes, ['critic-comment']);
});

test('comment metadata is split into a critic-comment-meta span when enabled', () => {
  const { classes } = run('{>>@kai 2026-05-31: text<<}', { commentMetadata: true });
  assert.deepEqual(classes, ['critic-comment', 'critic-comment-meta']);
});

test('comment metadata is not split when disabled', () => {
  const { classes } = run('{>>@kai 2026-05-31: text<<}', { commentMetadata: false });
  assert.deepEqual(classes, ['critic-comment']);
});

test('multi-line comment is captured as a single span across the newline', () => {
  const src = '{>>line1\nline2<<}';
  const { handled, classes, state } = run(src);
  assert.equal(handled, true);
  assert.deepEqual(classes, ['critic-comment']);
  // The whole body (including the newline) is re-tokenized into one text token.
  const text = state.tokens.find((t) => t.type === 'text');
  assert.equal(text?.content, 'line1\nline2');
  assert.equal(state.pos, src.length);
});

test('substitution with an empty side still emits both spans', () => {
  assert.deepEqual(run('{~~~>new~~}').classes, ['critic-del', 'critic-ins']);
  assert.deepEqual(run('{~~old~>~~}').classes, ['critic-del', 'critic-ins']);
});

test('unterminated marker is left for normal text rules', () => {
  const { handled, state } = run('{--no close');
  assert.equal(handled, false);
  assert.equal(state.pos, 0);
});
