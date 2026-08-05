import { describe, it, expect } from 'vitest';
import { createTaxCodeSchema } from '../../validators/taxCode';

describe('createTaxCodeSchema', () => {
  it('accepts a valid tax group', () => {
    const res = createTaxCodeSchema.safeParse({ code: 'VAT', name: 'VAT', isGroup: true, filingPeriod: 'quarterly' });
    expect(res.success).toBe(true);
  });

  it('accepts a valid tax type under a group', () => {
    const res = createTaxCodeSchema.safeParse({
      code: 'VAT15', name: 'VAT 15%', isGroup: false,
      rate: 15, type: 'output', parentId: 1, accountCode: '2100',
    });
    expect(res.success).toBe(true);
  });

  it('rejects a tax type without a parent group', () => {
    const res = createTaxCodeSchema.safeParse({
      code: 'VAT15', name: 'VAT 15%', isGroup: false,
      rate: 15, type: 'output', parentId: null, accountCode: '2100',
    });
    expect(res.success).toBe(false);
  });

  it('rejects a tax type without an account code', () => {
    const res = createTaxCodeSchema.safeParse({
      code: 'VAT15', name: 'VAT 15%', isGroup: false,
      rate: 15, type: 'output', parentId: 1, accountCode: '',
    });
    expect(res.success).toBe(false);
  });

  it('rejects an invalid filing period on a group', () => {
    const res = createTaxCodeSchema.safeParse({
      code: 'VAT', name: 'VAT', isGroup: true, filingPeriod: 'weekly',
    });
    expect(res.success).toBe(false);
  });

  it('rejects a tax group with a parent (sub-groups not supported)', () => {
    const res = createTaxCodeSchema.safeParse({
      code: 'VAT-SUB', name: 'VAT Sub', isGroup: true, parentId: 1,
    });
    expect(res.success).toBe(false);
  });
});
