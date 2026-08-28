export function parseJsonValue(text: string): unknown {
  if (text.length === 0) return null;
  return JSON.parse(text);
}
