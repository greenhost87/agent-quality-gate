const other = new Error('other');

export function run(): void {
  try {
    throw new Error('boom');
  } catch (error) {
    throw other;
  }
}
