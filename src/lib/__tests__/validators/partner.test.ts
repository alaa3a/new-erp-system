import { describe, it, expect } from 'vitest';
import { createPartnerSchema } from '../../validators/partner';

describe('createPartnerSchema', () => {
  // Mirrors exactly what the business-partners form sends (business-partners/page.tsx).
  const formPayload = {
    name: 'Acme Corp',
    type: 'customer',
    contactPerson: '',
    email: '',
    phone: '',
    taxId: '',
    address: '',
    city: '',
    country: '',
    creditLimit: 0,
    status: 'active',
    tags: [],
  };

  it('accepts the form payload with blank optional fields (email as empty string)', () => {
    const result = createPartnerSchema.safeParse(formPayload);
    expect(result.success).toBe(true);
  });

  it('accepts a valid email', () => {
    const result = createPartnerSchema.safeParse({ ...formPayload, email: 'acme@example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed non-empty email', () => {
    const result = createPartnerSchema.safeParse({ ...formPayload, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });
});
