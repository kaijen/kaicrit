// Pure, VS Code-free string builders shared by the CodeLens and Hover providers.
// Keeping them here (no `vscode` import) lets `actions.test.ts` run under
// `node --test` without the vscode stub — same pattern as `resolve.ts`.

/**
 * Collapse a change's content into a one-line preview for the CodeLens info
 * lens: runs of whitespace (incl. newlines) become a single space, the result
 * is trimmed and truncated with an ellipsis. `max` is the kept character count
 * before the `…`.
 */
export function shortText(s: string, max = 18): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max) + '…' : flat;
}

/**
 * Body of the on-hover Accept/Reject tooltip: two trusted `command:` links that
 * resolve the change whose start is `pos`. The position is passed as the command
 * argument (URI-encoded JSON); the `acceptChangeAt`/`rejectChangeAt` handlers
 * reconstruct a `vscode.Position` from the plain `{line, character}` object.
 * Caller wraps this in a `MarkdownString` with `isTrusted`/`supportThemeIcons`.
 */
export function actionHoverMarkdown(pos: { line: number; character: number }): string {
  const arg = encodeURIComponent(JSON.stringify([{ line: pos.line, character: pos.character }]));
  const accept = `[$(check) Accept](command:kaicrit.acceptChangeAt?${arg})`;
  const reject = `[$(x) Reject](command:kaicrit.rejectChangeAt?${arg})`;
  return `${accept} &nbsp;·&nbsp; ${reject}`;
}
