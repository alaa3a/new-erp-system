"use client";
import React from "react";
import { X } from "lucide-react";

interface ClearFiltersButtonProps {
  /** Map of filter name → whether it is currently active (i.e. not on its default value).
   *  The badge shows how many are active and the button hides entirely when none are. */
  filters: Record<string, boolean>;
  /** Resets every filter back to its default value. */
  onClear: () => void;
  /** Compact variant (smaller padding/text) for dense filter bars like the entries page. */
  compact?: boolean;
  /** Extra classes appended to the button (e.g. layout helpers like "ml-auto"). */
  className?: string;
}

const ClearFiltersButton: React.FC<ClearFiltersButtonProps> = ({
  filters,
  onClear,
  compact = false,
  className = "",
}) => {
  const activeCount = Object.values(filters).filter(Boolean).length;
  if (activeCount === 0) return null;

  return (
    <button
      type="button"
      onClick={onClear}
      className={`flex items-center gap-1 rounded-lg font-medium text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors ${className} ${
        compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
      }`}
    >
      <X className="w-3.5 h-3.5" /> Clear filters
      <span
        className={`inline-flex items-center justify-center rounded-full bg-red-100 dark:bg-red-950/60 font-semibold text-red-600 dark:text-red-400 ${
          compact ? "min-w-[1.15rem] h-4 px-1 text-[10px]" : "min-w-5 h-5 px-1.5 text-[11px]"
        }`}
      >
        {activeCount}
      </span>
    </button>
  );
};

export default ClearFiltersButton;
