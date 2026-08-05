import { db } from '../db';

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
