export async function mapFirstRowAsync<TRow, TOut>(
  rows: Promise<readonly TRow[]>,
  map: (row: TRow) => TOut,
): Promise<TOut | null> {
  const row = (await rows)[0];
  return row === undefined ? null : map(row);
}
