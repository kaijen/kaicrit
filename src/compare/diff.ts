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

/**
 * Myers' shortest edit script over two token arrays. Returns a flat list of
 * per-token edits in original order.
 */
function myers(a: string[], b: string[]): Edit[] {
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
      while (x < n && y < m && a[x] === b[y]) {
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
 */
export function diff(
  text1: string,
  text2: string,
  granularity: Granularity,
  combineSubstitutions: boolean,
): DiffOp[] {
  const edits = myers(tokenize(text1, granularity), tokenize(text2, granularity));

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

  return ops;
}
