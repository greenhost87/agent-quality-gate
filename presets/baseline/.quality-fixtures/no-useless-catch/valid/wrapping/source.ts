export function run(): void {
  try {
    throw new Error('boom');
  } catch (error) {
    throw new Error('wrapped', { cause: error });
  }
}
