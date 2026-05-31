import * as vscode from 'vscode';
import { parseCriticMarkup } from './parser';
import { DecoratorManager } from './decorator';

/**
 * Renders clickable "Accept | Reject" actions above every CriticMarkup change,
 * so changes can be resolved without knowing the keyboard shortcuts.
 *
 * Lenses are built from the `DecoratorManager`'s change cache (no extra scan)
 * and refresh whenever that cache updates via `onDidUpdate`. Because the cache
 * is refreshed on a debounce, this acts as a debounced lens-refresh signal.
 * Falls back to a direct parse only when the cache is genuinely cold (no entry
 * yet, e.g. a document shown before its first decoration pass) — a warm but
 * empty cache means the decorator already scanned and found no markers, so a
 * marker-free file isn't re-scanned on every CodeLens request.
 *
 * Honors the `kaicrit.edit.codeLens` setting: when disabled, no lenses are
 * provided and toggling the setting refreshes immediately.
 */
export class CriticCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly dm: DecoratorManager,
    // Mirrors the decorator's enablement gate so a disabled document gets no
    // lenses — without this, the cache-cold fallback parse below would re-add
    // them. Defaults to always-on so the provider works standalone.
    private readonly isEnabled: (doc: vscode.TextDocument) => boolean = () => true,
  ) {
    // Decorator cache refresh → lenses may have changed (debounced upstream).
    this.disposables.push(dm.onDidUpdate(() => this._onDidChangeCodeLenses.fire()));
    // Toggling the setting must add/remove lenses immediately.
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('kaicrit.edit.codeLens')) {
          this._onDidChangeCodeLenses.fire();
        }
      }),
    );
  }

  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.isEnabled(doc)) { return []; }

    const enabled = vscode.workspace
      .getConfiguration('kaicrit')
      .get<boolean>('edit.codeLens', true);
    if (!enabled) { return []; }

    // Reuse the decorator's cached parse; fall back to a direct scan only if the
    // cache is genuinely cold (no entry yet) for this document. A warm-but-empty
    // entry means the decorator already scanned and found no markers, so a
    // marker-free file (e.g. code/JSON containing `{`) doesn't trigger a full
    // regex scan on every CodeLens request.
    const changes = this.dm.hasCache(doc) ? this.dm.getChanges(doc) : parseCriticMarkup(doc);

    const lenses: vscode.CodeLens[] = [];
    for (const change of changes) {
      // Anchor the lens at the start of the change; pass that position to the
      // resolve commands so they act on exactly this change.
      const anchor = new vscode.Range(change.fullRange.start, change.fullRange.start);
      const pos = change.fullRange.start;
      lenses.push(new vscode.CodeLens(anchor, {
        title: '$(check) Accept',
        tooltip: 'Accept this change',
        command: 'kaicrit.acceptChangeAt',
        arguments: [pos],
      }));
      lenses.push(new vscode.CodeLens(anchor, {
        title: '$(x) Reject',
        tooltip: 'Reject this change',
        command: 'kaicrit.rejectChangeAt',
        arguments: [pos],
      }));
    }
    return lenses;
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
    for (const d of this.disposables) { d.dispose(); }
  }
}
