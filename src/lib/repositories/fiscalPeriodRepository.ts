import { db } from '../db';
import { FiscalPeriod } from '@/types/erp';

export const fiscalPeriodRepository = {
  findAll: (): FiscalPeriod[] => (db.prepare('SELECT * FROM fiscal_period ORDER BY startDate DESC').all() as any[]).map(r => ({ ...r, status: r.status as FiscalPeriod['status'], closedBy: r.closedBy || null, closedAt: r.closedAt || null })),
  findById: (id: number) => { const r = db.prepare('SELECT * FROM fiscal_period WHERE id = ?').get(id) as any; return r ? { ...r, status: r.status as FiscalPeriod['status'] } : null; },
  findOpenPeriod: (date: string) => { const r = db.prepare("SELECT * FROM fiscal_period WHERE status = 'open' AND startDate <= ? AND endDate >= ?").get(date, date) as any; return r ? { ...r, status: r.status as FiscalPeriod['status'] } : null; },
  create: (data: any) => { const now = new Date().toISOString(); return db.prepare('INSERT INTO fiscal_period (name, startDate, endDate, status, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, 1)').run(data.name, data.startDate, data.endDate, data.status || 'open', now, now).lastInsertRowid as number; },
  close: (id: number, userId: string) => { const now = new Date().toISOString(); db.prepare("UPDATE fiscal_period SET status='closed', closedBy=?, closedAt=?, updatedAt=?, version=version+1 WHERE id=?").run(userId, now, now, id); },
};

export const companyRepository = {
  get: () => { const r = db.prepare('SELECT * FROM company LIMIT 1').get() as any; return r ? { ...r } : null; },
  create: (data: any) => { const now = new Date().toISOString(); return db.prepare('INSERT INTO company (name, registrationNumber, taxRegistrationNumber, address, city, country, phone, email, website, baseCurrencyCode, fiscalYearStartMonth, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').run(data.name, data.registrationNumber, data.taxRegistrationNumber, data.address, data.city, data.country, data.phone, data.email, data.website, data.baseCurrencyCode || 'USD', data.fiscalYearStartMonth || 1, now, now).lastInsertRowid; },
  update: (data: any) => { const now = new Date().toISOString(); db.prepare('UPDATE company SET name=?, registrationNumber=?, taxRegistrationNumber=?, address=?, city=?, country=?, phone=?, email=?, website=?, baseCurrencyCode=?, fiscalYearStartMonth=?, updatedAt=?, version=version+1 WHERE id=?').run(data.name, data.registrationNumber, data.taxRegistrationNumber, data.address, data.city, data.country, data.phone, data.email, data.website, data.baseCurrencyCode, data.fiscalYearStartMonth, now, data.id); },
};

export const sequenceRepository = {
  findAll: () => db.prepare('SELECT * FROM document_sequence ORDER BY documentType ASC').all(),
  getNext: (documentType: string): string => {
    const seq = db.prepare('SELECT * FROM document_sequence WHERE documentType = ?').get(documentType) as any;
    if (!seq) return 'ERROR_NO_SEQUENCE';
    const padded = seq.prefix + String(seq.nextNumber).padStart(seq.padding, '0');
    db.prepare('UPDATE document_sequence SET nextNumber = nextNumber + 1, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), seq.id);
    return padded;
  },
  update: (id: number, data: any, version: number) => { const now = new Date().toISOString(); return db.prepare('UPDATE document_sequence SET prefix=?, nextNumber=?, padding=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(data.prefix, data.nextNumber, data.padding, now, id, version).changes > 0; },
};
