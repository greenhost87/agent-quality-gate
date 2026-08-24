type Order = { customer: string };
type SomeType = { value: string };
type Tuple = readonly [string];
type Map = Record<string, string>;
declare const value: { field: string };

export type A = Order['customer'];
export type B = SomeType[keyof SomeType];
export type C = Tuple[0];
export type D = Map[string];
export type E = (typeof value)['field'];
