// Orchestration: read two files, diff them, and open the CriticMarkup result.

import * as vscode from 'vscode';
import { diff, Granularity } from './diff';
import { render } from './criticmarkup';

interface Settings {
  granularity: Granularity;
  combineSubstitutions: boolean;
  ignoreWhitespace: boolean;
  outputLanguage: 'auto' | 'plaintext' | 'markdown';
}

function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration('kaicrit.compare');
  return {
    granularity: config.get<Granularity>('granularity', 'word'),
    combineSubstitutions: config.get<boolean>('combineSubstitutions', true),
    ignoreWhitespace: config.get<boolean>('ignoreWhitespace', false),
    outputLanguage: config.get<'auto' | 'plaintext' | 'markdown'>('outputLanguage', 'auto'),
  };
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
): Promise<void> {
  const settings = readSettings();

  const ops = diff(
    originalText,
    modifiedText,
    settings.granularity,
    settings.combineSubstitutions,
    settings.ignoreWhitespace,
  );
  const content = render(ops);

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
  );
}
