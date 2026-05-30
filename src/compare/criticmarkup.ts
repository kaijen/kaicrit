// Renders diff operations into CriticMarkup, using the shared marker
// vocabulary so the emitted delimiters always match what the editor parses.

import { ChangeType } from '../core/types';
import { MARKERS } from '../core/markers';
import { DiffOp } from './diff';

const DEL = MARKERS[ChangeType.Deletion];
const ADD = MARKERS[ChangeType.Addition];
const SUB = MARKERS[ChangeType.Substitution];

/** Convert a list of diff operations into a CriticMarkup string. */
export function render(ops: DiffOp[]): string {
  let out = '';
  for (const op of ops) {
    switch (op.type) {
      case 'equal':
        out += op.text;
        break;
      case 'delete':
        if (op.text.length > 0) {
          out += `${DEL.open}${op.text}${DEL.close}`;
        }
        break;
      case 'insert':
        if (op.text.length > 0) {
          out += `${ADD.open}${op.text}${ADD.close}`;
        }
        break;
      case 'replace':
        out += `${SUB.open}${op.before}${SUB.sep}${op.after}${SUB.close}`;
        break;
    }
  }
  return out;
}
