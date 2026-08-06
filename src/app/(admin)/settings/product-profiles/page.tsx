'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit3, Trash2, AlertTriangle, Loader2, Package } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import { useToast } from '@/components/ui/toast/ToastProvider';
import { formatDate } from '@/lib/formatters';

interface ProductProfile {
  id: number;
  code: string;
  name: string;
  description: string;
  itemType: string;
  unitOfMeasure: string;
  salesVatCodeId: number | null;
  purchaseVatCodeId: number | null;
  defaultWarehouseId: number | null;
  defaultSalesPrice: number;
  defaultPurchasePrice: number;
  reorderPoint: number;
  isActive: boolean;
  createdAt: string;
}

interface ProfileFormData {
  code: string;
  name: string;
  description: string;
  itemType: 'stock' | 'service';
  unitOfMeasure: string;
  salesVatCodeId: number | null;
  purchaseVatCodeId: number | null;
  defaultWarehouseId: number | null;
  defaultSalesPrice: number;
  defaultPurchasePrice: number;
  reorderPoint: number;
}

const emptyForm = (): ProfileFormData => ({
  code: '', name: '', description: '', itemType: 'stock', unitOfMeasure: 'pcs',
  salesVatCodeId: null, purchaseVatCodeId: null, defaultWarehouseId: null,
  defaultSalesPrice: 0, defaultPurchasePrice: 0, reorderPoint: 0,
});

export default function ProductProfilesPage() {
  const toast = useToast();
  const [profiles, setProfiles] = useState<ProductProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProductProfile | null>(null);
  const [formData, setFormData] = useState<ProfileFormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductProfile | null>(null);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products/profiles');
      const data = await res.json();
      if (data.success) setProfiles(data.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchProfiles(); }, []);

  const openAdd = () => { setEditing(null); setFormData(emptyForm()); setShowForm(true); };
  const openEdit = (p: ProductProfile) => {
    setEditing(p);
    setFormData({
      code: p.code, name: p.name, description: p.description, itemType: p.itemType as 'stock' | 'service',
      unitOfMeasure: p.unitOfMeasure, salesVatCodeId: p.salesVatCodeId, purchaseVatCodeId: p.purchaseVatCodeId,
      defaultWarehouseId: p.defaultWarehouseId, defaultSalesPrice: p.defaultSalesPrice,
      defaultPurchasePrice: p.defaultPurchasePrice, reorderPoint: p.reorderPoint,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      toast.error('Code and name are required');
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/products/profiles/${editing.id}` : '/api/products/profiles';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
      toast.success(editing ? 'Profile updated' : 'Profile created');
      setShowForm(false);
      fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/products/profiles/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Profile deleted');
      setDeleteTarget(null);
      fetchProfiles();
    } catch {
      toast.error('Failed to delete profile');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Product Profiles</h1>
          <p className="text-sm text-gray-500 mt-1">Create templates to speed up product creation</p>
        </div>
        <Button onClick={openAdd} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Profile
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>No profiles yet. Create your first profile to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map(p => (
            <div key={p.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-mono text-gray-400">{p.code}</span>
                  <h3 className="font-semibold text-gray-900 dark:text-white mt-1">{p.name}</h3>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${p.itemType === 'stock' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                  {p.itemType}
                </span>
              </div>
              {p.description && <p className="text-sm text-gray-500 mt-2">{p.description}</p>}
              <div className="mt-4 text-xs text-gray-400 space-y-1">
                <div>Unit: {p.unitOfMeasure}</div>
                {p.defaultWarehouseId && <div>Warehouse: #{p.defaultWarehouseId}</div>}
                {p.reorderPoint > 0 && <div>Reorder at: {p.reorderPoint}</div>}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-brand-500"><Edit3 className="w-4 h-4" /></button>
                <button onClick={() => setDeleteTarget(p)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} className="max-w-lg p-6">
        <h2 className="text-lg font-semibold mb-4">{editing ? 'Edit Profile' : 'New Profile'}</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Code *</label>
              <input value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white" placeholder="STD" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white" placeholder="Standard Product" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Item Type</label>
              <select value={formData.itemType} onChange={e => setFormData({ ...formData, itemType: e.target.value as any })}
                className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                <option value="stock">Stock</option>
                <option value="service">Service</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Unit</label>
              <input value={formData.unitOfMeasure} onChange={e => setFormData({ ...formData, unitOfMeasure: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white" placeholder="pcs" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Reorder Point</label>
              <input type="number" value={formData.reorderPoint} onChange={e => setFormData({ ...formData, reorderPoint: Number(e.target.value) })}
                className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Update' : 'Create'}
          </Button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} className="max-w-sm p-6">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Delete Profile?</h3>
          <p className="text-sm text-gray-500 mb-6">This action cannot be undone.</p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
