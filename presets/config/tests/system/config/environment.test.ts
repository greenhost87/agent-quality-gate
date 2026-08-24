import { afterEach, describe, expect, test } from 'bun:test';
import {
  createEnv,
  getBooleanEnv,
  getOptionalEnv,
  getPositiveIntegerEnv,
  getRequiredEnv,
  isNodeEnvironment,
  setEnv,
} from '../../../payload/system/config/environment.ts';

const controlledKeys = [
  'FEATURE_ENABLED',
  'NODE_ENV',
  'OPTIONAL_VALUE',
  'PAGE_SIZE',
  'REQUIRED_VALUE',
  'SNAPSHOT_VALUE',
] as const;
const originalEnv = createEnv({});
const originalValues = new Map(controlledKeys.map((key) => [key, originalEnv[key]]));

function restoreEnv(): void {
  for (const key of controlledKeys) {
    const originalValue = originalValues.get(key);
    setEnv(key, originalValue);
  }
}

afterEach(restoreEnv);

describe('environment config preset', () => {
  test('normalizes optional and required string values', () => {
    setEnv('OPTIONAL_VALUE', '  value  ');
    setEnv('REQUIRED_VALUE', '  required  ');

    expect(getOptionalEnv('OPTIONAL_VALUE')).toBe('value');
    expect(getRequiredEnv('REQUIRED_VALUE')).toBe('required');

    setEnv('OPTIONAL_VALUE', '   ');
    setEnv('REQUIRED_VALUE', '   ');

    expect(getOptionalEnv('OPTIONAL_VALUE')).toBeUndefined();
    expect(() => getRequiredEnv('REQUIRED_VALUE')).toThrow('REQUIRED_VALUE env var is required');
  });

  test('parses positive integers and rejects invalid values', () => {
    setEnv('PAGE_SIZE', ' 25 ');
    expect(getPositiveIntegerEnv('PAGE_SIZE')).toBe(25);

    setEnv('PAGE_SIZE', '0');
    expect(() => getPositiveIntegerEnv('PAGE_SIZE')).toThrow('Invalid PAGE_SIZE env var value: 0');

    setEnv('PAGE_SIZE', undefined);
    expect(getPositiveIntegerEnv('PAGE_SIZE')).toBeUndefined();
    expect(() => getPositiveIntegerEnv('PAGE_SIZE', true)).toThrow('PAGE_SIZE env var is required');
  });

  test('parses booleans and rejects invalid values', () => {
    setEnv('FEATURE_ENABLED', ' FALSE ');
    expect(getBooleanEnv('FEATURE_ENABLED', true)).toBe(false);

    setEnv('FEATURE_ENABLED', undefined);
    expect(getBooleanEnv('FEATURE_ENABLED', true)).toBe(true);

    setEnv('FEATURE_ENABLED', 'yes');
    expect(() => getBooleanEnv('FEATURE_ENABLED', false)).toThrow(
      'Invalid FEATURE_ENABLED env var value: yes',
    );
  });

  test('creates child-process env snapshots and identifies NODE_ENV case-insensitively', () => {
    setEnv('SNAPSHOT_VALUE', 'original');
    setEnv('NODE_ENV', ' Test ');

    const snapshot = createEnv({ SNAPSHOT_VALUE: 'override' });

    expect(snapshot.SNAPSHOT_VALUE).toBe('override');
    expect(createEnv({}).SNAPSHOT_VALUE).toBe('original');
    expect(isNodeEnvironment('test')).toBe(true);
    expect(isNodeEnvironment('production')).toBe(false);
  });
});
