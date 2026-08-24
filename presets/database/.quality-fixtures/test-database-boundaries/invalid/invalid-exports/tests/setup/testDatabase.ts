export async function initializeTestDatabase(): Promise<string> {
  return '';
}
export async function closeTestDatabase(): Promise<void> {}
export async function readTestDatabaseCatalog(): Promise<{ bootstrapIsTemplate: boolean }> {
  return { bootstrapIsTemplate: false };
}
export async function queryTestDatabase(): Promise<void> {}
export async function executeTestDatabaseQuery(): Promise<void> {}
export function getClient(): void {}
export const sql = null;
export const pool = null;
