"use client";
import Link from "next/link";
import React from "react";

interface DropdownItemProps {
  children: React.ReactNode;
  className?: string;
  tag?: "button" | "a" | "div";
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  onItemClick?: () => void;
  type?: "button" | "submit" | "reset";
}

export const DropdownItem: React.FC<DropdownItemProps> = ({
  children,
  className = "",
  tag = "button",
  href,
  onClick,
  onItemClick,
  type = "button",
}) => {
  const handleClick = (e: React.MouseEvent) => {
    if (tag === "button") {
      e.preventDefault();
    }
    onClick?.(e);
    onItemClick?.();
  };

  if (tag === "a" && href) {
    return (
      <li>
        <Link href={href} className={className} onClick={handleClick}>
          {children}
        </Link>
      </li>
    );
  }

  if (tag === "div") {
    return <li><div className={className}>{children}</div></li>;
  }

  return (
    <li>
      <button type={type} className={className} onClick={handleClick}>
        {children}
      </button>
    </li>
  );
};
