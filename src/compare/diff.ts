// Core diff engine for the compare feature.
//
// The engine tokenizes both files at a configurable granularity, computes a
// shortest edit script with Myers' O(ND) algorithm, then groups the result
// into coarse operations that map directly onto CriticMarkup markers.
//
// Reconstruction invariant (mirrors kaicrit accept/reject semantics):
//   - Rejecting every marker reproduces file 1 (the original).
//   - Accepting every marker reproduces file 2 (the modified file).

export type Granularity = 'character' | 'word' | 'line';

export type DiffOp =
  | { type: 'equal'; text: string }
  | { type: 'delete'; text: string }
  | { type: 'insert'; text: string }
  | { type: 'replace'; before: string; after: string };

/**
 * Thrown by {@link diff} when the tokenized inputs are too large for the Myers
 * pass to run safely. Myers' worst-case cost here is O((n+m)·D): every step
 * snapshots the full `v` array (`trace.push(v.slice())`), and for two very
 * different files the edit distance D approaches n+m, so memory/time degrade
 * towards O((n+m)²). The guard estimates that cost as the token product `n·m`
 * and bails before the run so a pathological compare cannot freeze or OOM the
 * extension host. The caller decides how to react (e.g. retry at a coarser
 * granularity, or warn the user).
 */
export class DiffTooLargeError extends Error {
  constructor(
    readonly tokenProduct: number,
    readonly limit: number,
  ) {
    super(`Diff input too large: ${tokenProduct} token pairs exceeds limit ${limit}`);
    this.name = 'DiffTooLargeError';
  }
}

/**
 * Split text into tokens. Whitespace is preserved as its own tokens so that
 * concatenating the tokens reproduces the original text exactly, which keeps
 * the reconstruction invariant intact for every granularity.
 */
export function tokenize(text: string, granularity: Granularity): string[] {
  switch (granularity) {
    case 'character':
      return Array.from(text);
    case 'line':
      // Keep the line terminator attached to each line so concatenation is lossless.
      return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    case 'word':
    default:
      // Runs of word characters, runs of whitespace, or single other characters.
      return text.match(/\w+|\s+|[^\w\s]/g) ?? [];
  }
}

type Edit = { type: 'equal' | 'delete' | 'insert'; token: string };

/** Token equality used by Myers; `===` by default. */
type TokenEq = (x: string, y: string) => boolean;

const strictEq: TokenEq = (x, y) => x === y;

/**
 * Whitespace-insensitive token comparison: two tokens match when they are
 * identical once every whitespace character is stripped. This treats differing
 * amounts of whitespace (and pure-whitespace tokens) as equal, mirroring
 * `git diff -w`, while the original tokens are kept verbatim for reconstruction.
 */
const ignoreWhitespaceEq: TokenEq = (x, y) =>
  x === y || x.replace(/\s+/g, '') === y.replace(/\s+/g, '');

/**
 * Myers' shortest edit script over two token arrays. Returns a flat list of
 * per-token edits in original order. Equal edits always carry the token from
 * `a` (file 1), so rejecting them reproduces file 1 regardless of `eq`.
 */
function myers(a: string[], b: string[], eq: TokenEq): Edit[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  // v[k] holds the furthest x reached on diagonal k; trace snapshots v per step.
  const v: number[] = new Array(2 * max + 1).fill(0);
  const trace: number[][] = [];

  let editDistance = -1;
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1]; // move down (insertion from b)
      } else {
        x = v[offset + k - 1] + 1; // move right (deletion from a)
      }
      let y = x - k;
      while (x < n && y < m && eq(a[x], b[y])) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        editDistance = d;
        break;
      }
    }
    if (editDistance !== -1) {
      break;
    }
  }

  // Backtrack through the recorded traces to build the edit script.
  const edits: Edit[] = [];
  let x = n;
  let y = m;
  for (let d = editDistance; d > 0; d--) {
    const vPrev = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && vPrev[offset + k - 1] < vPrev[offset + k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = vPrev[offset + prevK];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      edits.push({ type: 'equal', token: a[x - 1] });
      x--;
      y--;
    }
    if (x > prevX) {
      edits.push({ type: 'delete', token: a[x - 1] });
      x--;
    } else {
      edits.push({ type: 'insert', token: b[y - 1] });
      y--;
    }
  }
  // d === 0 leg: any remaining common prefix.
  while (x > 0 && y > 0) {
    edits.push({ type: 'equal', token: a[x - 1] });
    x--;
    y--;
  }

  edits.reverse();
  return edits;
}

