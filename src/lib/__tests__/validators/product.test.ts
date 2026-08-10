import { describe, it, expect } from 'vitest';
import { updateProductSchema } from '../../validators/product';

describe('updateProductSchema', () => {
  it('should not inject defaults for omitted keys (partial PUT)', () => {
    const result = updateProductSchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ isActive: false });
  });

  it('should allow clearing parent to null explicitly', () => {
    const result = updateProductSchema.safeParse({ parentId: null });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ parentId: null });
  });

  it('should allow setting parent to a number', () => {
    const result = updateProductSchema.safeParse({ parentId: 3 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ parentId: 3 });
  });
});