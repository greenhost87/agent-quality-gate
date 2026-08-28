import * as ordersDao from '@/system/database/orders/orders.dao';
import { saveOrder } from '@/system/database/orders/orders.dao';

export async function saveBoth(id: string): Promise<void> {
  await ordersDao.saveOrder(id, 'namespace');
  await saveOrder(id, 'named');
}
