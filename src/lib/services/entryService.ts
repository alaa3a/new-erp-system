import { db } from '../db';
import { entryRepository } from '../repositories/entryRepository';
import { fiscalPeriodRepository } from '../repositories/fiscalPeriodRepository';
import { accountRepository } from '../repositories/accountRepository';
import { costCenterRepository } from '../repositories/costCenterRepository';
import { partnerRepository } from '../repositories/partnerRepository';
import { employeeRepository } from '../repositories/employeeRepository';
import { postingProfileRepository } from '../repositories/postingProfileRepository';
import { invoiceService } from './invoiceService';
import { BusinessRuleError, NotFoundError } from '../utils/errors';

/** AR/AP detection: a partner-linked account's filter wins, then the active posting-profile fallback, default both. */
function resolvePartnerRoleForAccount(accountCode: string): 'ar' | 'ap' | 'both' {
  const account = accountRepository.findByCode(accountCode);
  if (account && account.linkType === 'partner') {
    const filter = account.linkPartnerFilter || 'both';
    return filter === 'customer' ? 'ar' : filter === 'vendor' ? 'ap' : 'both';
  }
  const active = postingProfileRepository.findAll().filter(p => p.isActive);
  const asAr = active.some(p => p.accountsReceivableCode === accountCode);
  const asAp = active.some(p => p.accountsPayableCode === accountCode);
  if (asAr && asAp) return 'both';
  if (asAr) return 'ar';
  if (asAp) return 'ap';
  return 'both';
}

/** True when `ccId` is `rootId` or a descendant of it (any depth) — used for linked-subtree validation. */
function isInCostCenterSubtree(ccId: number, rootId: number): boolean {
  let current = costCenterRepository.findById(ccId);
  let guard = 0;
  while (current) {
    if (current.id === rootId) return true;
    if (!current.parentId) break;
    current = costCenterRepository.findById(current.parentId);
    if (++guard > 100) break; // cycle guard
  }
  return false;
}