/**
 * Diff two strings and return a list of CriticMarkup-ready operations.
 *
 * When `ignoreWhitespace` is set, tokens that differ only in whitespace are
 * treated as equal during matching, so pure-whitespace differences are not
 * reported as changes. The original tokens are still emitted verbatim, so
 * rejecting every marker continues to reproduce file 1 exactly.
 *
 * When `maxDiffTokens > 0`, the token product `n·m` is checked before the Myers
 * pass and a {@link DiffTooLargeError} is thrown if it exceeds the limit, so a
 * pathological compare cannot freeze the host (see {@link DiffTooLargeError}).
 * A value of `0` disables the guard (used by tests and small synthetic inputs).
 */
export function diff(
  text1: string,
  text2: string,
  granularity: Granularity,
  combineSubstitutions: boolean,
  ignoreWhitespace = false,
  maxDiffTokens = 0,
): DiffOp[] {
  const eq = ignoreWhitespace ? ignoreWhitespaceEq : strictEq;
  const a = tokenize(text1, granularity);
  const b = tokenize(text2, granularity);

  if (maxDiffTokens > 0 && a.length * b.length > maxDiffTokens) {
    throw new DiffTooLargeError(a.length * b.length, maxDiffTokens);
  }

  const edits = myers(a, b, eq);

  // Coalesce consecutive edits of the same kind into runs.
  const runs: Array<{ type: Edit['type']; text: string }> = [];
  for (const edit of edits) {
    const last = runs[runs.length - 1];
    if (last && last.type === edit.type) {
      last.text += edit.token;
    } else {
      runs.push({ type: edit.type, text: edit.token });
    }
  }

  const ops: DiffOp[] = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const next = runs[i + 1];

    if (combineSubstitutions && next) {
      // A deletion immediately followed by an insertion (or vice versa) is a
      // substitution. Myers always emits deletes before inserts on a diagonal,
      // so the delete→insert ordering is the one we encounter.
      if (run.type === 'delete' && next.type === 'insert') {
        ops.push({ type: 'replace', before: run.text, after: next.text });
        i++;
        continue;
      }
      if (run.type === 'insert' && next.type === 'delete') {
        ops.push({ type: 'replace', before: next.text, after: run.text });
        i++;
        continue;
      }
    }

    if (run.type === 'equal') {
      ops.push({ type: 'equal', text: run.text });
    } else if (run.type === 'delete') {
      ops.push({ type: 'delete', text: run.text });
    } else {
      ops.push({ type: 'insert', text: run.text });
    }
  }

  return ignoreWhitespace ? suppressWhitespaceOps(ops) : ops;
}

const WHITESPACE_ONLY = /^\s*$/;

/**
 * Final pass for `ignoreWhitespace`: drop markers that are purely whitespace.
 * `ignoreWhitespaceEq` already collapses tokens that differ only in whitespace,
 * but a count mismatch in standalone whitespace tokens (most visible at
 * `character` granularity) can still leave a whitespace-only insertion or
 * deletion. Suppressing them keeps the reject→file-1 invariant intact:
 *
 *   - a whitespace-only deletion becomes equal text (file 1 keeps it on reject);
 *   - a whitespace-only insertion is dropped (it is absent from file 1 anyway);
 *   - a substitution whose two sides differ only in whitespace keeps file 1's side.
 */
function suppressWhitespaceOps(ops: DiffOp[]): DiffOp[] {
  const result: DiffOp[] = [];
  const pushEqual = (text: string): void => {
    if (text.length === 0) {
      return;
    }
    const last = result[result.length - 1];
    if (last && last.type === 'equal') {
      last.text += text;
    } else {
      result.push({ type: 'equal', text });
    }
  };

  for (const op of ops) {
    if (op.type === 'delete' && WHITESPACE_ONLY.test(op.text)) {
      pushEqual(op.text);
    } else if (op.type === 'insert' && WHITESPACE_ONLY.test(op.text)) {
      // Drop: inserted whitespace is not part of file 1.
    } else if (
      op.type === 'replace' &&
      WHITESPACE_ONLY.test(op.before) &&
      WHITESPACE_ONLY.test(op.after)
    ) {
      pushEqual(op.before);
    } else if (op.type === 'equal') {
      pushEqual(op.text);
    } else {
      result.push(op);
    }
  }

  return result;
}
