'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Profile {
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
}

interface ProfileSelectorProps {
  value: number | null;
  onChange: (profileId: number | null, preset: any) => void;
  className?: string;
}

export function ProfileSelector({ value, onChange, className = '' }: ProfileSelectorProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetch('/api/products/profiles')
      .then(res => res.json())
      .then(data => {
        if (data.success) setProfiles(data.data);
      })
      .catch(() => {});
  }, []);

  const selected = profiles.find(p => p.id === value);

  const handleSelect = async (profileId: number | null) => {
    if (!profileId) {
      onChange(null, null);
    } else {
      const res = await fetch(`/api/products/profiles/${profileId}`);
      const data = await res.json();
      if (data.success) {
        const p = data.data;
        onChange(profileId, {
          itemType: p.itemType,
          unitOfMeasure: p.unitOfMeasure,
          salesVatCodeId: p.salesVatCodeId,
          purchaseVatCodeId: p.purchaseVatCodeId,
          defaultWarehouseId: p.defaultWarehouseId,
          defaultSalesPrice: p.defaultSalesPrice,
          defaultPurchasePrice: p.defaultPurchasePrice,
          reorderPoint: p.reorderPoint,
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
        className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-white border border-gray-300 rounded-lg shadow-sm hover:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:bg-gray-900 dark:border-gray-700"
      >
        <span className={selected ? 'text-gray-900 dark:text-white' : 'text-gray-400'}>
          {selected ? `${selected.code} - ${selected.name}` : 'Select a profile...'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {selected?.description && (
        <p className="mt-1 text-xs text-gray-500">{selected.description}</p>
      )}

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg dark:bg-gray-900 dark:border-gray-700 max-h-60 overflow-y-auto">
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500"
          >
            No profile (manual setup)
          </button>
          {profiles.map(profile => (
            <button
              key={profile.id}
              type="button"
              onClick={() => handleSelect(profile.id)}
              className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
                value === profile.id ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300' : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              <div className="font-medium">{profile.code} - {profile.name}</div>
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
