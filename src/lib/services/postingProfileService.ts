import { ensureSequence } from '../db';
import { postingProfileRepository } from '../repositories/postingProfileRepository';
import { ValidationError } from '../utils/errors';
import { PostingProfile, InvoiceType } from '@/types/erp';

/**
 * Posting-profile account resolver (§6.4). Resolution order for every account:
 * the caller's explicit profile (e.g. the invoice's own postingProfileId) →
 * the default profile → the seeded chart-of-accounts fallback.
 *
 * NOTE: the plan's hardcoded fallbacks (1000/1100/2000) come from the legacy
 * quick-pay modal; this ERP's seed chart uses 101/102/201 instead, so the
 * fallbacks point at the real seeded accounts.
 */
const FALLBACK = { ar: '102', ap: '201', cash: '101', discount: '502' };

function activeProfiles(): PostingProfile[] {
  return postingProfileRepository.findAll();
}

/** The default profile: isDefault for the given invoice type → any profile for the type → global isDefault → first active. */
export function getDefaultProfile(invoiceType?: InvoiceType | null): PostingProfile | null {
  const all = activeProfiles();
  if (invoiceType) {
    const byType = all.filter(p => p.invoiceType === invoiceType);
    const typeDefault = byType.find(p => p.isDefault) || byType[0];
    if (typeDefault) return typeDefault;
  }
  return all.find(p => p.isDefault) || all[0] || null;
}

export function resolveAr(profile?: PostingProfile | null): string {
  return profile?.accountsReceivableCode || getDefaultProfile('sales')?.accountsReceivableCode || FALLBACK.ar;
}

export function resolveAp(profile?: PostingProfile | null): string {
  return profile?.accountsPayableCode || getDefaultProfile('purchase')?.accountsPayableCode || FALLBACK.ap;
}

export function resolveCash(profile?: PostingProfile | null): string {
  return profile?.cashAccountCode || getDefaultProfile()?.cashAccountCode || FALLBACK.cash;
}

export function resolveDiscount(profile?: PostingProfile | null): string {
  return profile?.discountAccountCode || getDefaultProfile()?.discountAccountCode || FALLBACK.discount;
}

/** Prefixes used when ensuring a profile's invoice-type document sequence (§7). */
const TYPE_PREFIX: Record<InvoiceType, string> = {
  sales: 'INV-S-', purchase: 'INV-P-', credit_note: 'CN-', debit_note: 'DN-',
};

/** Ensures the invoice-type document sequence exists (idempotent) so the Document Sequences page always shows it. */
export function ensureProfileSequence(invoiceType: InvoiceType): void {
  ensureSequence(invoiceType, TYPE_PREFIX[invoiceType] || 'INV-', 6);
}

/**
 * Direction-aware + AR≠AP validation (§6.1).
 * Throws for hard errors; returns a warning string ('') when none.
 */
export function validateProfile(data: {
  invoiceType?: InvoiceType;
  accountsReceivableCode?: string;
  accountsPayableCode?: string;
  cashAccountCode?: string;
}): string {
  const type = data.invoiceType || 'sales';
  const ar = data.accountsReceivableCode || '';
  const ap = data.accountsPayableCode || '';
  const cash = data.cashAccountCode || '';

  if (type === 'sales' || type === 'debit_note') {
    if (!ar) throw new ValidationError('Accounts Receivable is required for sales-side profiles');
  } else {
    if (!ap) throw new ValidationError('Accounts Payable is required for purchase-side profiles');
  }
  if (!cash) throw new ValidationError('Cash / Bank account is required');
  if (ar && ap && ar === ap) {
    throw new ValidationError('Accounts Receivable and Accounts Payable must be different accounts');
  }

  return '';
}
