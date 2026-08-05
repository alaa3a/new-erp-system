import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from './test-helper';
import { generateInvoiceNumber, generateMovementNumber, generatePONumber, generateReceiptNumber } from '../utils/idGenerator';

describe('Sequence Number Generation', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('should generate unique sequential invoice numbers', () => {
    const a = generateInvoiceNumber('test_inv_unique');
    const b = generateInvoiceNumber('test_inv_unique');
    expect(a).not.toBe(b);
    expect(b > a).toBe(true);
  });

  it('should not produce duplicates across many sequential calls', () => {
    const numbers = new Set<string>();
    for (let i = 0; i < 10; i++) {
      numbers.add(generateInvoiceNumber('test_inv_bulk'));
    }
    expect(numbers.size).toBe(10);
  });

  it('should generate unique movement numbers per type', () => {
    const m1 = generateMovementNumber('issue');
    const m2 = generateMovementNumber('issue');
    expect(m1).not.toBe(m2);
    expect(m1).toMatch(/^MI-/);
  });

  it('should generate unique PO and receipt numbers', () => {
    const po1 = generatePONumber();
    const po2 = generatePONumber();
    const gr1 = generateReceiptNumber();
    const gr2 = generateReceiptNumber();
    expect(po1).not.toBe(po2);
    expect(gr1).not.toBe(gr2);
    expect(po1).toMatch(/^PO-/);
    expect(gr1).toMatch(/^GR-/);
  });
});
