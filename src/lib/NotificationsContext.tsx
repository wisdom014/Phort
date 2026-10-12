import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * App notifications.
 *
 * Starts empty and stays empty until a real event fires (media finished
 * ingesting, a project was created or deleted, an asset needs review, an export
 * finished). Each notification can be dismissed individually or cleared all at
 * once, and the list persists to localStorage so it survives a reload.
 */

export type NotificationKind = 'success' | 'info' | 'warning';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  detail?: string;
  /** ISO timestamp. */
  ts: string;
  read: boolean;
}

/** Fields the caller supplies; id/ts/read are filled in automatically. */
export interface NotificationInput {
  kind: NotificationKind;
  title: string;
  detail?: string;
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  notify: (input: NotificationInput) => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
  markAllRead: () => void;
}

const STORAGE_KEY = 'lensflow.notifications';
const MAX_NOTIFICATIONS = 50;

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

function loadInitial(): AppNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AppNotification[]) : [];
  } catch {
    return [];
  }
}

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>(loadInitial);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch {
      /* storage may be unavailable; notifications still work in-memory */
    }
  }, [notifications]);

  const notify = useCallback((input: NotificationInput) => {
    const entry: AppNotification = {
      id: (crypto?.randomUUID?.() ?? `n-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      kind: input.kind,
      title: input.title,
      detail: input.detail,
      ts: new Date().toISOString(),
      read: false
    };
    setNotifications((prev) => [entry, ...prev].slice(0, MAX_NOTIFICATIONS));
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => (prev.some((n) => !n.read) ? prev.map((n) => ({ ...n, read: true })) : prev));
  }, []);

  const value = useMemo<NotificationsContextValue>(() => ({
    notifications,
    unreadCount: notifications.reduce((n, item) => n + (item.read ? 0 : 1), 0),
    notify,
    dismiss,
    clearAll,
    markAllRead
  }), [notifications, notify, dismiss, clearAll, markAllRead]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider');
  return ctx;
}
