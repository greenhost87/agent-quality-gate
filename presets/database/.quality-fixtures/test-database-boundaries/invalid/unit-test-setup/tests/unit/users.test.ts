import { useIsolatedTestDatabase } from '@/tests/setup/testDatabase';
const query = 'SELECT * FROM users';
function getClient(): void {}
void useIsolatedTestDatabase;
void query;
