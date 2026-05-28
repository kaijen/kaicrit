import * as vscode from 'vscode';
import { ChangeType, CriticChange } from './types';
import { parseCriticMarkup } from './parser';

function themeColor(id: string): vscode.ThemeColor {
  return new vscode.ThemeColor(id);
}

export class DecoratorManager {
  private readonly deletionType: vscode.TextEditorDecorationType;
  private readonly additionType: vscode.TextEditorDecorationType;
  private readonly substitutionOldType: vscode.TextEditorDecorationType;
  private readonly substitutionNewType: vscode.TextEditorDecorationType;
  private readonly highlightType: vscode.TextEditorDecorationType;
  private readonly commentType: vscode.TextEditorDecorationType;
  private readonly markerType: vscode.TextEditorDecorationType;

  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private changeCache = new Map<string, CriticChange[]>();

  constructor() {
    this.deletionType = vscode.window.createTextEditorDecorationType({
      textDecoration: 'line-through',
      color: themeColor('kaicrit.deletionForeground'),
    });
    this.additionType = vscode.window.createTextEditorDecorationType({
      textDecoration: 'underline',
      color: themeColor('kaicrit.additionForeground'),
    });
    this.substitutionOldType = vscode.window.createTextEditorDecorationType({
      textDecoration: 'line-through',
      color: themeColor('kaicrit.substitutionOldForeground'),
    });
    this.substitutionNewType = vscode.window.createTextEditorDecorationType({
      textDecoration: 'underline',
      color: themeColor('kaicrit.substitutionNewForeground'),
    });
    this.highlightType = vscode.window.createTextEditorDecorationType({
      backgroundColor: themeColor('kaicrit.highlightBackground'),
      color: themeColor('kaicrit.highlightForeground'),
    });
    this.commentType = vscode.window.createTextEditorDecorationType({
      backgroundColor: themeColor('kaicrit.commentBackground'),
      fontStyle: 'italic',
      color: themeColor('kaicrit.commentForeground'),
      before: { contentText: '⟨ ', color: new vscode.ThemeColor('editorLineNumber.foreground') },
      after:  { contentText: ' ⟩', color: new vscode.ThemeColor('editorLineNumber.foreground') },
    });
    // Dim the marker characters themselves
    this.markerType = vscode.window.createTextEditorDecorationType({
      opacity: '0.4',
    });
  }

  scheduleUpdate(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    const existing = this.timers.get(key);
    if (existing) { clearTimeout(existing); }
    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key);
      const editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
      if (editor) { this.update(editor); }
    }, 16));
  }

  update(editor: vscode.TextEditor): void {
    const changes = parseCriticMarkup(editor.document);
    this.changeCache.set(editor.document.uri.toString(), changes);
    this.applyDecorations(editor, changes);
  }

  clear(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    this.changeCache.delete(key);
    const timer = this.timers.get(key);
    if (timer) { clearTimeout(timer); this.timers.delete(key); }
  }

  getChanges(doc: vscode.TextDocument): CriticChange[] {
    return this.changeCache.get(doc.uri.toString()) ?? [];
  }

  private applyDecorations(editor: vscode.TextEditor, changes: CriticChange[]): void {
    const deletionRanges: vscode.Range[] = [];
    const additionRanges: vscode.Range[] = [];
    const substOldRanges: vscode.Range[] = [];
    const substNewRanges: vscode.Range[] = [];
    const highlightRanges: vscode.Range[] = [];
    const commentRanges: vscode.Range[] = [];
    const markerRanges: vscode.Range[] = [];

    for (const c of changes) {
      switch (c.type) {
        case ChangeType.Deletion:
          if (c.contentRange) { deletionRanges.push(c.contentRange); }
          collectMarkers(c, markerRanges, editor.document, 3, 3);
          break;
        case ChangeType.Addition:
          if (c.contentRange) { additionRanges.push(c.contentRange); }
          collectMarkers(c, markerRanges, editor.document, 3, 3);
          break;
        case ChangeType.Substitution:
          if (c.oldRange) { substOldRanges.push(c.oldRange); }
          if (c.newRange) { substNewRanges.push(c.newRange); }
          // markers: {~~ (3 chars), ~> (2 chars), ~~} (3 chars)
          collectSubstitutionMarkers(c, markerRanges, editor.document, c.oldText ?? '', c.newText ?? '');
          break;
        case ChangeType.Highlight:
          if (c.contentRange) { highlightRanges.push(c.contentRange); }
          collectMarkers(c, markerRanges, editor.document, 3, 3);
          break;
        case ChangeType.Comment:
          if (c.contentRange) { commentRanges.push(c.contentRange); }
          collectMarkers(c, markerRanges, editor.document, 3, 3);
          break;
      }
    }

    editor.setDecorations(this.deletionType,       deletionRanges);
    editor.setDecorations(this.additionType,       additionRanges);
    editor.setDecorations(this.substitutionOldType, substOldRanges);
    editor.setDecorations(this.substitutionNewType, substNewRanges);
    editor.setDecorations(this.highlightType,      highlightRanges);
    editor.setDecorations(this.commentType,        commentRanges);
    editor.setDecorations(this.markerType,         markerRanges);
  }

  dispose(): void {
    this.deletionType.dispose();
    this.additionType.dispose();
    this.substitutionOldType.dispose();
    this.substitutionNewType.dispose();
    this.highlightType.dispose();
    this.commentType.dispose();
    this.markerType.dispose();
    for (const t of this.timers.values()) { clearTimeout(t); }
  }
}

function collectMarkers(
  c: CriticChange,
  out: vscode.Range[],
  doc: vscode.TextDocument,
  openLen: number,
  closeLen: number,
): void {
  const fullStart = doc.offsetAt(c.fullRange.start);
  const fullEnd   = doc.offsetAt(c.fullRange.end);
  out.push(new vscode.Range(
    doc.positionAt(fullStart),
    doc.positionAt(fullStart + openLen),
  ));
  out.push(new vscode.Range(
    doc.positionAt(fullEnd - closeLen),
    doc.positionAt(fullEnd),
  ));
}

function collectSubstitutionMarkers(
  c: CriticChange,
  out: vscode.Range[],
  doc: vscode.TextDocument,
  oldText: string,
  newText: string,
): void {
  const fullStart = doc.offsetAt(c.fullRange.start);
  const fullEnd   = doc.offsetAt(c.fullRange.end);
  // opening {~~
  out.push(new vscode.Range(doc.positionAt(fullStart), doc.positionAt(fullStart + 3)));
  // separator ~>
  const sepOffset = fullStart + 3 + oldText.length;
  out.push(new vscode.Range(doc.positionAt(sepOffset), doc.positionAt(sepOffset + 2)));
  // closing ~~}
  out.push(new vscode.Range(doc.positionAt(fullEnd - 3), doc.positionAt(fullEnd)));
}
