import { expect } from 'bun:test';

export function expectSingleAgentQualityGateServer(
  document: object,
  property: string,
  config: object,
): void {
  expect(document).toEqual({ [property]: { 'agent-quality-gate': config } });
}
