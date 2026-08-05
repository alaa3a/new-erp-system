"use client";
import React from "react";

interface StatusBadgeProps {
  label: React.ReactNode;
  /** Resolved style classes (e.g. from a statusStyles map like `bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400`). */
  color?: string;
  /** "sm" = px-2 py-0.5 (cards/detail views), "md" = px-2 py-1 (tables). */
  size?: "sm" | "md";
  /** Extra classes appended after the color (e.g. shrink-0). */
  className?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  color = "",
  size = "md",
  className = "",
}) => {
  return (
    <span
      className={`inline-flex text-xs font-medium rounded-full ${
        size === "sm" ? "px-2 py-0.5" : "px-2 py-1"
      } ${color} ${className}`.trim()}
    >
      {label}
    </span>
  );
};

export default StatusBadge;
