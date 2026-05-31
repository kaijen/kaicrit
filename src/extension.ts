import * as vscode from 'vscode';
import { DecoratorManager } from './edit/decorator';
import { StatusBarManager } from './edit/statusBar';
import { registerEditCommands } from './edit/commands';
import { registerCompareCommands } from './compare/commands';
import { criticMarkupPlugin } from './preview/markdownIt';

export function activate(ctx: vscode.ExtensionContext) {
  // ── Edit feature: decorate + navigate + accept/reject in the editor ──────────
  const dm = new DecoratorManager();
  ctx.subscriptions.push(dm);

  // Status bar: per-type change counts for the active editor, fed from the
  // decorator's change cache (no extra parsing).
  const sb = new StatusBarManager(dm);
  ctx.subscriptions.push(sb);

  registerEditCommands(ctx, dm);

  // Decorate already-open editors on activation
  for (const editor of vscode.window.visibleTextEditors) {
    dm.update(editor);
  }
  sb.update(vscode.window.activeTextEditor);

  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) { dm.update(editor); }
      sb.update(editor);
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      dm.scheduleUpdate(event.document);
    }),
    vscode.workspace.onDidCloseTextDocument(doc => {
      dm.clear(doc);
    }),
    // Refresh the status bar whenever the active editor's changes are re-parsed
    // (typing, accept/reject, navigation-triggered updates).
    dm.onDidUpdate(editor => {
      if (editor === vscode.window.activeTextEditor) { sb.update(editor); }
    }),
  );

  // ── Compare feature: diff two files into a CriticMarkup document ─────────────
  registerCompareCommands(ctx);

  // ── Preview feature: render CriticMarkup in the built-in Markdown preview ────
  // The preview calls extendMarkdownIt with its live markdown-it instance.
  return {
    extendMarkdownIt(md: any) {
      return md.use(criticMarkupPlugin);
    },
  };
}

export function deactivate(): void {
  // DecoratorManager is disposed via ctx.subscriptions
}
