"use client";
import { useRouter } from "next/navigation";
import React, { useState, useEffect, useCallback } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { ChevronDownSmallIcon, UserProfileIcon, SettingsIcon, SupportIcon, SignOutIcon } from "@/icons";
import { Loader2 } from "lucide-react";

interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  permissionIds: number[];
  isActive: boolean;
  lastLoginAt: string | null;
}

export default function UserDropdown() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  function toggleDropdown(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
    } catch {
      // proceed with redirect even if request fails
    }
    setSigningOut(false);
    router.push('/signin');
    router.refresh();
  };

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ')
    : 'User';

  const initials = user
    ? ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase() || '?'
    : '?';

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="flex items-center text-gray-700 dark:text-gray-400 dropdown-toggle"
        disabled={loading}
      >
        <span className="mr-3 overflow-hidden rounded-full h-11 w-11 flex items-center justify-center bg-brand-500 text-white text-sm font-semibold">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            initials
          )}
        </span>

        <span className="block mr-1 font-medium text-theme-sm">
          {loading ? '...' : displayName}
        </span>

        <ChevronDownSmallIcon
          className={`stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
      >
        <div>
          <span className="block font-medium text-gray-700 text-theme-sm dark:text-gray-400">
            {displayName}
          </span>
          <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
            {user?.email || 'Not signed in'}
          </span>
        </div>

        <ul className="flex flex-col gap-1 pt-4 pb-3 border-b border-gray-200 dark:border-gray-800">
          <DropdownItem
            onItemClick={closeDropdown}
            tag="a"
            href="/profile"
            className="flex items-center gap-3 px-3 py-2 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
          >
            <UserProfileIcon className="fill-gray-500 group-hover:fill-gray-700 dark:fill-gray-400 dark:group-hover:fill-gray-300" />
            Edit profile
          </DropdownItem>
          <DropdownItem
            onItemClick={closeDropdown}
            tag="a"
            href="/profile"
            className="flex items-center gap-3 px-3 py-2 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
          >
            <SettingsIcon className="fill-gray-500 group-hover:fill-gray-700 dark:fill-gray-400 dark:group-hover:fill-gray-300" />
            Account settings
          </DropdownItem>
          <DropdownItem
            onItemClick={closeDropdown}
            tag="a"
            href="/profile"
            className="flex items-center gap-3 px-3 py-2 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
          >
            <SupportIcon className="fill-gray-500 group-hover:fill-gray-700 dark:fill-gray-400 dark:group-hover:fill-gray-300" />
            Support
          </DropdownItem>
        </ul>

        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex items-center gap-3 px-3 py-2 mt-3 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300 w-full text-start disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 animate-spin fill-gray-500" />
          ) : (
            <SignOutIcon className="fill-gray-500 group-hover:fill-gray-700 dark:group-hover:fill-gray-300" />
          )}
          Sign out
        </button>
      </Dropdown>
    </div>
  );
}
