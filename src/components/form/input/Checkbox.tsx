import React, { useId } from "react";

interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

const Checkbox: React.FC<CheckboxProps> = ({
  checked = false,
  onChange,
  label,
  id,
  className = "",
  disabled = false,
}) => {
  const generatedId = useId();
  const uniqueId = id || generatedId;

  return (
    <label
      htmlFor={uniqueId}
      className={`flex items-center gap-2 cursor-pointer ${disabled ? "cursor-not-allowed opacity-50" : ""} ${className}`}
    >
      <div className="relative">
        <input
          type="checkbox"
          id={uniqueId}
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
          disabled={disabled}
          className="peer sr-only"
        />
        <div className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 flex items-center justify-center transition-colors peer-checked:bg-brand-500 peer-checked:border-brand-500 peer-focus:ring-2 peer-focus:ring-brand-500/20">
          {checked && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2.5 6L5 8.5L9.5 3.5"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      </div>
      {label && (
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      )}
    </label>
  );
};

export default Checkbox;
