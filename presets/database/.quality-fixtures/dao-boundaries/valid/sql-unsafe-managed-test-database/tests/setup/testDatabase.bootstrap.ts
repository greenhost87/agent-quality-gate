declare const client: {
  unsafe(query: string): Promise<unknown[]>;
};

export async function prepareTestDatabase(sqlText: string): Promise<void> {
  await client.unsafe(sqlText);
}
