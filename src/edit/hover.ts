import * as vscode from 'vscode';
import { parseCriticMarkup } from './parser';
import { DecoratorManager } from './decorator';
import { findAtCursor } from './navigator';
import { actionHoverMarkdown } from './actions';

/**
 * Shows clickable "Accept · Reject" actions in the hover tooltip over a
 * CriticMarkup change — the on-hover alternative to the always-on CodeLens.
 * Active only when `kaicrit.edit.changeActions` is `"hover"`.
 *
 * Changes are taken from the `DecoratorManager`'s cache (cache-cold fallback to
 * a direct parse, mirroring the CodeLens provider) and the hovered change is
 * located with the shared `findAtCursor`. The hover anchors to the change span,
 * so it inherently identifies which change the actions resolve.
 */
export class CriticHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly dm: DecoratorManager,
    // Mirrors the decorator's enablement gate so a disabled document gets no
    // hover actions. Defaults to always-on so the provider works standalone.
    private readonly isEnabled: (doc: vscode.TextDocument) => boolean = () => true,
  ) {}

  provideHover(doc: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    if (!this.isEnabled(doc)) { return undefined; }

    const mode = vscode.workspace
      .getConfiguration('kaicrit')
      .get<string>('edit.changeActions', 'hover');
    if (mode !== 'hover') { return undefined; }

    const changes = this.dm.hasCache(doc) ? this.dm.getChanges(doc) : parseCriticMarkup(doc);
    const change = findAtCursor(changes, position);
    if (!change) { return undefined; }

    const md = new vscode.MarkdownString(actionHoverMarkdown(change.fullRange.start));
    md.isTrusted = true;
    md.supportThemeIcons = true;
    return new vscode.Hover(md, change.fullRange);
  }
}
