export type Direct = string | null | undefined;
export type Parentheses = string | (null | undefined);
export type Collapsed = null | any | undefined;
export type UnknownMix = unknown | null | void;
export type Narrowed = Exclude<string | null | undefined, undefined>;
export type ArrayMix = Array<string | null | undefined>;
export type PromiseMix = Promise<string | null | undefined>;
export type OptionalTuple = [(string | null)?];
export type NamedTuple = [value?: string | void];
export type Props = {
  defaultValue?: string | null;
  optionalVoid?: string | void;
  directNull?: null;
  directVoid?: void;
  nested?: { value: string | null | undefined };
  callback?: (() => void) | null;
  result: () => string | null | undefined;
};
export interface Recursive {
  next?: Recursive;
  value?: string | null;
  method(value?: string | null): void;
}
export class Fields {
  value?: string | null;
}
export function defaults(value: string | null | undefined = ''): void {
  void value;
}
export const arrow = (value?: string | null): void => {
  void value;
};
export const expression = function (value?: string | void): void {
  void value;
};
export function destructured({ value }: { value?: string | null }): void {
  void value;
}
export declare function declared(value?: string | null): void;
export type Callback = (value?: string | null) => void;
export type Constructor = new (value?: string | null) => object;
export const annotated: string | null | undefined = null;
export function returns(): string | null | undefined {
  return null;
}
export type Duplicate = { value?: string | null | undefined };
