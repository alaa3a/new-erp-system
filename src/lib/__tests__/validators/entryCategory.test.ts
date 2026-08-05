import { describe, it, expect } from 'vitest';
import { entryCategorySchema } from '../../validators/settings';

describe('entryCategorySchema', () => {
  it('should accept a valid category', () => {
    const result = entryCategorySchema.safeParse({
      code: 'SALES',
      name: 'Sales Revenue',
      description: 'Sales entries',
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it('should default isActive to true when omitted', () => {
    const result = entryCategorySchema.safeParse({ code: 'GEN', name: 'General' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isActive).toBe(true);
  });

  it('should reject a missing name', () => {
    const result = entryCategorySchema.safeParse({ code: 'BAD', name: '' });
    expect(result.success).toBe(false);
  });
});
