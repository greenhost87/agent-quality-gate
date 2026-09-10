import { mock, spyOn, test, expect } from 'bun:test';
import * as fs from 'node:fs';
import { createOrder } from '../src/orders.ts';

test('uses an external port', () => {
  const port = { send: mock(() => 'sent') };
  expect(port.send()).toBe('sent');
});
spyOn(fs, 'existsSync').mockReturnValue(false);
mock.module('node:fs', () => ({}));
const port = { send: () => 'sent' };
spyOn(port, 'send');
globalThis.fetch = () => Promise.resolve(new Response('ok'));
const order = createOrder();
order.status = 'cancelled';
function shadowed(fs) {
  spyOn(fs, 'existsSync');
}
shadowed(port);
