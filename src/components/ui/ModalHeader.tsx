"use client";
import React from "react";
import { X } from "lucide-react";

interface ModalHeaderProps {
  title: React.ReactNode;
  /** Optional subtitle line rendered below the title. */
  subtitle?: React.ReactNode;
  /** Close handler; when provided a close button is rendered on the right. */
  onClose?: () => void;
  /** Optional leading icon block (e.g. the rounded Activity icon box in the audit detail modal). */
  icon?: React.ReactNode;
  /** Extra content rendered below the subtitle inside the title area (e.g. a status badge). */
  children?: React.ReactNode;
}

const ModalHeader: React.FC<ModalHeaderProps> = ({
  title,
  subtitle,
  onClose,
  icon,
  children,
}) => {
  const titleContent = (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>}
      {children}
    </div>
  );

  return (
    <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      {icon ? (
        <div className="flex items-center gap-3">{icon}{titleContent}</div>
      ) : (
        titleContent
      )}
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

export default ModalHeader;
