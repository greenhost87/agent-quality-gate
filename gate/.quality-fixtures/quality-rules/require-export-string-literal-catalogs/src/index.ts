import type { Value } from './value.types.js';

export const bare = ['a', 'b'];
export const arrayAnnotated: Value[] = ['a', 'b'];
export const genericArray: Array<Value> = ['a', 'b'];
export const readonlyArray: readonly Value[] = ['a', 'b'];
export const genericReadonly: ReadonlyArray<Value> = ['a', 'b'];
export const asserted = ['a', 'b'] as Value[];
export const satisfied = ['a', 'b'] satisfies Value[];
export const assertedAndSatisfied = ['a', 'b'] as const satisfies readonly Value[];
