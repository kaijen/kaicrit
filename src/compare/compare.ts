// Orchestration: read two files, diff them, and open the CriticMarkup result.

import * as vscode from 'vscode';
import { diff, DiffOp, DiffTooLargeError, Granularity } from './diff';
import { render } from './criticmarkup';

interface Settings {
  granularity: Granularity;
  combineSubstitutions: boolean;
  ignoreWhitespace: boolean;
  outputLanguage: 'auto' | 'plaintext' | 'markdown';
  maxDiffTokens: number;
}

function readSettings(scope?: vscode.Uri): Settings {
  // Scope to the document's URI when one is available so folder-specific
  // overrides apply in a multi-root workspace (issue #61).
  const config = vscode.workspace.getConfiguration('kaicrit.compare', scope);
  return {
    granularity: config.get<Granularity>('granularity', 'word'),
    combineSubstitutions: config.get<boolean>('combineSubstitutions', true),
    ignoreWhitespace: config.get<boolean>('ignoreWhitespace', false),
    outputLanguage: config.get<'auto' | 'plaintext' | 'markdown'>('outputLanguage', 'auto'),
    maxDiffTokens: config.get<number>('maxDiffTokens', 4_000_000),
  };
}

/**
 * Run the diff with the size guard active. If the chosen granularity is too
 * large, automatically retry at `line` granularity (far fewer tokens); if even
 * that is too large, return `undefined` so the caller can warn the user.
 * Returns the ops plus the granularity actually used (for an informational
 * fall-back notice).
 */
function diffWithGuard(
  originalText: string,
  modifiedText: string,
  settings: Settings,
): { ops: DiffOp[]; granularity: Granularity } | undefined {
  try {
    const ops = diff(
      originalText,
      modifiedText,
      settings.granularity,
      settings.combineSubstitutions,
      settings.ignoreWhitespace,
      settings.maxDiffTokens,
    );
    return { ops, granularity: settings.granularity };
  } catch (error) {
    if (!(error instanceof DiffTooLargeError)) {
      throw error;
    }
    if (settings.granularity === 'line') {
      return undefined;
    }
    try {
      const ops = diff(
        originalText,
        modifiedText,
        'line',
        settings.combineSubstitutions,
        settings.ignoreWhitespace,
        settings.maxDiffTokens,
      );
      return { ops, granularity: 'line' };
    } catch (lineError) {
      if (lineError instanceof DiffTooLargeError) {
        return undefined;
      }
      throw lineError;
    }
  }
}

/**
 * Diff two text strings into CriticMarkup and open the result in a new editor.
 * Shared by the file-based and Git-HEAD compare entry points.
 *
 * @param originalText The first file's contents (file 1 / base).
 * @param modifiedText The second file's contents (file 2 / target).
 * @param autoLanguageId Language used when `outputLanguage` is `auto`.
 */
export async function compareTextToCriticMarkup(
  originalText: string,
  modifiedText: string,
  autoLanguageId: string,
  scope?: vscode.Uri,
): Promise<void> {
  const settings = readSettings(scope);

  const result = diffWithGuard(originalText, modifiedText, settings);
  if (!result) {
    void vscode.window.showWarningMessage(
      'kaicrit: these files are too large to compare. Switch ' +
        '"kaicrit.compare.granularity" to "line", or raise ' +
        '"kaicrit.compare.maxDiffTokens", then try again.',
    );
    return;
  }

  // Identical inputs produce only `equal` ops, i.e. a marker-free copy of the
  // text. Opening that as a "comparison" is just noise, so report no differences
  // and skip the new editor instead.
  const hasDifference = result.ops.some(op => op.type !== 'equal');
  if (!hasDifference) {
    void vscode.window.showInformationMessage('kaicrit: no differences between the two inputs.');
    return;
  }

  if (result.granularity !== settings.granularity) {
    void vscode.window.showInformationMessage(
      `kaicrit: inputs were too large for "${settings.granularity}" granularity; ` +
        `compared at "line" granularity instead. Raise ` +
        `"kaicrit.compare.maxDiffTokens" to force the finer diff.`,
    );
  }

  const content = render(result.ops);

  const language =
    settings.outputLanguage === 'auto' ? autoLanguageId : settings.outputLanguage;

  const resultDoc = await vscode.workspace.openTextDocument({ content, language });
  await vscode.window.showTextDocument(resultDoc, { preview: false });
}

/**
 * Generate a CriticMarkup document describing how `original` becomes `modified`
 * and open it in a new editor.
 *
 * @param original The first file (file 1 / base).
 * @param modified The second file (file 2 / target).
 */
export async function compareToCriticMarkup(
  original: vscode.Uri,
  modified: vscode.Uri,
): Promise<void> {
  const [originalDoc, modifiedDoc] = await Promise.all([
    vscode.workspace.openTextDocument(original),
    vscode.workspace.openTextDocument(modified),
  ]);

  await compareTextToCriticMarkup(
    originalDoc.getText(),
    modifiedDoc.getText(),
    modifiedDoc.languageId,
    modified,
  );
}
