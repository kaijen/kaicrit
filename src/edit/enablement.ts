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
        // The path → language-id resolver caches `files.associations`; drop it
        // when that setting changes so `isUriEnabled` stays accurate.
        if (e.affectsConfiguration('files.associations')) {
          this.langResolver = undefined;
        }
      }),
      // Installing/removing an extension can add or drop contributed languages.
      vscode.extensions.onDidChange(() => { this.langResolver = undefined; }),
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

  /**
   * Whether kaicrit should act on a file identified only by its URI — used by
   * the Files overview's workspace scan so it honours the **same** language
   * whitelist as the open scope (and the editor features), instead of listing
   * marker-bearing files of any type. Resolves the file's language id from its
   * path via the contributed-language registry (and `files.associations`)
   * without opening the document, then applies the `enabledLanguages` check.
   * A file whose language can't be resolved is treated as not enabled (unless
   * the whitelist is `"*"`).
   */
  isUriEnabled(uri: vscode.Uri): boolean {
    const langs = vscode.workspace
      .getConfiguration('kaicrit', uri)
      .get<string[]>('enabledLanguages', DEFAULT_LANGUAGES);
    if (langs.includes('*')) { return true; }
    const lang = this.languageForUri(uri);
    return lang !== undefined && langs.includes(lang);
  }

  // Cached path → language-id resolver, built lazily from every contributed
  // language (`contributes.languages`) plus the `files.associations` setting.
  // Invalidated when extensions change or that setting is edited (see the
  // constructor listeners).
  private langResolver: {
    ext: Map<string, string>;
    filenames: Map<string, string>;
    assoc: [string, string][];
  } | undefined;

  private resolver(): NonNullable<EnablementManager['langResolver']> {
    if (this.langResolver) { return this.langResolver; }
    const ext = new Map<string, string>();
    const filenames = new Map<string, string>();
    for (const e of vscode.extensions.all) {
      const langs = (e.packageJSON?.contributes?.languages ?? []) as Array<{
        id: string; extensions?: string[]; filenames?: string[];
      }>;
      for (const l of langs) {
        for (const x of l.extensions ?? []) { ext.set(x.toLowerCase(), l.id); }
        for (const f of l.filenames ?? []) { filenames.set(f, l.id); }
      }
    }
    const assocCfg = vscode.workspace
      .getConfiguration('files')
      .get<Record<string, string>>('associations') ?? {};
    this.langResolver = { ext, filenames, assoc: Object.entries(assocCfg) };
    return this.langResolver;
  }

  // Resolve the language id VS Code would assign to a file path, without opening
  // it: user `files.associations` win over contributed defaults, then an exact
  // file-name match, then the extension.
  private languageForUri(uri: vscode.Uri): string | undefined {
    const path = uri.path;
    const base = path.substring(path.lastIndexOf('/') + 1);
    const { ext, filenames, assoc } = this.resolver();
    for (const [pattern, lang] of assoc) {
      if (matchAssociation(pattern, base)) { return lang; }
    }
    const byName = filenames.get(base);
    if (byName) { return byName; }
    const dot = base.lastIndexOf('.');
    if (dot > 0) { return ext.get(base.substring(dot).toLowerCase()); }
    return undefined;
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

/**
 * Match a `files.associations` glob against a bare file name. Handles the common
 * forms — a bare `*.ext`, the recursive double-star variant, and an exact file
 * name; more complex globs are
 * left to VS Code's own resolution and ignored here (the file then falls back to
 * the contributed-language extension match). Pure → unit-tested.
 */
export function matchAssociation(pattern: string, base: string): boolean {
  if (pattern.startsWith('**/*.')) { return base.endsWith(pattern.slice(4)); }
  if (pattern.startsWith('*.')) { return base.endsWith(pattern.slice(1)); }
  if (!pattern.includes('*') && !pattern.includes('/')) { return base === pattern; }
  return false;
}
