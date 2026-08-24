import { OrdersDao } from '@/system/database/orders/orders.dao';

export function loadOrders() {
  return new OrdersDao().list();
}
