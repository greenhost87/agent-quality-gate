import { SQL } from 'bun';
import * as v from 'valibot';
import {
  getPositiveIntegerEnv,
  getRequiredEnv,
  isNodeEnvironment,
} from '@/system/config/environment';

// Process-global registry key only — not a package name or import path.
const SHARED_DATABASE_CONNECTION_STATE_KEY = Symbol.for('system.database.connection-state.v2');

const ActiveConnectionSchema = v.object({
  client: v.unknown(),
  url: v.string(),
  poolSize: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

const SharedDatabaseConnectionStateSchema = v.object({
  active: v.nullable(ActiveConnectionSchema),
  retiring: v.unknown(),
  generation: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

function createSharedDatabaseConnectionState(): {
  active: { client: SQL; url: string; poolSize: number } | null;
  retiring: Set<Promise<void>>;
  generation: number;
} {
  return {
    active: null,
    retiring: new Set(),
    generation: 0,
  };
}

function isSharedDatabaseConnectionState(
  value: unknown,
): value is ReturnType<typeof createSharedDatabaseConnectionState> {
  const parsed = v.safeParse(SharedDatabaseConnectionStateSchema, value);
  if (!parsed.success || !(parsed.output.retiring instanceof Set)) {
    return false;
  }
  return true;
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

function resolveDatabasePoolSize(): number {
  return getPositiveIntegerEnv('DATABASE_POOL_SIZE') ?? (isNodeEnvironment('test') ? 1 : 5);
}

function resolveDatabase(): SQL {
  const state = getSharedDatabaseConnectionState();
  const url = getRequiredEnv('DATABASE_URL');
  const poolSize = resolveDatabasePoolSize();
  if (state.active?.url === url && state.active.poolSize === poolSize) {
    return state.active.client;
  }

  if (state.active !== null) {
    const previous = state.active;
    state.active = null;
    retireDatabaseClient(state, previous.client);
  }

  const client = new SQL({
    url,
    max: poolSize,
  });
  state.generation += 1;
  state.active = { client, url, poolSize };
  return client;
}

// A callable SQL instance is required as the Proxy target. The target is never queried;
// every operation resolves the managed active client through the traps below.
const lazySqlTarget = new SQL({
  url: 'postgres://127.0.0.1:1/agent_quality_gate_lazy_proxy_target',
  max: 1,
});

export const sql = new Proxy(lazySqlTarget, {
  apply(_target, _thisArg, argumentsList) {
    const client = resolveDatabase();
    const result: unknown = Reflect.apply(client, client, argumentsList);
    return result;
  },
  get(_target, property) {
    const client = resolveDatabase();
    const value: unknown = Reflect.get(client, property, client);
    if (typeof value !== 'function') {
      return value;
    }
    return (...argumentsList: never[]): unknown => {
      const result: unknown = Reflect.apply(value, client, argumentsList);
      return result;
    };
  },
});

export function getDatabaseGeneration(): number {
  resolveDatabase();
  return getSharedDatabaseConnectionState().generation;
}

export async function closeDatabase(): Promise<void> {
  const state = getSharedDatabaseConnectionState();
  const closings = [...state.retiring];
  state.retiring.clear();

  if (state.active !== null) {
    const active = state.active;
    state.active = null;
    state.generation += 1;
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
