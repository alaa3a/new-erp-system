"use client";
import Link from "next/link";
import React, { useState, useEffect, useCallback } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { BellIcon, CloseIcon } from "@/icons";

interface Notification {
  id: number;
  userId: number;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  entityType: string | null;
  entityId: number | null;
  isRead: boolean;
  createdAt: string;
}

const typeStyles: Record<string, string> = {
  info: 'bg-blue-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  success: 'bg-green-500',
};

const typeIcons: Record<string, string> = {
  info: 'i',
  warning: '!',
  error: '✕',
  success: '✓',
};

const formatRelativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);

  // Fetch current user to get their userId
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user?.id) {
          setUserId(data.user.id);
        }
      })
      .catch(() => {});
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchNotifications();

    // Poll every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications, userId]);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      fetchNotifications();
    }
  };

  const closeDropdown = () => {
    setIsOpen(false);
  };

  const handleMarkRead = async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'PUT' });
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // silently fail
    }
  };

  const handleMarkAllRead = async () => {
    if (!userId) return;
    try {
      await fetch('/api/notifications/read-all', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      setNotifications(prev =>
        prev.map(n => ({ ...n, isRead: true }))
      );
      setUnreadCount(0);
    } catch {
      // silently fail
    }
  };

  const hasUnread = notifications.some(n => !n.isRead);

  return (
    <div className="relative">
      <button
        className="relative dropdown-toggle flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={toggleDropdown}
      >
        {unreadCount > 0 && (
          <span className="absolute right-0 top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-orange-400 text-[9px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        <BellIcon />
      </button>
      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute -right-[240px] mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px] lg:right-0"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Notifications
            </h5>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 px-1.5 text-[11px] font-bold text-white bg-orange-400 rounded-full min-w-[20px]">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasUnread && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-medium text-brand-500 hover:text-brand-600 transition-colors"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={toggleDropdown}
              className="text-gray-500 transition dropdown-toggle dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        <ul className="flex flex-col h-auto overflow-y-auto custom-scrollbar">
          {loading && notifications.length === 0 ? (
            <li className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin" />
            </li>
          ) : notifications.length === 0 ? (
            <li className="flex flex-col items-center justify-center py-10 text-center">
              <BellIcon className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-400 dark:text-gray-500">No notifications yet</p>
            </li>
          ) : (
            notifications.map((n) => (
              <DropdownItem
                key={n.id}
                onItemClick={() => {
                  if (!n.isRead) handleMarkRead(n.id);
                  closeDropdown();
                }}
                className={`flex gap-3 rounded-lg border-b border-gray-100 p-3 px-4.5 py-3 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/5 cursor-pointer ${
                  !n.isRead ? 'bg-brand-50/30 dark:bg-brand-950/10' : ''
                }`}
              >
                <span className="relative block w-8 h-8 rounded-full z-1 shrink-0 mt-0.5">
                  <span className={`flex items-center justify-center w-full h-full rounded-full text-white text-xs font-bold ${typeStyles[n.type] || typeStyles.info}`}>
                    {typeIcons[n.type] || 'i'}
                  </span>
                  {!n.isRead && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-orange-400 border-[1.5px] border-white dark:border-gray-900"></span>
                  )}
                </span>
                <span className="block flex-1 min-w-0">
                  <span className="mb-1 space-x-1 block text-theme-sm text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-800 dark:text-white/90">
                      {n.title}
                    </span>
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-1">
                    {n.message}
                  </span>
                  <span className="flex items-center gap-2 text-gray-400 text-theme-xs dark:text-gray-500">
                    <span>{formatRelativeTime(n.createdAt)}</span>
                    {n.entityType && (
                      <>
                        <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                        <span className="capitalize">{n.entityType}</span>
                      </>
                    )}
                  </span>
                </span>
                {!n.isRead && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkRead(n.id);
                    }}
                    className="shrink-0 self-start mt-1 p-1 rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Mark as read"
                  >
                    <CloseIcon className="w-3 h-3" />
                  </button>
                )}
              </DropdownItem>
            ))
          )}
        </ul>
        <Link
          href="/audit"
          className="block px-4 py-2 mt-3 text-sm font-medium text-center text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          View Audit Log
        </Link>
      </Dropdown>
    </div>
  );
}
