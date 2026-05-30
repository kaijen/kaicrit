// Orchestration: read two files, diff them, and open the CriticMarkup result.

import * as vscode from 'vscode';
import { diff, Granularity } from './diff';
import { render } from './criticmarkup';

interface Settings {
  granularity: Granularity;
  combineSubstitutions: boolean;
  outputLanguage: 'auto' | 'plaintext' | 'markdown';
}

function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration('kaicrit.compare');
  return {
    granularity: config.get<Granularity>('granularity', 'word'),
    combineSubstitutions: config.get<boolean>('combineSubstitutions', true),
    outputLanguage: config.get<'auto' | 'plaintext' | 'markdown'>('outputLanguage', 'auto'),
  };
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
  const settings = readSettings();

  const [originalDoc, modifiedDoc] = await Promise.all([
    vscode.workspace.openTextDocument(original),
    vscode.workspace.openTextDocument(modified),
  ]);

  const ops = diff(
    originalDoc.getText(),
    modifiedDoc.getText(),
    settings.granularity,
    settings.combineSubstitutions,
  );
  const content = render(ops);

  const language =
    settings.outputLanguage === 'auto'
      ? modifiedDoc.languageId
      : settings.outputLanguage;

  const resultDoc = await vscode.workspace.openTextDocument({ content, language });
  await vscode.window.showTextDocument(resultDoc, { preview: false });
}
