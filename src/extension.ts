import * as vscode from 'vscode';
import { DecoratorManager } from './edit/decorator';
import { StatusBarManager } from './edit/statusBar';
import { CriticCodeLensProvider } from './edit/codeLens';
import { ChangesTreeProvider } from './edit/changesView';
import { TrackChangesManager } from './edit/trackChanges';
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

  // Track Changes: live recorder that rewrites raw edits into CriticMarkup.
  // State is per document; toggled via kaicrit.toggleTrackChanges.
  const tcm = new TrackChangesManager();
  ctx.subscriptions.push(tcm);

  registerEditCommands(ctx, dm, tcm);

  // Inline "Accept | Reject" CodeLens above each change. Reuses the decorator's
  // change cache and refreshes when it updates (debounced).
  const codeLens = new CriticCodeLensProvider(dm);
  ctx.subscriptions.push(
    codeLens,
    vscode.languages.registerCodeLensProvider(
      [{ scheme: 'file' }, { scheme: 'untitled' }],
      codeLens,
    ),
  );

  // Sidebar overview: lists the active document's changes grouped by type, with
  // click-to-jump and inline accept/reject. Fed from the same change cache.
  const changesView = new ChangesTreeProvider(dm);
  ctx.subscriptions.push(
    changesView,
    vscode.window.createTreeView('kaicrit.changes', { treeDataProvider: changesView }),
  );

  // Decorate already-open editors on activation
  for (const editor of vscode.window.visibleTextEditors) {
    dm.update(editor);
  }
  sb.update(vscode.window.activeTextEditor);
  if (vscode.window.activeTextEditor) {
    tcm.applyDefault(vscode.window.activeTextEditor.document);
  }
  tcm.syncActiveEditor(vscode.window.activeTextEditor);
  dm.syncContext(vscode.window.activeTextEditor);

  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) { dm.update(editor); tcm.applyDefault(editor.document); }
      sb.update(editor);
      tcm.syncActiveEditor(editor);
      dm.syncContext(editor);
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      // Track Changes runs first: it may apply a compensating edit, which fires
      // another change event that re-triggers the decorator refresh below.
      tcm.handleChange(event);
      dm.scheduleUpdate(event.document);
    }),
    vscode.workspace.onDidCloseTextDocument(doc => {
      dm.clear(doc);
      tcm.forget(doc);
    }),
    // Refresh the status bar whenever the active editor's changes are re-parsed
    // (typing, accept/reject, navigation-triggered updates).
    dm.onDidUpdate(editor => {
      if (editor === vscode.window.activeTextEditor) {
        sb.update(editor);
        dm.syncContext(editor);
      }
    }),
  );

  // ── Compare feature: diff two files into a CriticMarkup document ─────────────
  registerCompareCommands(ctx);

  // ── Preview feature: render CriticMarkup in the built-in Markdown preview ────
  // The preview calls extendMarkdownIt with its live markdown-it instance.
  return {
    extendMarkdownIt(md: any) {
      const commentMetadata = vscode.workspace
        .getConfiguration('kaicrit')
        .get<boolean>('edit.commentMetadata', true);
      return md.use(criticMarkupPlugin, { commentMetadata });
    },
  };
}

export function deactivate(): void {
  // DecoratorManager is disposed via ctx.subscriptions
}
