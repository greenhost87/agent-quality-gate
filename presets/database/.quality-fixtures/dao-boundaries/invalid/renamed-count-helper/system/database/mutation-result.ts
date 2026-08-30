type Sql = <T>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;

export async function updateOrder(sql: Sql, id: number): Promise<void> {
  const result = await sql<{ readonly count: number }>`
    UPDATE orders SET status = 'done' WHERE id = ${id}
  `;
  if (result.count !== 1) throw new Error('Order not found');
}
