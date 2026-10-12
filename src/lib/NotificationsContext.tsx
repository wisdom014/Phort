import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { isSupabaseConfigured, supabase } from './supabaseClient';

/**
 * App notifications.
 *
 * Starts empty and stays empty until a real event fires (media finished
 * ingesting, a project was created or deleted, an asset needs review, an export
 * finished). Each notification can be dismissed individually or cleared all at
 * once, and the list persists to the signed-in account so it survives a
 * reload and is visible on other devices. Local storage is only a fallback
 * when Supabase is not configured or the notifications table is unavailable.
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

function loadLocal(userId?: string): AppNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(userId ? `${STORAGE_KEY}.${userId}` : STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AppNotification[]) : [];
  } catch {
    return [];
  }
}

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [remoteAvailable, setRemoteAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const userId = user?.id;

    setNotifications(loadLocal(userId));
    setRemoteAvailable(false);
    if (!isSupabaseConfigured || !userId) return () => { cancelled = true; };

    (async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, kind, title, detail, created_at, read')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(MAX_NOTIFICATIONS);
      if (cancelled) return;
      if (!error && data) {
        setNotifications(data.map((row) => ({
          id: row.id,
          kind: row.kind,
          title: row.title,
          detail: row.detail ?? undefined,
          ts: row.created_at,
          read: Boolean(row.read)
        })));
        setRemoteAvailable(true);
      }
    })();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        const row = payload.new as any;
        if (payload.eventType === 'INSERT') {
          setNotifications((prev) => prev.some((item) => item.id === row.id) ? prev : [{
            id: row.id, kind: row.kind, title: row.title, detail: row.detail ?? undefined,
            ts: row.created_at, read: Boolean(row.read)
          }, ...prev].slice(0, MAX_NOTIFICATIONS));
        } else if (payload.eventType === 'UPDATE') {
          setNotifications((prev) => prev.map((item) => item.id === row.id ? {
            ...item, read: Boolean(row.read), title: row.title, detail: row.detail ?? undefined
          } : item));
        } else if (payload.eventType === 'DELETE') {
          setNotifications((prev) => prev.filter((item) => item.id !== (payload.old as any).id));
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (remoteAvailable) return;
    try {
      const key = user?.id ? `${STORAGE_KEY}.${user.id}` : STORAGE_KEY;
      window.localStorage.setItem(key, JSON.stringify(notifications));
    } catch {
      // Storage may be unavailable; notifications still work in memory.
    }
  }, [notifications, remoteAvailable, user?.id]);

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
    if (remoteAvailable && user) {
      void supabase.from('notifications').insert({
        id: entry.id, user_id: user.id, kind: entry.kind, title: entry.title,
        detail: entry.detail ?? null, read: false
      });
    }
  }, [remoteAvailable, user]);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (remoteAvailable) void supabase.from('notifications').delete().eq('id', id);
  }, [remoteAvailable]);

  const clearAll = useCallback(() => {
    setNotifications([]);
    if (remoteAvailable && user) void supabase.from('notifications').delete().eq('user_id', user.id);
  }, [remoteAvailable, user]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => (prev.some((n) => !n.read) ? prev.map((n) => ({ ...n, read: true })) : prev));
    if (remoteAvailable && user) void supabase.from('notifications').update({ read: true }).eq('user_id', user.id);
  }, [remoteAvailable, user]);

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
