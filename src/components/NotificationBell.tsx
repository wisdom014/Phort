import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications, NotificationKind } from '../lib/NotificationsContext';

/** Icon + tint per notification kind, keyed to the semantic tokens. */
const KIND_META: Record<NotificationKind, { icon: string; tone: string }> = {
  success: { icon: 'check_circle', tone: 'text-positive' },
  info: { icon: 'info', tone: 'text-info' },
  warning: { icon: 'warning', tone: 'text-caution' }
};

/** Compact relative time, e.g. "just now", "4m ago", "2d ago". */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface NotificationBellProps {
  /** Sizing/border classes for the trigger button, to match its neighbours. */
  className?: string;
}

/**
 * Notification bell with an unread badge and a dropdown feed.
 *
 * The list stays empty until a real event posts a notification. Opening the
 * panel marks everything read (clearing the badge); each item can be dismissed
 * individually and the whole feed cleared at once.
 */
export const NotificationBell: React.FC<NotificationBellProps> = ({ className = '' }) => {
  const { notifications, unreadCount, dismiss, clearAll, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next && unreadCount > 0) markAllRead();
      return next;
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={toggleOpen}
        title="Notifications"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        className={`relative rounded-full text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors flex items-center justify-center ${className}`}
      >
        <span className="material-symbols-outlined text-xl">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-critical text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="z-50 bg-surface-raised border border-hairline rounded-2xl shadow-panel overflow-hidden fixed inset-x-3 top-16 md:absolute md:inset-x-auto md:right-0 md:left-auto md:top-full md:mt-2 md:w-80"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
              <span className="text-sm font-semibold text-ink">Notifications</span>
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-[11px] font-medium text-ink-faint hover:text-critical transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <span className="material-symbols-outlined text-3xl text-ink-faint">notifications_off</span>
                <p className="text-sm text-ink-muted">You're all caught up</p>
              </div>
            ) : (
              <div className="max-h-[60vh] md:max-h-96 overflow-y-auto divide-y divide-[color:var(--hairline)]">
                {notifications.map((n) => {
                  const meta = KIND_META[n.kind];
                  return (
                    <div
                      key={n.id}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-surface-hover transition-colors"
                    >
                      <span className={`material-symbols-outlined text-lg shrink-0 mt-0.5 ${meta.tone}`}>
                        {meta.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink font-medium leading-snug">{n.title}</p>
                        {n.detail && <p className="text-xs text-ink-muted mt-0.5 break-words">{n.detail}</p>}
                        <p className="text-[10px] font-mono-data text-ink-faint mt-1">{relativeTime(n.ts)}</p>
                      </div>
                      <button
                        onClick={() => dismiss(n.id)}
                        className="shrink-0 p-1 rounded-lg text-ink-faint hover:text-critical hover:bg-critical/10 transition-colors"
                        aria-label="Dismiss notification"
                      >
                        <span className="material-symbols-outlined text-base">close</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
