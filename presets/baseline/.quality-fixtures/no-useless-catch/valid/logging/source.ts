export function run(): void {
  try {
    throw new Error('boom');
  } catch (error) {
    console.error(error);
  }
}