export const entryService = {
  validateBalanced(lines: Array<{ debitAmount: number; creditAmount: number }>): void {
    const totalDebit = lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.creditAmount, 0);
    if (totalDebit !== totalCredit) throw new BusinessRuleError(`Entry is not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`);
  },

  /** For payment lines, the per-invoice allocation total must equal the line amount (§10.6 #4). */
  validateLineAllocations(lines: Array<{ lineType?: string; debitAmount: number; creditAmount: number; allocations?: { amount: number }[] }>): void {
    for (const line of lines) {
      if (line.lineType !== 'payment') continue;
      const allocations = line.allocations || [];
      if (allocations.length === 0) continue;
      const lineAmount = Math.max(line.debitAmount, line.creditAmount);
      const allocSum = allocations.reduce((sum, a) => sum + a.amount, 0);
      if (allocSum !== lineAmount) {
        throw new BusinessRuleError(
          `Payment allocation total (${allocSum}) must equal the line amount (${lineAmount})`,
        );
      }
    }
  },

  /** Reference validation at save: account/CC/partner/employee must exist & be active; AR/AP must match partner role. */
  validateReferences(lines: Array<{ accountCode: string; costCenterId?: number | null; businessPartnerId?: number | null; employeeId?: number | null; lineType?: string }>): void {
    for (const line of lines) {
      const account = accountRepository.findByCode(line.accountCode);
      if (!account || !account.isActive) {
        throw new BusinessRuleError(`Account ${line.accountCode} does not exist or is inactive`);
      }
      if (line.costCenterId) {
        const cc = costCenterRepository.findById(line.costCenterId);
        if (!cc || !cc.isActive) throw new BusinessRuleError(`Cost center #${line.costCenterId} does not exist or is inactive`);
      }
      if (line.employeeId) {
        const employee = employeeRepository.findById(line.employeeId);
        if (!employee || !employee.isActive) throw new BusinessRuleError(`Employee #${line.employeeId} does not exist or is inactive`);
      }

      // Dimension enforcement (D2): an account linked to a cost center / partner /
      // employee must carry that dimension on every line that uses it — otherwise
      // the future CC/partner/employee ledgers would silently miss rows.
      // Partner and employee links are dimension-level (type filter only / employees
      // in general) — the concrete partner/employee is chosen on each entry line.
      if (account.linkType === 'cost_center' && account.linkId) {
        if (!line.costCenterId) {
          throw new BusinessRuleError(`Account ${line.accountCode} is linked to a cost center — add a cost center to the line`);
        }
        if (!isInCostCenterSubtree(line.costCenterId, account.linkId)) {
          throw new BusinessRuleError(`Cost center #${line.costCenterId} is outside the cost center subtree linked to account ${line.accountCode}`);
        }
      }
      if (account.linkType === 'partner') {
        if (!line.businessPartnerId) {
          throw new BusinessRuleError(`Account ${line.accountCode} is linked to partners — add a partner to the line`);
        }
        const filter = account.linkPartnerFilter || 'both';
        const partner = partnerRepository.findById(line.businessPartnerId);
        if (!partner || partner.status !== 'active') {
          throw new BusinessRuleError(`Partner #${line.businessPartnerId} does not exist or is inactive`);
        }
        if (filter === 'customer' && partner.type === 'vendor') {
          throw new BusinessRuleError(`Account ${line.accountCode} is linked to customers — only customer partners can be used on this line`);
        }
        if (filter === 'vendor' && partner.type === 'customer') {
          throw new BusinessRuleError(`Account ${line.accountCode} is linked to vendors — only vendor partners can be used on this line`);
        }
      }
      if (account.linkType === 'employee') {
        if (!line.employeeId) {
          throw new BusinessRuleError(`Account ${line.accountCode} is linked to employees — add an employee to the line`);
        }
        const employee = employeeRepository.findById(line.employeeId);
        if (!employee || !employee.isActive) {
          throw new BusinessRuleError(`Employee #${line.employeeId} does not exist or is inactive`);
        }
      }

      if (line.lineType === 'payment') {
        const role = resolvePartnerRoleForAccount(line.accountCode);
        if ((role === 'ar' || role === 'ap') && !line.businessPartnerId) {
          throw new BusinessRuleError(`Payment line on ${role === 'ar' ? 'Accounts Receivable' : 'Accounts Payable'} account ${line.accountCode} requires a business partner`);
        }
        if (line.businessPartnerId) {
          const partner = partnerRepository.findById(line.businessPartnerId);
          if (!partner || partner.status !== 'active') {
            throw new BusinessRuleError(`Partner #${line.businessPartnerId} does not exist or is inactive`);
          }
          if (role === 'ar' && partner.type === 'vendor') {
            throw new BusinessRuleError(`Account ${line.accountCode} is Accounts Receivable — only customer partners can be used on this payment line`);
          }
          if (role === 'ap' && partner.type === 'customer') {
            throw new BusinessRuleError(`Account ${line.accountCode} is Accounts Payable — only vendor partners can be used on this payment line`);
          }
        }
      } else if (line.businessPartnerId) {
        const partner = partnerRepository.findById(line.businessPartnerId);
        if (!partner || partner.status !== 'active') {
          throw new BusinessRuleError(`Partner #${line.businessPartnerId} does not exist or is inactive`);
        }
      }
    }
  },

  postEntry(entryId: number, userId: string): void {
    const entry = entryRepository.findById(entryId);
    if (!entry) throw new NotFoundError('Entry', entryId);
    if (entry.status !== 'draft') throw new BusinessRuleError('Only draft entries can be posted');

    const lines = entryRepository.findLines(entryId);
    if (lines.length === 0) throw new BusinessRuleError('Entry must have at least one line');

    this.validateBalanced(lines);

    // Fiscal periods: reject posting into closed/locked periods (drafts stay preparable)
    if (entry.periodId) {
      const period = fiscalPeriodRepository.findById(entry.periodId);
      if (!period) throw new BusinessRuleError('Entry references an unknown fiscal period');
      if (period.status !== 'open') {
        throw new BusinessRuleError(`Cannot post into a ${period.status} fiscal period (${period.name})`);
      }
    }

    const transaction = db.transaction(() => {
      // Apply payment allocations to invoices (ageing correct by construction).
      // Allocations were validated against the line amount at save; each
      // application re-checks the invoice's remaining balance.
      for (const line of lines) {
        if (line.lineType !== 'payment') continue;
        const allocations = entryRepository.findAllocations(line.id);
        for (const alloc of allocations) {
          invoiceService.applyPaymentAllocation(alloc.invoiceId, alloc.amount);
        }
      }

      entryRepository.updateTotals(entryId, entry.totalDebit, entry.totalCredit);
      entryRepository.updateStatus(entryId, 'posted', userId);
    });
    transaction();
  },
};
