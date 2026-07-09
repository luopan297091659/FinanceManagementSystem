import Decimal from 'decimal.js';

export function toDecimal(value: string | number | Decimal): Decimal {
  return new Decimal(value);
}

export function addMoney(values: Array<string | number | Decimal>): Decimal {
  return values.reduce<Decimal>((sum, value) => sum.plus(value), new Decimal(0));
}
