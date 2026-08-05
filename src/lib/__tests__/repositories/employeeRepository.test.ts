import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from '../test-helper';
import { employeeRepository } from '../../repositories/employeeRepository';

describe('employeeRepository', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('should auto-generate a unique code on create', () => {
    const id = employeeRepository.create({ name: 'John Doe', department: 'Finance' });
    expect(id).toBeGreaterThan(0);
    const emp = employeeRepository.findById(id)!;
    expect(emp.code).toMatch(/^EM-/);
    expect(emp.name).toBe('John Doe');
    expect(emp.isActive).toBe(true);
  });

  it('should accept an explicit unique code', () => {
    const id = employeeRepository.create({ code: 'EMP-X1', name: 'Jane', isActive: true });
    expect(employeeRepository.findById(id)!.code).toBe('EMP-X1');
  });

  it('should find only active employees by default and include inactive with includeInactive', () => {
    const active = employeeRepository.create({ name: 'Active Emp', isActive: true });
    const inactive = employeeRepository.create({ name: 'Inactive Emp', isActive: false });
    const all = employeeRepository.findAll();
    expect(all.some(e => e.id === active)).toBe(true);
    expect(all.some(e => e.id === inactive)).toBe(false);
    const withInactive = employeeRepository.findAll(undefined, true);
    expect(withInactive.some(e => e.id === inactive)).toBe(true);
  });

  it('should search by name / department', () => {
    const id = employeeRepository.create({ name: 'Searchable Person', department: 'IT Support', isActive: true });
    expect(employeeRepository.findAll('searchable').some(e => e.id === id)).toBe(true);
    expect(employeeRepository.findAll('IT Support').some(e => e.id === id)).toBe(true);
    expect(employeeRepository.findAll('zzz-none').length).toBe(0);
  });

  it('should update fields with optimistic locking', () => {
    const id = employeeRepository.create({ name: 'Before Update', isActive: true });
    const emp = employeeRepository.findById(id)!;
    const ok = employeeRepository.update(id, { name: 'After Update', jobTitle: 'Controller' }, emp.version);
    expect(ok).toBe(true);
    expect(employeeRepository.findById(id)!.name).toBe('After Update');
    expect(employeeRepository.findById(id)!.jobTitle).toBe('Controller');
    // stale version fails
    const stale = employeeRepository.update(id, { name: 'Stale' }, emp.version);
    expect(stale).toBe(false);
  });

  it('should soft-delete (deactivate) with optimistic locking', () => {
    const id = employeeRepository.create({ name: 'To Remove', isActive: true });
    const emp = employeeRepository.findById(id)!;
    expect(employeeRepository.softDelete(id, emp.version)).toBe(true);
    expect(employeeRepository.findById(id)!.isActive).toBe(false);
    expect(employeeRepository.findAll().some(e => e.id === id)).toBe(false);
  });
});
