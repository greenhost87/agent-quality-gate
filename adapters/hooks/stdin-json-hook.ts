import { stdin } from 'bun';
import * as v from 'valibot';

const StdinObjectSchema = v.looseObject({});
const StdinJsonSchema = v.pipe(v.string(), v.parseJson(), StdinObjectSchema);

export async function runStdinJsonHook<TInput, TOutput>(
  parseInput: (value: v.InferOutput<typeof StdinObjectSchema>) => TInput | undefined,
  handle: (input: TInput) => Promise<TOutput>,
): Promise<void> {
  try {
    const raw = (await stdin.text()).trim();
    const document =
      raw.length === 0 ? v.safeParse(StdinObjectSchema, {}) : v.safeParse(StdinJsonSchema, raw);
    const input = document.success ? parseInput(document.output) : undefined;
    if (input === undefined) {
      process.stdout.write('{}\n');
      return;
    }
    const output = await handle(input);
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
    process.stdout.write('{}\n');
  }
}
