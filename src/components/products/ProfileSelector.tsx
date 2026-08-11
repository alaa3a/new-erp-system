'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Profile {
  id: number;
  code: string;
  name: string;
  description: string;
  isActive?: number;
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

interface ProfileSelectorProps {
  value: number | null;
  onChange: (profileId: number | null, preset: any) => void;
  className?: string;
}

export function ProfileSelector({ value, onChange, className = '' }: ProfileSelectorProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [extraProfile, setExtraProfile] = useState<Profile | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetch('/api/products/profiles')
      .then(res => res.json())
      .then(data => {
        if (data.success) setProfiles(data.data);
      })
      .catch(() => {});
  }, []);

  // The active-only list hides soft-deleted profiles, but a product can still
  // reference one. Surface it so the linked profile stays visible (and show a
  // hint that it is inactive) instead of looking like the product is unlinked.
  useEffect(() => {
    if (value == null) {
      setExtraProfile(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/products/profiles/${value}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.success) setExtraProfile(data.data);
      })
      .catch(() => {});
    return () => { cancelled = true };
  }, [value]);

  const list = useMemo(() => {
    if (!extraProfile || profiles.some(p => p.id === extraProfile.id)) return profiles;
    return [...profiles, extraProfile];
  }, [profiles, extraProfile]);

  const selected = list.find(p => p.id === value);
  const selectedInactive = selected?.isActive === 0;

  const handleSelect = async (profileId: number | null) => {
    if (!profileId) {
      onChange(null, null);
    } else {
      const res = await fetch(`/api/products/profiles/${profileId}`);
      const data = await res.json();
      if (data.success) {
        const p = data.data;
        onChange(profileId, {
          code: p.code,
          name: p.name,
          description: p.description ?? '',
          isActive: p.isActive,
          salesVatCodeId: p.salesVatCodeId,
          purchaseVatCodeId: p.purchaseVatCodeId,
          salesAccountId: p.salesAccountId,
          purchaseAccountId: p.purchaseAccountId,
          inventoryAccountId: p.inventoryAccountId,
          cogsAccountId: p.cogsAccountId,
          arAccountId: p.arAccountId,
          apAccountId: p.apAccountId,
          cashAccountId: p.cashAccountId,
          discountAccountId: p.discountAccountId,
        });
      }
    }
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
      >
        <span className={selected ? 'text-gray-900 dark:text-white truncate' : 'text-gray-400 dark:text-gray-500'}>
          {selected ? `${selected.code} - ${selected.name}${selectedInactive ? ' (inactive)' : ''}` : 'Select a profile...'}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>

      {selected?.description && (
        <p className="mt-1 text-xs text-gray-500">{selected.description}</p>
      )}

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg dark:bg-gray-900 dark:border-gray-700 max-h-60 overflow-y-auto custom-scrollbar rounded-b-lg">
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500"
          >
            No profile (manual setup)
          </button>
          {list.map(profile => (
            <button
              key={profile.id}
              type="button"
              onClick={() => handleSelect(profile.id)}
              className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
                value === profile.id ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300' : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              <div className="font-medium flex items-center gap-2">
                {profile.code} - {profile.name}
                {profile.isActive === 0 && (
                  <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">inactive</span>
                )}
              </div>
              {profile.description && (
                <div className="text-xs text-gray-500">{profile.description}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
