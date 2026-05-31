// Registers the compare commands: diff two files into a CriticMarkup document.

import * as vscode from 'vscode';
import { compareToCriticMarkup, compareTextToCriticMarkup } from './compare';

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

/**
 * Read the HEAD (last committed) version of a file through the built-in Git
 * extension. Returns `undefined` (after showing a warning) when Git is
 * unavailable, the file is outside a repository, or it has no committed state.
 */
async function getGitHeadContent(uri: vscode.Uri): Promise<string | undefined> {
  const gitExtension = vscode.extensions.getExtension<any>('vscode.git');
  if (!gitExtension) {
    vscode.window.showWarningMessage('kaicrit: the built-in Git extension is not available.');
    return undefined;
  }

  const git = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
  const api = git.getAPI(1);
  const repo = api.getRepository(uri);
  if (!repo) {
    vscode.window.showWarningMessage('kaicrit: the active file is not inside a Git repository.');
    return undefined;
  }

  try {
    return await repo.show('HEAD', uri.fsPath);
  } catch {
    vscode.window.showWarningMessage(
      'kaicrit: could not read the HEAD version of this file (is it committed?).',
    );
    return undefined;
  }
}

/** Command: compare the active file against its committed Git HEAD version. */
async function compareWithGitHead(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      'kaicrit: open a file to compare it with its Git HEAD version.',
    );
    return;
  }

  const doc = editor.document;
  const headContent = await getGitHeadContent(doc.uri);
  if (headContent === undefined) {
    return;
  }

  // HEAD is file 1 (original); the current buffer is file 2 (modified).
  await compareTextToCriticMarkup(headContent, doc.getText(), doc.languageId);
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
    vscode.commands.registerCommand('kaicrit.compareWithGitHead', compareWithGitHead),
    vscode.commands.registerCommand('kaicrit.selectForCompare', selectForCompare),
    vscode.commands.registerCommand('kaicrit.compareWithSelected', compareWithSelected),
    vscode.commands.registerCommand('kaicrit.compareSelected', compareSelected),
  );
}
