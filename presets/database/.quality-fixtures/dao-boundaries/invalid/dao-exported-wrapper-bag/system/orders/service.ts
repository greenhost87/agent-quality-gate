import * as ordersDao from '@/system/database/orders/orders.dao';

async function persist(id: string): Promise<void> {
  await ordersDao.saveOrder(id, 'facade');
}

export async function save(id: string): Promise<void> {
  await persist(id);
}

export const operations = { nested: { save } };
