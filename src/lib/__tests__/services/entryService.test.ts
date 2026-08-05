import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, seedTestData } from '../test-helper';
import { entryService } from '../../services/entryService';
import { entryRepository } from '../../repositories/entryRepository';
import { invoiceRepository } from '../../repositories/invoiceRepository';
import { fiscalPeriodRepository } from '../../repositories/fiscalPeriodRepository';
import { accountRepository } from '../../repositories/accountRepository';
import { employeeRepository } from '../../repositories/employeeRepository';
import { db } from '../../db';
import { BusinessRuleError, NotFoundError } from '../../utils/errors';

describe('entryService', () => {
  let data: any;

  beforeAll(async () => {
    await setupTestDatabase();
    data = seedTestData();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  describe('validateBalanced', () => {
    it('should not throw for balanced entries', () => {
      expect(() =>
        entryService.validateBalanced([
          { debitAmount: 10000, creditAmount: 0 },
          { debitAmount: 0, creditAmount: 10000 },
        ])
      ).not.toThrow();
    });

    it('should throw BusinessRuleError for unbalanced entries', () => {
      expect(() =>
        entryService.validateBalanced([
          { debitAmount: 10000, creditAmount: 0 },
          { debitAmount: 0, creditAmount: 5000 },
        ])
      ).toThrow(BusinessRuleError);
    });

    it('should throw with debit and credit totals in message', () => {
      expect(() =>
        entryService.validateBalanced([
          { debitAmount: 20000, creditAmount: 0 },
          { debitAmount: 0, creditAmount: 10000 },
        ])
      ).toThrow(/Debit: 20000/);
    });

    it('should pass for multi-line balanced entries', () => {
      expect(() =>
        entryService.validateBalanced([
          { debitAmount: 5000, creditAmount: 0 },
          { debitAmount: 3000, creditAmount: 0 },
          { debitAmount: 0, creditAmount: 8000 },
        ])
      ).not.toThrow();
    });

    it('should pass for zero amounts', () => {
      expect(() =>
        entryService.validateBalanced([
          { debitAmount: 0, creditAmount: 0 },
        ])
      ).not.toThrow();
    });
  });

  describe('validateLineAllocations', () => {
    it('should pass when allocation total equals the payment line amount', () => {
      expect(() =>
        entryService.validateLineAllocations([
          { lineType: 'payment', debitAmount: 10000, creditAmount: 0, allocations: [{ amount: 6000 }, { amount: 4000 }] },
          { lineType: 'normal', debitAmount: 0, creditAmount: 10000, allocations: [{ amount: 9999 }] },
        ])
      ).not.toThrow();
    });

    it('should throw when allocation total mismatches the payment line amount', () => {
      expect(() =>
        entryService.validateLineAllocations([
          { lineType: 'payment', debitAmount: 10000, creditAmount: 0, allocations: [{ amount: 6000 }, { amount: 3000 }] },
        ])
      ).toThrow(/must equal the line amount/);
    });

    it('should ignore payment lines without allocations', () => {
      expect(() =>
        entryService.validateLineAllocations([
          { lineType: 'payment', debitAmount: 10000, creditAmount: 0 },
        ])
      ).not.toThrow();
    });
  });

  describe('validateReferences', () => {
    it('should throw when a payment line on an AR account has no partner', () => {
      expect(() =>
        entryService.validateReferences([
          { accountCode: '102', costCenterId: null, businessPartnerId: null, lineType: 'payment' },
        ])
      ).toThrow(/requires a business partner/);
    });

    it('should throw when a payment line on an AP account has no partner', () => {
      expect(() =>
        entryService.validateReferences([
          { accountCode: '201', costCenterId: null, businessPartnerId: null, lineType: 'payment' },
        ])
      ).toThrow(/requires a business partner/);
    });

    it('should throw when the partner role mismatches the AR/AP account', () => {
      expect(() =>
        entryService.validateReferences([
          { accountCode: '102', costCenterId: null, businessPartnerId: data.partnerIds.vendor, lineType: 'payment' },
        ])
      ).toThrow(/only customer partners/);
    });

    it('should pass payment lines with a matching partner role', () => {
      expect(() =>
        entryService.validateReferences([
          { accountCode: '102', costCenterId: null, businessPartnerId: data.partnerIds.customer, lineType: 'payment' },
          { accountCode: '201', costCenterId: null, businessPartnerId: data.partnerIds.vendor, lineType: 'payment' },
        ])
      ).not.toThrow();
    });

    it('should pass payment lines on non-AR/AP accounts without a partner', () => {
      expect(() =>
        entryService.validateReferences([
          { accountCode: '101', costCenterId: null, businessPartnerId: null, lineType: 'payment' },
        ])
      ).not.toThrow();
    });

    it('should apply a partner-link filter even without a profile role', () => {
      // Account 101 (cash) has no profile role → fallback 'both'. Link it to
      // partners (vendors) and the partner requirement applies via the link.
      const acct = accountRepository.findByCode('101')!
      accountRepository.update(acct.id, { linkType: 'partner', linkId: null, linkPartnerFilter: 'vendor' }, acct.version)
      try {
        expect(() =>
          entryService.validateReferences([
            { accountCode: '101', costCenterId: null, businessPartnerId: null, lineType: 'payment' },
          ])
        ).toThrow(/linked to partners/)
        expect(() =>
          entryService.validateReferences([
            { accountCode: '101', costCenterId: null, businessPartnerId: data.partnerIds.vendor, lineType: 'payment' },
          ])
        ).not.toThrow()
      } finally {
        const after = accountRepository.findByCode('101')!
        accountRepository.update(after.id, { linkType: null, linkId: null, linkPartnerFilter: null }, after.version)
      }
    });

    it('should let the partner-link filter override the posting-profile role', () => {
      // Profile maps '102' as AR, but the link filter says vendors — the link wins.
      const acct = accountRepository.findByCode('102')!
      accountRepository.update(acct.id, { linkType: 'partner', linkId: null, linkPartnerFilter: 'vendor' }, acct.version)
      try {
        expect(() =>
          entryService.validateReferences([
            { accountCode: '102', costCenterId: null, businessPartnerId: data.partnerIds.customer, lineType: 'payment' },
          ])
        ).toThrow(/only vendor partners/)
        expect(() =>
          entryService.validateReferences([
            { accountCode: '102', costCenterId: null, businessPartnerId: data.partnerIds.vendor, lineType: 'payment' },
          ])
        ).not.toThrow()
      } finally {
        const after = accountRepository.findByCode('102')!
        accountRepository.update(after.id, { linkType: null, linkId: null, linkPartnerFilter: null }, after.version)
      }
    });
  });

  describe('validateReferences — account-link dimension enforcement (D2)', () => {
    let ccId: number
    let ccChildId: number
    let ccOtherId: number
    let employeeId: number

    beforeAll(() => {
      const now = new Date().toISOString()
      ccId = db.prepare(
        'INSERT INTO cost_center (code, name, parentId, isActive, createdAt, updatedAt, version) VALUES (?, ?, NULL, 1, ?, ?, 1)'
      ).run('CC-DIM', 'Dimension CC', now, now).lastInsertRowid as number
      ccChildId = db.prepare(
        'INSERT INTO cost_center (code, name, parentId, isActive, createdAt, updatedAt, version) VALUES (?, ?, ?, 1, ?, ?, 1)'
      ).run('CC-DIM-CHILD', 'Dimension CC Child', ccId, now, now).lastInsertRowid as number
      ccOtherId = db.prepare(
        'INSERT INTO cost_center (code, name, parentId, isActive, createdAt, updatedAt, version) VALUES (?, ?, NULL, 1, ?, ?, 1)'
      ).run('CC-OTHER', 'Unrelated CC', now, now).lastInsertRowid as number
      employeeId = employeeRepository.create({ code: 'EM-1', name: 'Test Employee', isActive: true })
    })

    it('should require a cost center from the linked subtree on a CC-linked account', () => {
      const acct = accountRepository.findByCode('503')!
      accountRepository.update(acct.id, { linkType: 'cost_center', linkId: ccId, costCenterId: ccId }, acct.version)
      try {
        expect(() => entryService.validateReferences([{ accountCode: '503', costCenterId: null, businessPartnerId: null, lineType: 'normal' }]))
          .toThrow(/linked to a cost center/)
        // a real cost center outside the linked subtree → rejected
        expect(() => entryService.validateReferences([{ accountCode: '503', costCenterId: ccOtherId, businessPartnerId: null, lineType: 'normal' }]))
          .toThrow(/outside the cost center subtree/)
        // child of the linked root → allowed
        expect(() => entryService.validateReferences([{ accountCode: '503', costCenterId: ccChildId, businessPartnerId: null, lineType: 'normal' }]))
          .not.toThrow()
      } finally {
        const after = accountRepository.findByCode('503')!
        accountRepository.update(after.id, { linkType: null, linkId: null, costCenterId: null }, after.version)
      }
    })

    it('should require a partner of the linked filter type on a partner-linked account', () => {
      const acct = accountRepository.findByCode('503')!
      accountRepository.update(acct.id, { linkType: 'partner', linkId: null, linkPartnerFilter: 'customer' }, acct.version)
      try {
        expect(() => entryService.validateReferences([{ accountCode: '503', costCenterId: null, businessPartnerId: null, lineType: 'normal' }]))
          .toThrow(/linked to partners/)
        expect(() => entryService.validateReferences([{ accountCode: '503', costCenterId: null, businessPartnerId: data.partnerIds.vendor, lineType: 'normal' }]))
          .toThrow(/only customer partners/)
        expect(() => entryService.validateReferences([{ accountCode: '503', costCenterId: null, businessPartnerId: data.partnerIds.customer, lineType: 'normal' }]))
          .not.toThrow()
      } finally {
        const after = accountRepository.findByCode('503')!
        accountRepository.update(after.id, { linkType: null, linkId: null, linkPartnerFilter: null }, after.version)
      }
    })

    it('should require an existing employee on an employee-linked account', () => {
      const acct = accountRepository.findByCode('503')!
      accountRepository.update(acct.id, { linkType: 'employee', linkId: null }, acct.version)
      try {
        expect(() => entryService.validateReferences([{ accountCode: '503', costCenterId: null, businessPartnerId: null, employeeId: null, lineType: 'normal' }]))
          .toThrow(/linked to employees/)
        expect(() => entryService.validateReferences([{ accountCode: '503', costCenterId: null, businessPartnerId: null, employeeId: employeeId, lineType: 'normal' }]))
          .not.toThrow()
        expect(() => entryService.validateReferences([{ accountCode: '503', costCenterId: null, businessPartnerId: null, employeeId: 999999, lineType: 'normal' }]))
          .toThrow(/does not exist or is inactive/)
      } finally {
        const after = accountRepository.findByCode('503')!
        accountRepository.update(after.id, { linkType: null, linkId: null }, after.version)
      }
    })
  });

  describe('postEntry', () => {
    function createBalancedEntry() {
      const id = entryRepository.create({
        entryDate: '2026-07-29',
        description: 'Test for posting',
        createdBy: 'test',
      });
      entryRepository.addLine({
        entryId: id,        lineNumber: 1, accountCode: '101',
        description: 'Debit', debitAmount: 5000, creditAmount: 0,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal', supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
      });
      entryRepository.addLine({
        entryId: id,        lineNumber: 2, accountCode: '401',
        description: 'Credit', debitAmount: 0, creditAmount: 5000,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal', supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
      });
      entryRepository.updateTotals(id, 5000, 5000);
      return id;
    }

    it('should post a balanced journal entry', () => {
      const id = createBalancedEntry();
      entryService.postEntry(id, 'test-user');

      const entry = entryRepository.findById(id)!;
      expect(entry.status).toBe('posted');
      expect(entry.postedBy).toBe('test-user');
      expect(entry.postedAt).not.toBeNull();
    });

    it('should throw NotFoundError for non-existent entry', () => {
      expect(() => entryService.postEntry(99999, 'test'))
        .toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for already posted entry', () => {
      const id = createBalancedEntry();
      entryService.postEntry(id, 'test-user');
      expect(() => entryService.postEntry(id, 'test-user'))
        .toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError for entry without lines', () => {
      const id = entryRepository.create({
        entryDate: '2026-07-29',
        description: 'No lines', createdBy: 'test',
      });
      expect(() => entryService.postEntry(id, 'test'))
        .toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError for unbalanced entry', () => {
      const id = entryRepository.create({
        entryDate: '2026-07-29',
        description: 'Unbalanced', createdBy: 'test',
      });
      entryRepository.addLine({
        entryId: id,        lineNumber: 1, accountCode: '101',
        description: 'Debit', debitAmount: 5000, creditAmount: 0,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal', supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
      });
      entryRepository.addLine({
        entryId: id,        lineNumber: 2, accountCode: '401',
        description: 'Credit', debitAmount: 0, creditAmount: 4000,
        businessPartnerId: null, costCenterId: null, vatCodeId: null, vatAmount: 0,
        lineType: 'normal', supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
      });
      entryRepository.updateTotals(id, 5000, 4000);
      expect(() => entryService.postEntry(id, 'test'))
        .toThrow(BusinessRuleError);
    });

    it('should increment version after posting', () => {
      const id = createBalancedEntry();
      const before = entryRepository.findById(id)!;
      entryService.postEntry(id, 'test');
      const after = entryRepository.findById(id)!;
      expect(after.version).toBe(before.version + 1);
    });

    it('should apply payment allocations to invoices when posting', () => {
      const invoiceId = invoiceRepository.create({
        type: 'purchase', partnerName: 'Vendor',
        invoiceDate: '2026-07-29', dueDate: '2026-08-28', createdBy: 'test',
      });
      invoiceRepository.updateTotals(invoiceId, 0, 0, 10000);
      invoiceRepository.updateStatus(invoiceId, 'posted');

      const id = entryRepository.create({ entryDate: '2026-07-29', description: 'Payment to vendor', createdBy: 'test' });
      const lineId = entryRepository.addLine({
        entryId: id, lineNumber: 1, accountCode: '201', description: 'AP clearing',
        debitAmount: 10000, creditAmount: 0, businessPartnerId: null, costCenterId: null,
        vatCodeId: null, vatAmount: 0, lineType: 'payment',
        supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 2, accountCode: '101', description: 'Cash',
        debitAmount: 0, creditAmount: 10000, businessPartnerId: null, costCenterId: null,
        vatCodeId: null, vatAmount: 0, lineType: 'normal',
        supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
      });
      entryRepository.replaceAllocations(lineId, [{ invoiceId, amount: 10000, notes: '' }]);
      entryRepository.updateTotals(id, 10000, 10000);

      entryService.postEntry(id, 'test-user');

      const invoice = invoiceRepository.findById(invoiceId)!;
      expect(invoice.paidAmount).toBe(10000);
      expect(invoice.status).toBe('paid');
    });

    it('should reject posting into a closed fiscal period', () => {
      const periodId = fiscalPeriodRepository.create({
        name: 'FY 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open',
      });
      const id = entryRepository.create({ entryDate: '2026-06-01', description: 'In period', createdBy: 'test' });
      expect(entryRepository.findById(id)!.periodId).toBe(periodId);

      fiscalPeriodRepository.close(periodId, 'test-user');
      entryRepository.addLine({
        entryId: id, lineNumber: 1, accountCode: '101', description: 'D',
        debitAmount: 5000, creditAmount: 0, businessPartnerId: null, costCenterId: null,
        vatCodeId: null, vatAmount: 0, lineType: 'normal',
        supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
      });
      entryRepository.addLine({
        entryId: id, lineNumber: 2, accountCode: '401', description: 'C',
        debitAmount: 0, creditAmount: 5000, businessPartnerId: null, costCenterId: null,
        vatCodeId: null, vatAmount: 0, lineType: 'normal',
        supplierName: null, supplierTaxId: null, invoiceNumber: null, invoiceDate: null,
        employeeId: null, taxDetailsJson: null,
      });
      entryRepository.updateTotals(id, 5000, 5000);

      expect(() => entryService.postEntry(id, 'test'))
        .toThrow(/closed fiscal period/);
    });
  });
});
