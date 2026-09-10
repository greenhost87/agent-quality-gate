import { spyOn } from 'bun:test';
import * as ordersDao from '@/system/database/orders/orders.dao';

export function spyOnSaveOrder(): void {
  spyOn(ordersDao, 'saveOrder');
}
