import { foo } from './index.ts';

export { foo };

export function useFoo(): void {
  foo();
}
