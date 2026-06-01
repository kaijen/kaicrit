import * as vscode from 'vscode';
import { parseCriticMarkup } from './parser';
import { DecoratorManager } from './decorator';
import { SYMBOLS, LABELS } from './statusBar';
import { shortText } from './actions';

/**
 * Renders an "Accept | Reject" action group above every CriticMarkup change.
 * Each change emits three lenses anchored at its start: a leading info lens
 * (`<type-symbol> "<preview>"`, click → jump to the change) followed by the
 * `$(check)` / `$(x)` icon actions. Because VS Code packs all lenses of a line
 * into one row, the per-change symbol + content preview is what tells two
 * changes on the same line apart.
 *
 * Lenses are built from the `DecoratorManager`'s change cache (no extra scan)
 * and refresh whenever that cache updates via `onDidUpdate`. Because the cache
 * is refreshed on a debounce, this acts as a debounced lens-refresh signal.
 * Falls back to a direct parse only when the cache is genuinely cold (no entry
 * yet) — a warm but empty cache means the decorator already scanned and found no
 * markers, so a marker-free file isn't re-scanned on every CodeLens request.
 *
 * Honors `kaicrit.edit.changeActions`: lenses are provided only in `"codeLens"`
 * mode (`"hover"`/`"off"` provide none); toggling the setting refreshes
 * immediately.
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
        if (e.affectsConfiguration('kaicrit.edit.changeActions')) {
          this._onDidChangeCodeLenses.fire();
        }
      }),
    );
  }

  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.isEnabled(doc)) { return []; }

    const mode = vscode.workspace
      .getConfiguration('kaicrit')
      .get<string>('edit.changeActions', 'hover');
    if (mode !== 'codeLens') { return []; }

    // Reuse the decorator's cached parse; fall back to a direct scan only if the
    // cache is genuinely cold (no entry yet) for this document. A warm-but-empty
    // entry means the decorator already scanned and found no markers, so a
    // marker-free file (e.g. code/JSON containing `{`) doesn't trigger a full
    // regex scan on every CodeLens request.
    const changes = this.dm.hasCache(doc) ? this.dm.getChanges(doc) : parseCriticMarkup(doc);

    const lenses: vscode.CodeLens[] = [];
    for (const change of changes) {
      // Anchor every lens at the start of the change; pass that position to the
      // resolve commands so they act on exactly this change.
      const pos = change.fullRange.start;
      const anchor = new vscode.Range(pos, pos);
      const preview = shortText(change.text ?? change.newText ?? change.oldText ?? '');
      // Leading info lens: type symbol + content preview, identifies the group
      // and jumps to the change on click.
      lenses.push(new vscode.CodeLens(anchor, {
        title: preview ? `${SYMBOLS[change.type]} "${preview}"` : SYMBOLS[change.type],
        tooltip: LABELS[change.type],
        command: 'kaicrit.revealChangeAt',
        arguments: [pos],
      }));
      lenses.push(new vscode.CodeLens(anchor, {
        title: '$(check)',
        tooltip: 'Accept this change',
        command: 'kaicrit.acceptChangeAt',
        arguments: [pos],
      }));
      lenses.push(new vscode.CodeLens(anchor, {
        title: '$(x)',
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
