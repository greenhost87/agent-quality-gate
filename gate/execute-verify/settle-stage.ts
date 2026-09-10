export type SettledStage<T> =
  | { status: 'fulfilled'; value: T; ms: number }
  | { status: 'rejected'; reason: Error | string; ms: number };

/**
 * Capture fulfillment or rejection without rejecting the outer Promise.all.
 * All launched stages must settle before verify returns or cleans configs (R3/R4).
 */
export async function settleStage<T extends { ms: number }>(
  promise: Promise<T>,
): Promise<SettledStage<T>> {
  const startedAt = performance.now();
  try {
    const value = await promise;
    return { status: 'fulfilled', value, ms: value.ms };
  } catch (error) {
    return {
      status: 'rejected',
      reason: error instanceof Error ? error : String(error),
      ms: Math.round(performance.now() - startedAt),
    };
  }
}

export function rethrowSettledRejection(reason: Error | string): never {
  if (reason instanceof Error) {
    throw reason;
  }
  throw new Error(reason);
}
