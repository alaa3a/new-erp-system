import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from '../test-helper';
import { entryCategoryRepository } from '../../repositories/entryCategoryRepository';
import { entryRepository } from '../../repositories/entryRepository';
import { db } from '../../db';

describe('entryCategoryRepository', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('should create a category and map isActive to boolean', () => {
    const id = entryCategoryRepository.create({
      code: 'SALES', name: 'Sales Revenue', description: 'Sales', isActive: true,
    });
    const category = entryCategoryRepository.findById(id)!;
    expect(category.isActive).toBe(true);
    expect(category.code).toBe('SALES');
    expect(category.name).toBe('Sales Revenue');
  });

  it('should ensure the per-category entry sequence on create', () => {
    const id = entryCategoryRepository.create({ code: 'ADJ', name: 'Adjustments', description: '', isActive: true });
    const seq = db.prepare('SELECT * FROM document_sequence WHERE documentType = ?').get(`entry_cat_${id}`) as any;
    expect(seq).toBeDefined();
    expect(seq.prefix).toBe('JE-ADJ-');
    expect(seq.padding).toBe(6);
  });

  it('should update a category on edit', () => {
    const id = entryCategoryRepository.create({
      code: 'SWITCH', name: 'Switchable', description: '', isActive: true,
    });
    const before = entryCategoryRepository.findById(id)!;
    const ok = entryCategoryRepository.update(id, {
      code: before.code, name: before.name, description: 'Renamed', isActive: true,
    }, before.version);
    expect(ok).toBe(true);
    expect(entryCategoryRepository.findById(id)!.description).toBe('Renamed');
  });

  it('should report zero usage for an unused category', () => {
    const id = entryCategoryRepository.create({
      code: 'UNUSED', name: 'Unused', description: '', isActive: true,
    });
    expect(entryCategoryRepository.entryCount(id)).toBe(0);
  });

  it('should count entries referencing a category', () => {
    const id = entryCategoryRepository.create({
      code: 'USED', name: 'Used Category', description: '', isActive: true,
    });
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO entry (entryNumber, status, entryDate, description, categoryId, totalDebit, totalCredit, currencyCode, createdBy, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, 100, 100, ?, ?, ?, ?, 1)'
    ).run('E-CAT-1', 'draft', '2026-01-01', 'cat test', id, 'USD', 't', now, now);
    db.prepare(
      'INSERT INTO entry (entryNumber, status, entryDate, description, categoryId, totalDebit, totalCredit, currencyCode, createdBy, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, 50, 50, ?, ?, ?, ?, 1)'
    ).run('E-CAT-2', 'draft', '2026-01-02', 'cat test 2', id, 'USD', 't', now, now);

    expect(entryCategoryRepository.entryCount(id)).toBe(2);

    const map = entryCategoryRepository.entryCountMap();
    expect(map[id]).toBe(2);
  });

  it('should map isActive to boolean for findAll', () => {
    entryCategoryRepository.create({ code: 'A-1', name: 'Alpha', description: '', isActive: true });
    const all = entryCategoryRepository.findAll();
    expect(all.length).toBeGreaterThanOrEqual(1);
    all.forEach(c => {
      expect(typeof c.isActive).toBe('boolean');
    });
  });

  it('should keep categoryId linked on entries created via entryRepository', () => {
    const catId = entryCategoryRepository.create({
      code: 'REPO-LINK', name: 'Repo Link', description: '', isActive: true,
    });
    const entryId = entryRepository.create({
      entryDate: '2026-01-01', description: 'linked', categoryId: catId, createdBy: 'test',
    });
    const entry = entryRepository.findById(entryId)!;
    expect(entry.categoryId).toBe(catId);
  });

  it('should refuse to soft-delete a category that is in use', () => {
    const id = entryCategoryRepository.create({
      code: 'GUARDED', name: 'Guarded', description: '', isActive: true,
    });
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO entry (entryNumber, status, entryDate, description, categoryId, totalDebit, totalCredit, currencyCode, createdBy, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, 10, 10, ?, ?, ?, ?, 1)'
    ).run('E-GUARD', 'draft', '2026-01-01', 'guard', id, 'USD', 't', now, now);

    const current = entryCategoryRepository.findById(id)!;
    expect(entryCategoryRepository.softDelete(id, current.version)).toBe('in_use');
    // Still active after refusal
    expect(entryCategoryRepository.findById(id)!.isActive).toBe(true);

    // Free the category, then delete succeeds
    db.prepare('DELETE FROM entry WHERE entryNumber = ?').run('E-GUARD');
    const fresh = entryCategoryRepository.findById(id)!;
    expect(entryCategoryRepository.softDelete(id, fresh.version)).toBe('deleted');
  });

  it('should report conflict on soft-delete when version is stale', () => {
    const id = entryCategoryRepository.create({
      code: 'VERSIONED', name: 'Versioned', description: '', isActive: true,
    });
    expect(entryCategoryRepository.softDelete(id, 999)).toBe('conflict');
  });
});
