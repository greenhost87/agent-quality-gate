export class QualityGateInternalError extends Error {
  override readonly name = 'QualityGateInternalError';
}

export function throwInternalVerifyFailure(error: Error | string): never {
  const message = error instanceof Error ? error.message : error;
  throw new QualityGateInternalError(message, {
    cause: error instanceof Error ? error : undefined,
  });
}
