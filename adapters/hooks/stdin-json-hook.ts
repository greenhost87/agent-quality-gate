import { stdin } from 'bun';
import * as v from 'valibot';

const StdinObjectSchema = v.looseObject({});

export async function runStdinJsonHook<TInput, TOutput>(
  parseInput: (value: v.InferOutput<typeof StdinObjectSchema>) => TInput | undefined,
  handle: (input: TInput) => Promise<TOutput>,
): Promise<void> {
  try {
    const raw = (await stdin.text()).trim();
    const parsed: unknown = raw.length === 0 ? {} : (JSON.parse(raw) as unknown);
    const document = v.safeParse(StdinObjectSchema, parsed);
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
