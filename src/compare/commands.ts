// Registers the compare commands: diff two files into a CriticMarkup document.

import * as vscode from 'vscode';
import { compareToCriticMarkup } from './compare';

// File chosen via "Select for CriticMarkup Compare", awaiting a second file.
let selectedForCompare: vscode.Uri | undefined;

async function pickFile(title: string): Promise<vscode.Uri | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: title,
    title,
  });
  return picked?.[0];
}

/** Command: pick both files through open dialogs. */
async function compareTwoFiles(): Promise<void> {
  const original = await pickFile('Select file 1 (original)');
  if (!original) {
    return;
  }
  const modified = await pickFile('Select file 2 (modified)');
  if (!modified) {
    return;
  }
  await compareToCriticMarkup(original, modified);
}

/** Command: active editor is the original; pick the modified file. */
async function compareActiveFileWith(): Promise<void> {
  const active = vscode.window.activeTextEditor?.document.uri;
  if (!active) {
    vscode.window.showWarningMessage('kaicrit: open a file first to use it as file 1.');
    return;
  }
  const modified = await pickFile('Select file 2 (modified)');
  if (!modified) {
    return;
  }
  await compareToCriticMarkup(active, modified);
}

/** Explorer command: remember a file as file 1. */
function selectForCompare(uri: vscode.Uri | undefined): void {
  if (!uri) {
    return;
  }
  selectedForCompare = uri;
  vscode.window.setStatusBarMessage(
    `kaicrit: selected ${vscode.workspace.asRelativePath(uri)} as file 1`,
    3000,
  );
}

/** Explorer command: compare the previously selected file with this one. */
async function compareWithSelected(uri: vscode.Uri | undefined): Promise<void> {
  if (!uri) {
    return;
  }
  if (!selectedForCompare) {
    vscode.window.showWarningMessage(
      'kaicrit: run "Select for CriticMarkup Compare" on a file first.',
    );
    return;
  }
  await compareToCriticMarkup(selectedForCompare, uri);
}

/** Explorer command: two files selected at once; first is file 1, second is file 2. */
async function compareSelected(
  _uri: vscode.Uri | undefined,
  selection: vscode.Uri[] | undefined,
): Promise<void> {
  if (!selection || selection.length !== 2) {
    vscode.window.showWarningMessage('kaicrit: select exactly two files to compare.');
    return;
  }
  await compareToCriticMarkup(selection[0], selection[1]);
}

export function registerCompareCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('kaicrit.compareFiles', compareTwoFiles),
    vscode.commands.registerCommand('kaicrit.compareActiveFileWith', compareActiveFileWith),
    vscode.commands.registerCommand('kaicrit.selectForCompare', selectForCompare),
    vscode.commands.registerCommand('kaicrit.compareWithSelected', compareWithSelected),
    vscode.commands.registerCommand('kaicrit.compareSelected', compareSelected),
  );
}
