"use client";
import React from "react";

interface EmptyStateProps {
  /** Icon element (Loader2 for loading, AlertTriangle for error, a large icon for empty states, etc.). */
  icon?: React.ReactNode;
  /** Primary message line. */
  title: React.ReactNode;
  /** Optional secondary message line. */
  description?: React.ReactNode;
  /** Optional action element (e.g. a "Try again" or "Add first" button). */
  action?: React.ReactNode;
  /** Extra classes for the wrapper. */
  className?: string;
  /** Table-cell variant (py-10 text-center, no flex column) used inside <td> empty rows. */
  compact?: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = "",
  compact = false,
}) => {
  return (
    <div
      className={
        compact
          ? `py-10 text-center ${className}`
          : `flex flex-col items-center justify-center py-16 ${className}`
      }
    >
      {icon}
      <p className={`text-sm text-gray-500 dark:text-gray-400 ${!compact ? "mb-1" : ""}`}>
        {title}
      </p>
      {description && (
        <p className="text-sm text-gray-400 dark:text-gray-500">{description}</p>
      )}
      {action}
    </div>
  );
};

export default EmptyState;
