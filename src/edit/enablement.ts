import * as vscode from 'vscode';

const DEFAULT_LANGUAGES = ['markdown', 'plaintext'];

/**
 * Decides which documents kaicrit's editor features (decorations, CodeLens,
 * status bar, changes view, accept/reject) act on.
 *
 * The default set comes from the `kaicrit.enabledLanguages` setting, matched
 * against a document's language id ("*" means every language). A per-file
 * toggle in the status bar overrides that default for a single document; like
 * Track Changes, overrides live only for the session and are dropped when the
 * document closes. When a document is disabled kaicrit treats it as plain text:
 * `DecoratorManager.update` caches an empty change list, so every reader (status
 * bar, tree view, CodeLens, the `kaicrit.hasChanges` keybinding gate) goes inert
 * until the file is re-enabled from the status-bar toggle.
 */
export class EnablementManager implements vscode.Disposable {
  // uri -> explicit on/off chosen via the status-bar toggle. Absent = follow the
  // language default.
  private readonly overrides = new Map<string, boolean>();
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  // Fires when the enabled set changes (a per-file toggle or an
  // `enabledLanguages` config edit) so observers can re-decorate.
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor() {
    // Sits on the right next to the Track Changes item.
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 91);
    this.item.command = 'kaicrit.toggleFileEnabled';

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('kaicrit.enabledLanguages')) {
          this._onDidChange.fire();
        }
      }),
    );
  }

  /** Whether kaicrit should act on `doc` (a per-file override wins). */
  isEnabled(doc: vscode.TextDocument): boolean {
    const override = this.overrides.get(doc.uri.toString());
    if (override !== undefined) { return override; }
    // Scope the read to the document so folder- and language-specific overrides
    // (`"[markdown]": { … }`, multi-root settings) are honoured (issue #61).
    const langs = vscode.workspace
      .getConfiguration('kaicrit', doc)
      .get<string[]>('enabledLanguages', DEFAULT_LANGUAGES);
    return langs.includes('*') || langs.includes(doc.languageId);
  }

  /** Flip kaicrit on/off for a single document; fires `onDidChange`. */
  toggle(doc: vscode.TextDocument): void {
    this.overrides.set(doc.uri.toString(), !this.isEnabled(doc));
    this._onDidChange.fire();
  }

  // Reflect the active editor's enabled state in the status-bar toggle. The item
  // shows in every regular text editor (file/untitled) — including disabled ones
  // — so kaicrit can be turned on ad-hoc for a non-listed language.
  syncStatusBar(editor: vscode.TextEditor | undefined): void {
    const scheme = editor?.document.uri.scheme;
    if (!editor || (scheme !== 'file' && scheme !== 'untitled')) {
      this.item.hide();
      return;
    }
    const on = this.isEnabled(editor.document);
    this.item.text = on ? '$(eye) CriticMarkup' : '$(eye-closed) CriticMarkup';
    this.item.tooltip = on
      ? 'kaicrit is active for this file — click to turn off'
      : 'kaicrit is inactive for this file — click to turn on';
    this.item.show();
  }

  /** Drop a document's override when it closes (overrides are session-only). */
  forget(doc: vscode.TextDocument): void {
    this.overrides.delete(doc.uri.toString());
  }

  dispose(): void {
    this.item.dispose();
    this._onDidChange.dispose();
    for (const d of this.disposables) { d.dispose(); }
  }
}
