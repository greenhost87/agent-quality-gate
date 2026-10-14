export const HOT = 120;

export function repeat(linesForIndex: (index: number) => string[]): string {
  return Array.from({ length: HOT }, (_, index) => linesForIndex(index).join('\n')).join('\n');
}
