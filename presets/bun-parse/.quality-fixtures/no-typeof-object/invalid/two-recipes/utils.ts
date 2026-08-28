export function arePlainObjects(left: unknown, right: unknown): boolean {
  return (
    typeof left === 'object' &&
    right !== null &&
    !Array.isArray(left) &&
    typeof right === 'object' &&
    left !== null &&
    !Array.isArray(right)
  );
}
