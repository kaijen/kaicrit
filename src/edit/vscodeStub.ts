// Test-only fake of the slice of the VS Code API the edit modules touch.
//
// parser.ts and navigator.ts `import * as vscode from 'vscode'` and use
// `vscode.Range`/`Position` plus `workspace.getConfiguration`. At runtime VS
// Code supplies that module; under `node --test` there is no Extension Host, so
// this stub installs a `Module._load` hook that resolves `require('vscode')` to
// a minimal fake.
//
// IMPORTANT: a test must import this module BEFORE any module that pulls in
// 'vscode'. TypeScript preserves import order in its CommonJS output, so a
// top-of-file `import './vscodeStub'` installs the hook before parser/navigator
// are required.

import * as Module from 'node:module';

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
  isBefore(o: Position): boolean {
    return this.line < o.line || (this.line === o.line && this.character < o.character);
  }
  isBeforeOrEqual(o: Position): boolean {
    return this.line < o.line || (this.line === o.line && this.character <= o.character);
  }
  isAfter(o: Position): boolean { return o.isBefore(this); }
  isAfterOrEqual(o: Position): boolean { return o.isBeforeOrEqual(this); }
  isEqual(o: Position): boolean { return this.line === o.line && this.character === o.character; }
}

export class Range {
  constructor(public readonly start: Position, public readonly end: Position) {}
}

export class Selection extends Range {
  constructor(public readonly anchor: Position, public readonly active: Position) {
    super(anchor, active);
  }
}

// Minimal TextDocument: enough for parser.ts (getText/positionAt) and the
// navigator helpers. positionAt operates on UTF-16 code units — exactly like VS
// Code and like JavaScript string indexing — so surrogate-pair offsets are
// covered without any special handling.
export class TextDocument {
  constructor(private readonly text: string) {}
  getText(): string { return this.text; }
  positionAt(offset: number): Position {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    let line = 0;
    let lastNewline = -1;
    for (let i = 0; i < clamped; i++) {
      if (this.text.charCodeAt(i) === 10 /* \n */) { line++; lastNewline = i; }
    }
    return new Position(line, clamped - (lastNewline + 1));
  }
  offsetAt(pos: Position): number {
    const lines = this.text.split('\n');
    let offset = 0;
    for (let i = 0; i < pos.line && i < lines.length; i++) { offset += lines[i].length + 1; }
    return offset + pos.character;
  }
  get uri() { return { toString: () => 'file://stub-test.md' }; }
}

// A WorkspaceEdit fake that records its replacements so tests can inspect which
// document an edit targeted. Used by the TrackChangesManager suite.
export class WorkspaceEdit {
  readonly edits: { uri: unknown; range: Range; text: string }[] = [];
  replace(uri: unknown, range: Range, text: string): void {
    this.edits.push({ uri, range, text });
  }
}

export const StatusBarAlignment = { Left: 1, Right: 2 } as const;
export const TextDocumentChangeReason = { Undo: 1, Redo: 2 } as const;

// Configurable returns for workspace.getConfiguration('kaicrit').get(key, def).
// Keyed by the `key` argument (e.g. 'edit.commentMetadata'); unset keys fall
// through to the caller-supplied default.
const configValues = new Map<string, unknown>();
export function setConfig(key: string, value: unknown): void { configValues.set(key, value); }
export function resetConfig(): void { configValues.clear(); }

// `applyEdit` is swappable so the TrackChangesManager tests can make it resolve
// `true`/`false`, reject, or stay pending. Default: succeed.
type ApplyEdit = (we: WorkspaceEdit) => Promise<boolean>;
let applyEditImpl: ApplyEdit = () => Promise.resolve(true);
export function setApplyEditImpl(fn: ApplyEdit): void { applyEditImpl = fn; }

const vscodeFake = {
  Position,
  Range,
  Selection,
  WorkspaceEdit,
  StatusBarAlignment,
  TextDocumentChangeReason,
  workspace: {
    getConfiguration(_section?: string) {
      return {
        get(key: string, def?: unknown) {
          return configValues.has(key) ? configValues.get(key) : def;
        },
      };
    },
    applyEdit(we: WorkspaceEdit) { return applyEditImpl(we); },
  },
  window: {
    activeTextEditor: undefined as unknown,
    visibleTextEditors: [] as unknown[],
    createStatusBarItem() {
      return {
        text: '',
        tooltip: '',
        command: '',
        show(): void { /* noop */ },
        hide(): void { /* noop */ },
        dispose(): void { /* noop */ },
      };
    },
  },
  commands: {
    executeCommand() { return Promise.resolve(undefined); },
  },
};

// Install the loader hook exactly once, even if several suites import the stub.
type Loader = { _load(request: string, parent: unknown, isMain: boolean): unknown };
const loader = Module as unknown as Loader & { __kaicritVscodeStub?: boolean };
if (!loader.__kaicritVscodeStub) {
  const originalLoad = loader._load;
  loader._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === 'vscode') { return vscodeFake; }
    return originalLoad.call(this, request, parent, isMain);
  };
  loader.__kaicritVscodeStub = true;
}
