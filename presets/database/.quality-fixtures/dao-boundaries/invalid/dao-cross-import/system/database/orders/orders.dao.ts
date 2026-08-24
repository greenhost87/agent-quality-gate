import type { User } from '../auth/users.dao.types';
import { usersDao } from '@/system/database/auth/users.dao';
export class OrdersDao {
  load(limit = 10): User {
    return { limit, usersDao };
  }
}
