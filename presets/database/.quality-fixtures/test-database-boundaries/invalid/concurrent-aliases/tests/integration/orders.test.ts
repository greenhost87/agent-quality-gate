import { describe as suite, it as spec, test as check } from 'bun:test';
import { useIsolatedTestDatabase } from '@/tests/setup/testDatabase';
useIsolatedTestDatabase(import.meta.path);
suite.concurrent('group', () => {});
spec.concurrent('case', () => {});
check.concurrent('case', () => {});
