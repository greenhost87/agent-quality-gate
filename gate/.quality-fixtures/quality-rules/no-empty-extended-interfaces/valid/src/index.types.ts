export interface Base {
  readonly value: string;
}

export interface Derived extends Base {
  readonly active: boolean;
}
