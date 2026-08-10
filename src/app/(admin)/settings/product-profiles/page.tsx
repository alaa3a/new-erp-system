'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Edit3, Trash2, AlertTriangle, Loader2, Package, Link2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import { useToast } from '@/components/ui/toast/ToastProvider';
import { formatDate } from '@/lib/formatters';
import SearchSelect from '@/components/form/SearchSelect';
import { buildAccountHierarchyOptions } from '@/lib/accountTree';
import type { Account, TaxCode } from '@/types/erp';

interface ProductProfile {
  id: number;
  code: string;
  name: string;
  description: string;
  salesVatCodeId: number | null;
  purchaseVatCodeId: number | null;
  salesAccountId: number | null;
  purchaseAccountId: number | null;
  inventoryAccountId: number | null;
  cogsAccountId: number | null;
  arAccountId: number | null;
  apAccountId: number | null;
  cashAccountId: number | null;
  discountAccountId: number | null;
  isActive: boolean;
  createdAt: string;
}

interface ProfileFormData {
  code: string;
  name: string;
  description: string;
  salesVatCodeId: number | null;
  purchaseVatCodeId: number | null;
  salesAccountId: number | null;
  purchaseAccountId: number | null;
  inventoryAccountId: number | null;
  cogsAccountId: number | null;
  arAccountId: number | null;
  apAccountId: number | null;
  cashAccountId: number | null;
  discountAccountId: number | null;
}

const ACCOUNT_FIELDS: Array<{ key: keyof ProfileFormData; label: string }> = [
  { key: 'salesAccountId', label: 'Sales Account' },
  { key: 'purchaseAccountId', label: 'Purchase Account' },
  { key: 'inventoryAccountId', label: 'Inventory Account' },
  { key: 'cogsAccountId', label: 'COGS Account' },
  { key: 'arAccountId', label: 'Accounts Receivable (AR)' },
  { key: 'apAccountId', label: 'Accounts Payable (AP)' },
  { key: 'cashAccountId', label: 'Cash Account' },
  { key: 'discountAccountId', label: 'Discount Account' },
];

const emptyForm = (): ProfileFormData => ({
  code: '', name: '', description: '',
  salesVatCodeId: null, purchaseVatCodeId: null,
  salesAccountId: null, purchaseAccountId: null, inventoryAccountId: null, cogsAccountId: null,
  arAccountId: null, apAccountId: null,
  cashAccountId: null, discountAccountId: null,
});

/** Renders the linked-dimension hint under an account select (entry-page pattern). */
function AccountLinkHint({ account }: { account: Account | undefined }) {
  if (!account) return null;
  const lt = account.linkType ?? (account.costCenterId ? 'cost_center' : null);
  if (account.linkType === 'partner') {
    return (
      <p className="mt-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">Requires partner — AR/AP account</p>
    );
  }
  if (!lt) return <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">No linked dimension</p>;
  if (lt === 'cost_center') {
    return (
      <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400">
        <Link2 className="w-3.5 h-3.5" /> Linked to Cost Center {account.costCenterId ? `#${account.costCenterId}` : ''}
      </p>
    );
  }
  if (lt === 'employee') {
    return (
      <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400">
        <Link2 className="w-3.5 h-3.5" /> Linked to Employees
      </p>
    );
  }
  return null;
}

