import {
  /* inside import */
  value,
} from './dependency';
import type { Item } from './dependency';
import './side-effect';
import legacy = require('./legacy');
// standalone comment
/* multiline
   comment */

/* before */ export const result: Item = value; // after
import { other } from './other';
export const second = other;
export const lazy = import('./lazy');
export const text = `// not a comment
/* also not a comment */`;
