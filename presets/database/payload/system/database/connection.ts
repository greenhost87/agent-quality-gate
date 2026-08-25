// Managed by agent-quality-gate. Do not edit; changes are overwritten on verify.

import { SQL } from 'bun';
import { getRequiredEnv, isNodeEnvironment } from '@/system/config/environment';

const SHARED_DATABASE_CONNECTION_STATE_KEY = Symbol.for(
  '@agent-quality-gate/preset-database/connection-state/v1',
);

function createSharedDatabaseConnectionState(): {
  active: { client: SQL; url: string } | null;
  retiring: Set<Promise<void>>;
} {
  return {
    active: null,
    retiring: new Set(),
  };
}

function isSharedDatabaseConnectionState(
  value: unknown,
): value is ReturnType<typeof createSharedDatabaseConnectionState> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('active' in value) || !('retiring' in value) || !(value.retiring instanceof Set)) {
    return false;
  }

  const active = value.active;
  if (active === null) {
    return true;
  }
  if (typeof active !== 'object') {
    return false;
  }
  return 'client' in active && 'url' in active && typeof active.url === 'string';
}

function getSharedDatabaseConnectionState(): ReturnType<
  typeof createSharedDatabaseConnectionState
> {
  const existing: unknown = Reflect.get(globalThis, SHARED_DATABASE_CONNECTION_STATE_KEY);
  if (existing !== undefined) {
    if (!isSharedDatabaseConnectionState(existing)) {
      throw new Error('Invalid shared database connection state');
    }
    return existing;
  }

  const created = createSharedDatabaseConnectionState();
  Reflect.set(globalThis, SHARED_DATABASE_CONNECTION_STATE_KEY, created);
  return created;
}

function retireDatabaseClient(
  state: ReturnType<typeof createSharedDatabaseConnectionState>,
  client: SQL,
): void {
  const closing = client.close();
  state.retiring.add(closing);
  void closing.then(
    () => {
      state.retiring.delete(closing);
    },
    () => undefined,
  );
}

export function getDatabase(): SQL {
  const state = getSharedDatabaseConnectionState();
  const url = getRequiredEnv('DATABASE_URL');
  if (state.active?.url === url) {
    return state.active.client;
  }

  if (state.active !== null) {
    const previous = state.active;
    state.active = null;
    retireDatabaseClient(state, previous.client);
  }

  const client = new SQL({
    url,
    max: isNodeEnvironment('test') ? 1 : 10,
  });
  state.active = { client, url };
  return client;
}

export async function closeDatabase(): Promise<void> {
  const state = getSharedDatabaseConnectionState();
  const closings = [...state.retiring];
  state.retiring.clear();

  if (state.active !== null) {
    const active = state.active;
    state.active = null;
    closings.push(active.client.close());
  }

  const results = await Promise.allSettled(closings);
  const errors: unknown[] = [];
  for (const result of results) {
    if (result.status === 'rejected') {
      errors.push(result.reason);
    }
  }

  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, 'Failed to close database connections');
  }
}
