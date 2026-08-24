import * as bunTest from 'bun:test';
import { useIsolatedTestDatabase } from '@/tests/setup/testDatabase';
useIsolatedTestDatabase(import.meta.path);
bunTest.test.concurrent('case', () => {});
bunTest.describe.concurrent('group', () => {});
