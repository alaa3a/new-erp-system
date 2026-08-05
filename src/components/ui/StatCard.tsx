"use client";
import React from "react";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Text color appended to the size-based value classes (e.g. "text-brand-500"). */
  color?: string;
  /** "md" = text-lg font-semibold (list pages), "lg" = text-xl font-bold (report pages). */
  size?: "md" | "lg";
  /** Optional sub-line rendered below the value (e.g. "of {total}"). */
  subtext?: React.ReactNode;
  /** Fully overrides the value classes (used for special-case color logic). The "mt-1" prefix is always applied. */
  valueClass?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  color = "text-gray-900 dark:text-white",
  size = "md",
  subtext,
  valueClass,
}) => {
  const resolved =
    valueClass ??
    `${size === "lg" ? "text-xl font-bold" : "text-lg font-semibold"} ${color}`;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 ${resolved}`}>{value}</p>
      {subtext !== undefined && subtext !== null && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
          {subtext}
        </p>
      )}
    </div>
  );
};

export default StatCard;
