import * as vscode from 'vscode';
import { ChangeType, CriticChange } from '../core/types';
import { RE_ALL } from '../core/markers';
import { parseCommentMeta } from '../core/comment';

export function parseCriticMarkup(doc: vscode.TextDocument): CriticChange[] {
  const text = doc.getText();
  const results: CriticChange[] = [];
  let match: RegExpExecArray | null;

  // The author/date convention is opt-out: when disabled, comments are parsed
  // as plain text and no metadata is extracted.
  const metaEnabled = vscode.workspace
    .getConfiguration('kaicrit')
    .get<boolean>('edit.commentMetadata', true);

  RE_ALL.lastIndex = 0;
  while ((match = RE_ALL.exec(text)) !== null) {
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
      });
    } else if (match[2] !== undefined) {
      const contentStart = doc.positionAt(match.index + 3);
      const contentEnd = doc.positionAt(match.index + match[0].length - 3);
      results.push({
        type: ChangeType.Addition,
        fullRange,
        contentRange: new vscode.Range(contentStart, contentEnd),
        text: match[2],
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
      });
    } else if (match[5] !== undefined) {
      const contentStart = doc.positionAt(match.index + 3);
      const contentEnd = doc.positionAt(match.index + match[0].length - 3);
      results.push({
        type: ChangeType.Highlight,
        fullRange,
        contentRange: new vscode.Range(contentStart, contentEnd),
        text: match[5],
      });
    } else if (match[6] !== undefined) {
      const contentStart = doc.positionAt(match.index + 3);
      const contentEnd = doc.positionAt(match.index + match[0].length - 3);
      const change: CriticChange = {
        type: ChangeType.Comment,
        fullRange,
        contentRange: new vscode.Range(contentStart, contentEnd),
        text: match[6],
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
