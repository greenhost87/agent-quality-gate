import { expect } from 'bun:test';

/** Assert a promise rejects with an Error whose message contains `message`. */
export async function expectRejectedMessage<T>(
  promise: Promise<T>,
  message: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof Error)) {
      expect.unreachable('expected Error');
    }
    expect(error.message).toContain(message);
    return;
  }
  expect.unreachable(`expected rejection containing ${message}`);
}
