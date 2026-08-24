export class OrdersDao {
  list() {
    return [];
  }
}

export const ordersDao = new OrdersDao();

export function createOrdersDao() {
  return new OrdersDao();
}
