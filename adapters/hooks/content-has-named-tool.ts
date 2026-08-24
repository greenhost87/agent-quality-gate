import * as v from 'valibot';

const NamedToolPartSchema = v.object({
  type: v.string(),
  name: v.string(),
});

/** True when content includes a tool part with the given type and name. */
export function contentHasNamedTool(
  content: object | undefined,
  toolType: string,
  toolName: string,
): boolean {
  const parts = v.safeParse(v.array(v.looseObject({})), content);
  if (!parts.success) {
    return false;
  }
  return parts.output.some((part) => {
    const parsed = v.safeParse(NamedToolPartSchema, part);
    return parsed.success && parsed.output.type === toolType && parsed.output.name === toolName;
  });
}
