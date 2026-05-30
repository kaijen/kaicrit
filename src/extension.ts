import * as vscode from 'vscode';
import { DecoratorManager } from './edit/decorator';
import { registerEditCommands } from './edit/commands';
import { registerCompareCommands } from './compare/commands';
import { criticMarkupPlugin } from './preview/markdownIt';

export function activate(ctx: vscode.ExtensionContext) {
  // ── Edit feature: decorate + navigate + accept/reject in the editor ──────────
  const dm = new DecoratorManager();
  ctx.subscriptions.push(dm);

  registerEditCommands(ctx, dm);

  // Decorate already-open editors on activation
  for (const editor of vscode.window.visibleTextEditors) {
    dm.update(editor);
  }

  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) { dm.update(editor); }
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      dm.scheduleUpdate(event.document);
    }),
    vscode.workspace.onDidCloseTextDocument(doc => {
      dm.clear(doc);
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
