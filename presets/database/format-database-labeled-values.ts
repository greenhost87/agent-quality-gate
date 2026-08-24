export function formatDatabaseLabeledValues(label: string, values: readonly string[]): string {
  return values.map((value) => `${label}:${value}`).join('\n');
}
