import { db } from '../db';

export const companyRepository = {
  get: () => { const r = db.prepare('SELECT * FROM company LIMIT 1').get() as any; return r ? { ...r } : null; },
  create: (data: any) => { const now = new Date().toISOString(); return db.prepare('INSERT INTO company (name, registrationNumber, taxRegistrationNumber, address, city, country, phone, email, website, baseCurrencyCode, fiscalYearStartMonth, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').run(data.name, data.registrationNumber, data.taxRegistrationNumber, data.address, data.city, data.country, data.phone, data.email, data.website, data.baseCurrencyCode || 'USD', data.fiscalYearStartMonth || 1, now, now).lastInsertRowid; },
  update: (data: any) => { const now = new Date().toISOString(); db.prepare('UPDATE company SET name=?, registrationNumber=?, taxRegistrationNumber=?, address=?, city=?, country=?, phone=?, email=?, website=?, baseCurrencyCode=?, fiscalYearStartMonth=?, updatedAt=?, version=version+1 WHERE id=?').run(data.name, data.registrationNumber, data.taxRegistrationNumber, data.address, data.city, data.country, data.phone, data.email, data.website, data.baseCurrencyCode, data.fiscalYearStartMonth, now, data.id); },
};
