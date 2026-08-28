import * as ordersDao from '@/system/database/orders/orders.dao';

const operations = {
  save: async (id: string) => ordersDao.saveOrder(id, 'local'),
};

export async function saveOrder(id: string): Promise<void> {
  await operations.save(id);
}
