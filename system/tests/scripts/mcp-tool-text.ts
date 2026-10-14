export function mcpToolResultText(content: readonly object[] | string): string {
  if (typeof content === 'string') {
    return content;
  }
  const parts: string[] = [];
  for (const part of content) {
    if (!('type' in part) || !('text' in part)) {
      continue;
    }
    if (part.type !== 'text' || typeof part.text !== 'string') {
      continue;
    }
    parts.push(part.text);
  }
  return parts.join('\n');
}
