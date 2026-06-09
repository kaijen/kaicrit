import * as vscode from 'vscode';
import { ChangeType, CriticChange } from '../core/types';
import { findMarkers } from '../core/markers';
import { parseCommentMeta } from '../core/comment';

// Default ceiling for `kaicrit.edit.maxParseLength` (characters). Above this a
// document is left unparsed to avoid the marker regex's O(n²) worst case on
// pathological input (many unterminated openers — issue #63).
const DEFAULT_MAX_PARSE_LENGTH = 2_000_000;

// Documents already warned about exceeding the parse-length guard, so the hint
// is shown once per crossing rather than on every debounced parse. Cleared when
// a document drops back under the limit (or loses all '{').
const overLimitWarned = new Set<string>();

export function parseCriticMarkup(doc: vscode.TextDocument): CriticChange[] {
  const text = doc.getText();
  const results: CriticChange[] = [];
  const key = doc.uri.toString();

  // Cheap pre-check: every CriticMarkup marker opens with '{'. A document
  // without one cannot contain a marker, so we skip the full regex scan (and
  // the configuration read below) entirely. This keeps the per-keystroke
  // (debounced) update path free for large source files that never carry
  // CriticMarkup. Returning an empty array also lets the caller's cache make a
  // correct "had changes → none" transition once the last marker is removed.
  if (text.indexOf('{') === -1) {
    overLimitWarned.delete(key);
    return results;
  }

  // Scope config reads to the document so folder-/language-specific overrides
  // apply (issue #61).
  const cfg = vscode.workspace.getConfiguration('kaicrit', doc);

  // Size guard: the marker regex scans lazily to the document end for every
  // unterminated opener, so a huge document full of unclosed `{--` openers can
  // freeze the host (O(n²)) — the editor counterpart of compare's maxDiffTokens.
  // Above the limit we skip parsing entirely (decorations go inert) and surface
  // a one-time status hint. 0 disables the guard.
  const maxLen = cfg.get<number>('edit.maxParseLength', DEFAULT_MAX_PARSE_LENGTH);
  if (maxLen > 0 && text.length > maxLen) {
    if (!overLimitWarned.has(key)) {
      overLimitWarned.add(key);
      vscode.window.setStatusBarMessage(
        `kaicrit: document exceeds ${maxLen} characters — CriticMarkup parsing disabled (kaicrit.edit.maxParseLength).`,
        5000);
    }
    return results;
  }
  overLimitWarned.delete(key);

  // The author/date convention is opt-out: when disabled, comments are parsed
  // as plain text and no metadata is extracted.
  const metaEnabled = cfg.get<boolean>('edit.commentMetadata', true);

  for (const match of findMarkers(text)) {
    const start = doc.positionAt(match.index);
    const end = doc.positionAt(match.index + match[0].length);
    const fullRange = new vscode.Range(start, end);

    if (match[1] !== undefined) {
      const contentStart = doc.positionAt(match.index + 3);
      const contentEnd = doc.positionAt(match.index + match[0].length - 3);
      results.push({
        type: ChangeType.Deletion,
        fullRange,
        contentRange: new vscode.Range(contentStart, contentEnd),
        text: match[1],
        raw: match[0],
      });
    } else if (match[2] !== undefined) {
      const contentStart = doc.positionAt(match.index + 3);
      const contentEnd = doc.positionAt(match.index + match[0].length - 3);
      results.push({
        type: ChangeType.Addition,
        fullRange,
        contentRange: new vscode.Range(contentStart, contentEnd),
        text: match[2],
        raw: match[0],
      });
    } else if (match[3] !== undefined) {
      // Substitution: {~~old~>new~~}
      // markers: {~~ (3), ~> (2), ~~} (3)
      const oldStart = doc.positionAt(match.index + 3);
      const oldEnd = doc.positionAt(match.index + 3 + match[3].length);
      const newStart = doc.positionAt(match.index + 3 + match[3].length + 2);
      const newEnd = doc.positionAt(match.index + match[0].length - 3);
      results.push({
        type: ChangeType.Substitution,
        fullRange,
        oldRange: new vscode.Range(oldStart, oldEnd),
        newRange: new vscode.Range(newStart, newEnd),
        oldText: match[3],
        newText: match[4],
        raw: match[0],
      });
    } else if (match[5] !== undefined) {
      const contentStart = doc.positionAt(match.index + 3);
      const contentEnd = doc.positionAt(match.index + match[0].length - 3);
      results.push({
        type: ChangeType.Highlight,
        fullRange,
        contentRange: new vscode.Range(contentStart, contentEnd),
        text: match[5],
        raw: match[0],
      });
    } else if (match[6] !== undefined) {
      const contentStart = doc.positionAt(match.index + 3);
      const contentEnd = doc.positionAt(match.index + match[0].length - 3);
      const change: CriticChange = {
        type: ChangeType.Comment,
        fullRange,
        contentRange: new vscode.Range(contentStart, contentEnd),
        text: match[6],
        raw: match[0],
      };
      if (metaEnabled) {
        const meta = parseCommentMeta(match[6]);
        if (meta.author !== undefined || meta.date !== undefined) {
          change.author = meta.author;
          change.date = meta.date;
        }
      }
      results.push(change);
    }
  }

  return results;
}
