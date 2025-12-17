// Money utilities using integer cents to avoid floating point issues

export interface Money {
  amount: number; // cents (integer)
  currency: string;
}

export function createMoney(amount: number, currency = 'USD'): Money {
  return {
    amount: Math.round(amount),
    currency
  };
}

export function fromDecimal(decimal: number, currency = 'USD'): Money {
  return createMoney(Math.round(decimal * 100), currency);
}

export function toDecimal(money: Money): number {
  return money.amount / 100;
}

export function formatMoney(money: Money): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: money.currency
  });
  return formatter.format(toDecimal(money));
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add money with different currencies: ${a.currency} and ${b.currency}`);
  }
  return createMoney(a.amount + b.amount, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(
      `Cannot subtract money with different currencies: ${a.currency} and ${b.currency}`
    );
  }
  return createMoney(a.amount - b.amount, a.currency);
}

export function multiplyMoney(money: Money, factor: number): Money {
  return createMoney(Math.round(money.amount * factor), money.currency);
}

export function divideMoney(money: Money, divisor: number): Money {
  if (divisor === 0) {
    throw new Error('Cannot divide by zero');
  }
  return createMoney(Math.round(money.amount / divisor), money.currency);
}

export function calculatePercentage(money: Money, percentage: number): Money {
  return createMoney(Math.round(money.amount * (percentage / 100)), money.currency);
}

export function isZero(money: Money): boolean {
  return money.amount === 0;
}

export function isPositive(money: Money): boolean {
  return money.amount > 0;
}

export function isNegative(money: Money): boolean {
  return money.amount < 0;
}

export function compareMoney(a: Money, b: Money): number {
  if (a.currency !== b.currency) {
    throw new Error(
      `Cannot compare money with different currencies: ${a.currency} and ${b.currency}`
    );
  }
  return a.amount - b.amount;
}
