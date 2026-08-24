import { importedValues } from './imported-values.js';
import type { A, B, ExistingType, ImportedType } from './shared.types.js';

const defaultValue = 'b';
export const values = ['a', 'b'] as const;
const localValues = ['a', 'b'] as const;
export const emptyValues = [] as const;
export const mixedValues = ['a', defaultValue] as const;
export const numericValues = [1, 2] as const;
export const mutableValues = ['a', 'b'];
type Local = ExistingType;
export type ImportedItem = ImportedType['item'];
export type ImportedValues = (typeof importedValues)[number];
export interface RuntimeInterface {
  value: string;
}
export type Combined = A & B;
export type Values = typeof values;
export type First = (typeof values)[0];
type UnexportedCompanion = (typeof values)[number];
export type LocalCompanion = (typeof localValues)[number];
export type EmptyValue = (typeof emptyValues)[number];
export type MixedValue = (typeof mixedValues)[number];
export type NumericValue = (typeof numericValues)[number];
export type MutableValue = (typeof mutableValues)[number];
