export function total(prices: readonly number[], discount: number): number {
  if (discount < 0 || discount > 1) {
    throw new RangeError('Invalid discount');
  }
  let amount = 0;
  for (const price of prices) {
    if (price < 0) {
      throw new RangeError('Invalid price');
    }
    amount += price;
  }
  return Math.round(amount * (1 - discount) * 100) / 100;
}
