export type Props = {
  optional?: string;
  nullable: string | null;
  undefinedValue: string | undefined;
  nested?: { value: string | null };
  callback?: () => void;
  nullableResult?: () => string | null;
  list?: Array<string | null>;
  tuple?: [string | null];
  voidOnly: void;
  anyOnly: any;
  unknownOnly: unknown;
};
export type Tuples = [callback?: () => void, nested?: { value: null }];
export type UnnamedTuple = [(() => void)?];
export interface Recursive {
  optionalMethod?(): null;
  optionalVoidMethod?(): void;
  next?: Recursive;
  value: string | null;
}
export function optional(value?: string): void {
  void value;
}
export function nullable(value: string | null = null): void {
  void value;
}
export type SeparateBranches = { a: null } | { b: undefined };
export type SeparateIntersection = { a: null } & { b: undefined };
