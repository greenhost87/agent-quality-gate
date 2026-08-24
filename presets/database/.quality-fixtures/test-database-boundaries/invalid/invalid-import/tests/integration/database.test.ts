import { initializeTestDatabase, useIsolatedTestDatabase } from '@/tests/setup/testDatabase';
useIsolatedTestDatabase(import.meta.path);
void initializeTestDatabase;
