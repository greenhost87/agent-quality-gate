namespace Utilities {
  export type Pick = {
    value: number;
  };
}

type FromNamespace = Utilities.Pick;
type FromGlobalThis = globalThis.Pick;
