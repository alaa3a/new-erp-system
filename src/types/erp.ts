export type EntityStatus = 'active' | 'inactive';
export type PartnerType = 'customer' | 'vendor' | 'both';
export type InvoiceType = 'sales' | 'purchase' | 'credit_note' | 'debit_note';
export type InvoiceStatus = 'draft' | 'posted' | 'partial_paid' | 'paid' | 'cancelled';
export type EntryStatus = 'draft' | 'posted' | 'cancelled';
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type AccountLinkType = 'cost_center' | 'partner' | 'employee';
export type AccountPartnerFilter = 'customer' | 'vendor' | 'both';
export type ItemType = 'stock' | 'service';
export type TaxType = 'output' | 'input';
export type MovementType = 'receipt' | 'issue' | 'transfer' | 'adjustment' | 'return';
export type ReferenceType = 'invoice' | 'entry' | 'adjustment' | 'transfer' | 'purchase_order';
export type PeriodStatus = 'open' | 'closed' | 'locked';
export type AuditAction = 'create' | 'update' | 'delete' | 'post' | 'cancel';
export type EntryLineType = 'normal' | 'tax' | 'payment';

export interface Company {
  id: number;
  name: string;
  registrationNumber: string;
  taxRegistrationNumber: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  baseCurrencyCode: string;
  fiscalYearStartMonth: number;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface FiscalPeriod {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface DocumentSequence {
  id: number;
  documentType: string;
  prefix: string;
  nextNumber: number;
  padding: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface User {
  id: number;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  permissionIds: number[];
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Permission {
  id: number;
  key: string;
  module: string;
  action: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessPartner {
  id: number;
  code: string;
  name: string;
  type: PartnerType;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  taxRegistrationNumber: string;
  defaultVatCodeId: number | null;
  paymentTermId: number | null;
  creditLimit: number;
  status: EntityStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Account {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  parentId: number | null;
  costCenterId: number | null;
  /** Dynamic link — an account can be linked to a cost center, a partner, or an employee (linkId is polymorphic). */
  linkType: AccountLinkType | null;
  /** Target id in the table referenced by linkType. */
  linkId: number | null;
  /** Only when linkType='partner' — constrains which partner types the line editor shows (customer | vendor | both). */
  linkPartnerFilter: AccountPartnerFilter | null;
  isActive: boolean;
  isSystemAccount: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CostCenter {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  isActive: boolean;
  responsiblePerson: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  address: string;
  manager: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Product {
  id: number;
  code: string;
  name: string;
  description: string;
  itemType: ItemType;
  unitOfMeasure: string;
  salesPrice: number;
  purchasePrice: number;
  vatCodeId: number | null;
  purchaseVatCodeId: number | null;
  defaultWarehouseId: number | null;
  reorderPoint: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ProductWarehouseStock {
  id: number;
  productId: number;
  warehouseId: number;
  quantity: number;
  averageCost: number;
  lastUpdated: string;
  version: number;
}

export type FilingPeriod = 'monthly' | 'quarterly' | 'annually';

export type TaxDetailInputType = 'text' | 'date' | 'number';

/** A user-created input field definition on a tax type (Phase 4) — config lives on `tax_code.detailsConfig` as JSON. */
export interface TaxDetailFieldDef {
  key: string;
  label: string;
  inputType: TaxDetailInputType;
}

export interface Employee {
  id: number;
  code: string;
  name: string;
  jobTitle: string;
  department: string;
  email: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface TaxCode {
  id: number;
  code: string;
  name: string;
  rate: number;
  type: TaxType;
  parentId: number | null;
  accountCode: string;
  isActive: boolean;
  isSystemCode: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  isGroup: boolean;
  filingPeriod: FilingPeriod;
  /** JSON array of `TaxDetailFieldDef` — the dynamic inputs the line editor renders for this tax type (Phase 4). */
  detailsConfig: TaxDetailFieldDef[];
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Server-computed: true when referenced by an invoice line, entry line, product, or partner */
  inUse?: boolean;
}

export type TaxGroup = TaxCode & { isGroup: true };

export interface AccountUsage {
  postingProfiles: { name: string; role: string }[];  // role: AR | AP | Cash | Discount | Inventory | COGS | Adjustment
  taxCodes: string[];
}

export interface PaymentTerm {
  id: number;
  code: string;
  name: string;
  daysUntilDue: number;
  discountPercent: number;
  discountDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PostingProfile {
  id: number;
  name: string;
  invoiceType: InvoiceType;
  accountsReceivableCode: string;
  accountsPayableCode: string;
  cashAccountCode: string;
  discountAccountCode: string;
  inventoryAccountCode: string | null;
  cogsAccountCode: string | null;
  /** Default entry category applied to entries auto-created via this profile (invoice posting). */
  entryCategoryId: number | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// ─── Purchase Order Types ──────────────────────────────────────────────

export type POStatus = 'draft' | 'approved' | 'partially_received' | 'fully_received' | 'closed' | 'cancelled';
export type ReceiptStatus = 'partial' | 'full';

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  status: POStatus;
  businessPartnerId: number | null;
  partnerName: string;
  orderDate: string;
  expectedDate: string;
  warehouseId: number | null;
  referenceNumber: string;
  notes: string;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  approvedBy: string | null;
  approvedAt: string | null;
  closedBy: string | null;
  closedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PurchaseOrderLine {
  id: number;
  poId: number;
  lineNumber: number;
  productId: number;
  description: string;
  quantity: number;
  unitPrice: number;
  receivedQuantity: number;
  invoicedQuantity: number;
  discountPercent: number;
  lineTotal: number;
  lineType: 'stock' | 'service';
  warehouseId: number | null;
  costCenterId: number | null;
  accountCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoodsReceipt {
  id: number;
  receiptNumber: string;
  poId: number;
  status: ReceiptStatus;
  receiptDate: string;
  warehouseId: number;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoodsReceiptLine {
  id: number;
  receiptId: number;
  poLineId: number;
  productId: number;
  description: string;
  quantity: number;
  unitCost: number;
  createdAt: string;
}

export interface EntryCategory {
  id: number;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Invoice {
  id: number;
  invoiceNumber: string;
  type: InvoiceType;
  status: InvoiceStatus;
  businessPartnerId: number | null;
  partnerName: string;
  postingProfileId: number | null;
  invoiceDate: string;
  dueDate: string;
  paymentTermId: number | null;
  currencyCode: string;
  exchangeRate: number;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  notes: string;
  referenceNumber: string;
  linkedInvoiceId: number | null;
  warehouseId: number | null;
  approvedBy: string | null;
  approvedAt: string | null;
  postedBy: string | null;
  postedAt: string | null;
  purchaseOrderId: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface InvoiceLine {
  id: number;
  invoiceId: number;
  lineNumber: number;
  productId: number;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatCodeId: number | null;
  vatRate: number;
  vatAmount: number;
  lineTotal: number;
  warehouseId: number | null;
  costCenterId: number | null;
  accountCode: string;
  lineType: 'stock' | 'service';
  createdAt: string;
  updatedAt: string;
}

export interface Entry {
  id: number;
  entryNumber: string;
  status: EntryStatus;
  entryDate: string;
  description: string;
  referenceNumber: string;
  categoryId: number | null;
  totalDebit: number;
  totalCredit: number;
  currencyCode: string;
  exchangeRate: number;
  linkedInvoiceId: number | null;
  periodId: number | null;
  costCenterId: number | null;
  postedBy: string | null;
  postedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface EntryLine {
  id: number;
  entryId: number;
  lineNumber: number;
  accountCode: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  businessPartnerId: number | null;
  costCenterId: number | null;
  vatCodeId: number | null;
  vatAmount: number;
  /** Line classification: `normal` (P&L / balance), `tax` (VAT/WHT control, vatCodeId + vatAmount set), `payment` (AR/AP clearing with allocations). */
  lineType: EntryLineType;
  supplierName: string | null;
  supplierTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  /** Employee dimension (Phase 5) — populated when the line's account is linked to an employee. */
  employeeId: number | null;
  /** Captured values of the tax type's user-created detail fields (Phase 4) — JSON string. */
  taxDetailsJson: string | null;
  createdAt: string;
}

/** Per-invoice allocation on a `payment` entry line. Written to `invoice.paidAmount` at post time. */
export interface EntryLinePaymentAllocation {
  id: number;
  entryLineId: number;
  invoiceId: number;
  amount: number;
  notes: string;
  createdAt: string;
}

export interface InventoryMovement {
  id: number;
  movementNumber: string;
  type: MovementType;
  productId: number;
  warehouseId: number;
  quantity: number;
  unitCost: number;
  totalCost: number;
  referenceType: ReferenceType;
  referenceId: number;
  referenceNumber: string;
  postedBy: string;
  postedAt: string;
  createdAt: string;
}

export interface AuditLog {
  id: number;
  userId: number;
  action: AuditAction;
  entityType: string;
  entityId: number;
  entityNumber: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

export interface AgingBucket {
  id: number;
  label: string;
  fromDays: number;
  toDays: number;
  sortOrder: number;
  version: number;
}

export interface Notification {
  id: number;
  userId: number;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  entityType: string | null;
  entityId: number | null;
  isRead: boolean;
  createdAt: string;
}
