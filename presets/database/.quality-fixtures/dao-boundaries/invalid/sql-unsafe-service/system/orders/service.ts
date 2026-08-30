declare const databaseClient: {
  unsafe(query: string): Promise<unknown[]>;
};

export async function listOrders(): Promise<unknown[]> {
  return await databaseClient['unsafe']('SELECT id FROM orders');
}