export default function ProductProfilesPage() {
  const toast = useToast();
  const [profiles, setProfiles] = useState<ProductProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProductProfile | null>(null);
  const [formData, setFormData] = useState<ProfileFormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductProfile | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products/profiles');
      const data = await res.json();
      if (data.success) setProfiles(data.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const fetchRefData = useCallback(async () => {
    try {
      const [aRes, tRes] = await Promise.all([
        fetch('/api/accounts'), fetch('/api/tax-codes'),
      ]);
      const a = await aRes.json();
      const t = await tRes.json();
      if (a.success) setAccounts(a.data);
      if (t.success) setTaxCodes(t.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchProfiles(); fetchRefData(); }, [fetchRefData]);

  const accountOptions = useMemo(() => buildAccountHierarchyOptions(
    accounts,
    a => `${a.code} — ${a.name} (${a.type})${!a.isActive ? ' (inactive)' : ''}`,
  ), [accounts]);

  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    for (const a of accounts) map.set(a.code, a);
    return map;
  }, [accounts]);

  const accountIdToCode = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of accounts) map.set(a.id, a.code);
    return map;
  }, [accounts]);

  const taxTypeOptions = useMemo(() => {
    const groups = taxCodes.filter(t => t.isGroup);
    return taxCodes
      .filter(t => t.isActive && !t.isGroup)
      .map(t => ({
        id: t.id,
        label: `${t.code} — ${t.name} (${t.rate}%)`,
        groupId: t.parentId,
        groupLabel: groups.find(g => g.id === t.parentId)?.name || 'Other',
      }));
  }, [taxCodes]);

  const openAdd = () => { setEditing(null); setFormData(emptyForm()); setShowForm(true); };
  const openEdit = (p: ProductProfile) => {
    setEditing(p);
    setFormData({
      code: p.code, name: p.name, description: p.description,
      salesVatCodeId: p.salesVatCodeId, purchaseVatCodeId: p.purchaseVatCodeId,
      salesAccountId: p.salesAccountId, purchaseAccountId: p.purchaseAccountId,
      inventoryAccountId: p.inventoryAccountId, cogsAccountId: p.cogsAccountId,
      arAccountId: p.arAccountId, apAccountId: p.apAccountId,
      cashAccountId: p.cashAccountId, discountAccountId: p.discountAccountId,
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
          <p className="text-sm text-gray-500 mt-1">Profiles carry the posting accounts used when invoicing</p>
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
              </div>
              {p.description && <p className="text-sm text-gray-500 mt-2">{p.description}</p>}
              <div className="mt-4 text-xs text-gray-400 space-y-1">
                <div>Accounts: {ACCOUNT_FIELDS.filter(f => p[f.key as keyof ProductProfile]).length} / {ACCOUNT_FIELDS.length}</div>
              </div>
              <div className="mt-4 text-[11px] text-gray-500 space-y-0.5">
                {ACCOUNT_FIELDS.slice(0, 4).map(f => {
                  const code = p[f.key as keyof ProductProfile] != null ? accountIdToCode.get(p[f.key as keyof ProductProfile] as number) : null;
                  return code ? (
                    <div key={f.key as string}><span className="text-gray-400">{f.label}:</span> {code}</div>
                  ) : null;
                })}
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
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} className="max-w-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">{editing ? 'Edit Profile' : 'New Profile'}</h2>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
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

          {/* Account selectors — entry-page pattern */}
          <div className="grid grid-cols-2 gap-4">
            {ACCOUNT_FIELDS.map(f => {
              const code = formData[f.key] != null ? accountIdToCode.get(formData[f.key] as number) : undefined;
              const account = code ? accountMap.get(code) : undefined;
              return (
                <div key={f.key as string}>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{f.label}</label>
                  <SearchSelect
                    options={accountOptions}
                    value={code || ''}
                    onChange={(val) => {
                      const chosen = val ? accountMap.get(String(val)) : undefined;
                      setFormData(prev => ({ ...prev, [f.key]: chosen ? chosen.id : null } as ProfileFormData));
                    }}
                    placeholder="Select account..."
                    searchPlaceholder="Search accounts..."
                    notFoundLabel="No accounts found"
                    noneLabel="None"
                  />
                  <AccountLinkHint account={account} />
                </div>
              );
            })}
          </div>

          {/* VAT types */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Sales VAT Type</label>
              <SearchSelect
                options={taxTypeOptions}
                value={formData.salesVatCodeId}
                onChange={(val) => setFormData({ ...formData, salesVatCodeId: val ? Number(val) : null })}
                placeholder="Select tax..."
                noneLabel="None"
                searchPlaceholder="Search taxes..."
                notFoundLabel="No taxes found"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Purchase VAT Type</label>
              <SearchSelect
                options={taxTypeOptions}
                value={formData.purchaseVatCodeId}
                onChange={(val) => setFormData({ ...formData, purchaseVatCodeId: val ? Number(val) : null })}
                placeholder="Select tax..."
                noneLabel="None"
                searchPlaceholder="Search taxes..."
                notFoundLabel="No taxes found"
              />
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