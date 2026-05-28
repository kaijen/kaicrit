import * as vscode from 'vscode';
import { DecoratorManager } from './decorator';
import { registerAllCommands } from './commands';

export function activate(ctx: vscode.ExtensionContext): void {
  const dm = new DecoratorManager();
  ctx.subscriptions.push(dm);

  registerAllCommands(ctx, dm);

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
}

export function deactivate(): void {
  // DecoratorManager is disposed via ctx.subscriptions
}
