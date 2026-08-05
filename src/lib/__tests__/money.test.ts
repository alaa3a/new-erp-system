import { describe, it, expect } from 'vitest';
import { toCents, calculateLineTotal, calculateVatAmount } from '../formatters/money';

describe('Money Calculations (integer cents)', () => {
  it('should convert float dollars to integer cents', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.01)).toBe(1);
    expect(toCents(100.005)).toBe(10001); // rounds half up
    expect(toCents(0)).toBe(0);
  });

  it('should calculate line totals without float truncation', () => {
    // 3 * 3333 cents * (1 - 15/100) = 8499.15 -> rounds to 8499
    expect(calculateLineTotal(3, 3333, 15)).toBe(8499);
    // 2 * 5000 * (1 - 5/100) = 9500
    expect(calculateLineTotal(2, 5000, 5)).toBe(9500);
    // No discount
    expect(calculateLineTotal(1, 1000, 0)).toBe(1000);
  });

  it('should sum line totals without drift', () => {
    const lines = [
      { qty: 3, price: 3333, discount: 10 },
      { qty: 2, price: 5000, discount: 5 },
    ];
    const total = lines.reduce((sum, l) => sum + calculateLineTotal(l.qty, l.price, l.discount), 0);
    expect(total).toBe(calculateLineTotal(3, 3333, 10) + calculateLineTotal(2, 5000, 5));
    expect(Number.isInteger(total)).toBe(true);
  });

  it('should calculate VAT amounts in cents', () => {
    expect(calculateVatAmount(10000, 15)).toBe(1500);
    expect(calculateVatAmount(8499, 20)).toBe(1700); // 1699.8 -> 1700
    expect(calculateVatAmount(0, 15)).toBe(0);
  });
});
