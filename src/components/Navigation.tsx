import React, { useState } from 'react';
import { NavigationTab, BucketCategory } from '../types';
import { X, LogOut } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from '../lib/ThemeContext';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { Avatar } from './Avatar';
import { NotificationBell } from './NotificationBell';

interface NavigationProps {
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  currentBucketCategory: BucketCategory;
  onBucketCategoryChange: (category: BucketCategory) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenUpload: () => void;
  onOpenNewProject: () => void;
}

/** Small brand mark — inline so it never depends on a remote image loading. */
const BrandMark: React.FC = () => (
  <span className="w-8 h-8 rounded-xl bg-accent text-white flex items-center justify-center shadow-card shrink-0">
    <span className="material-symbols-outlined text-[20px]">center_focus_strong</span>
  </span>
);

const NAV_ITEMS: { tab: NavigationTab; icon: string; label: string }[] = [
  { tab: 'workspace', icon: 'space_dashboard', label: 'Workspace' },
  { tab: 'library', icon: 'photo_library', label: 'Library' },
  { tab: 'ingestion', icon: 'psychology', label: 'Ingestion' }
];

const BUCKET_ITEMS: { category: BucketCategory; icon: string; label: string }[] = [
  { category: 'humans', icon: 'face', label: 'People' },
  { category: 'nonhuman', icon: 'category', label: 'Objects & scenes' },
  { category: 'videos', icon: 'movie', label: 'Videos' }
];

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onTabChange,
  currentBucketCategory,
  onBucketCategoryChange,
  searchQuery,
  onSearchChange,
  onOpenUpload,
  onOpenNewProject
}) => {
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const { user, signOut } = useAuth();
  const { resolved, toggle } = useTheme();
  const displayName = user?.user_metadata?.full_name || user?.email || 'Pro Photographer';
  const avatarUrl = user?.user_metadata?.avatar_url ?? undefined;
  const nextTheme = resolved === 'dark' ? 'light' : 'dark';

  const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => (
    <button
      onClick={toggle}
      title={`Switch to ${nextTheme} mode`}
      aria-label={`Switch to ${nextTheme} mode`}
      className={`rounded-full text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors flex items-center justify-center ${className}`}
    >
      <span className="material-symbols-outlined text-xl">
        {resolved === 'dark' ? 'light_mode' : 'dark_mode'}
      </span>
    </button>
  );

  return (
    <>
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-[240px] lg:w-[260px] bg-surface-sunken z-50 flex-col border-r border-hairline shadow-panel select-none">
        {/* Brand */}
        <div
          onClick={() => onTabChange('workspace')}
          className="p-5 lg:p-6 flex items-center gap-3 cursor-pointer"
        >
          <BrandMark />
          <span className="text-lg lg:text-xl font-bold tracking-tight text-ink">Phort</span>
        </div>

        {/* Primary navigation */}
        <nav className="flex-1 px-3 space-y-1 mt-1 overflow-y-auto hide-scrollbar">
          {NAV_ITEMS.map(({ tab, icon, label }) => {
            const active = currentTab === tab;
            return (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className={`w-full flex items-center px-3.5 py-2.5 rounded-xl transition-colors text-left ${
                  active
                    ? 'bg-accent-tint text-accent border-l-4 border-accent font-semibold'
                    : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
                }`}
              >
                <span className="material-symbols-outlined mr-3 text-xl">{icon}</span>
                <span className="text-sm font-medium">{label}</span>
              </button>
            );
          })}

          {/* Smart buckets */}
          <div className="pt-5 pb-2 px-3.5">
            <span className="text-xs font-medium text-ink-faint">Smart buckets</span>
          </div>

          <div className="space-y-1">
            {BUCKET_ITEMS.map(({ category, icon, label }) => {
              const active = currentTab === 'buckets' && currentBucketCategory === category;
              return (
                <button
                  key={category}
                  onClick={() => {
                    onBucketCategoryChange(category);
                    onTabChange('buckets');
                  }}
                  className={`w-full flex items-center px-3.5 py-2 rounded-xl transition-colors text-left text-sm ${
                    active
                      ? 'bg-accent-tint text-accent border-l-2 border-accent font-semibold'
                      : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
                  }`}
                >
                  <span className="material-symbols-outlined mr-2.5 text-base opacity-80">{icon}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Upload + settings */}
        <div className="p-3 lg:p-4 border-t border-hairline space-y-2">
          <button
            onClick={onOpenUpload}
            className="w-full py-2.5 px-3 rounded-xl bg-accent-tint border border-accent/30 text-accent hover:bg-accent/20 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
            Upload media
          </button>

          <button
            onClick={() => onTabChange('settings')}
            className={`w-full flex items-center px-3.5 py-2 rounded-xl transition-colors ${
              currentTab === 'settings'
                ? 'bg-accent-tint text-accent'
                : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
            }`}
          >
            <span className="material-symbols-outlined mr-3 text-lg">settings</span>
            <span className="text-sm font-medium">Settings</span>
          </button>
        </div>
      </aside>

      {/* DESKTOP TOP HEADER */}
      <header className="hidden md:flex fixed top-0 left-[240px] lg:left-[260px] right-0 h-16 lg:h-20 bg-surface/85 backdrop-blur-2xl border-b border-hairline z-40 items-center justify-between px-5 lg:px-8">
        {/* Search */}
        <div className="relative flex items-center bg-surface-raised rounded-full px-4 py-2 w-full max-w-xs md:max-w-sm lg:max-w-md border border-hairline focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/50 transition-all">
          <span className="material-symbols-outlined text-ink-faint text-base shrink-0">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search your catalog…"
            className="bg-transparent border-none focus:outline-none text-sm text-ink ml-2.5 w-full placeholder:text-ink-faint min-w-0"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="text-ink-faint hover:text-ink p-0.5 ml-1"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-3 lg:gap-4 shrink-0">
          <button
            onClick={onOpenNewProject}
            className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-raised border border-hairline hover:bg-surface-hover text-sm text-ink transition-colors"
          >
            <span className="material-symbols-outlined text-sm text-accent">add</span>
            New shoot
          </button>

          <NotificationBell className="p-2" />

          <ThemeToggle className="p-2" />

          <div className="h-6 w-px bg-hairline" />

          {/* Profile */}
          <div className="flex items-center gap-2">
            <div
              onClick={() => onTabChange('settings')}
              className="flex items-center gap-2.5 cursor-pointer group"
            >
              <div className="text-right hidden lg:block max-w-[140px]">
                <div className="text-[13px] font-medium text-ink group-hover:text-accent transition-colors truncate">
                  {displayName}
                </div>
                <div className="text-[11px] text-ink-faint">
                  {isSupabaseConfigured && user ? 'Signed in' : 'Local session'}
                </div>
              </div>
              <Avatar
                name={displayName}
                src={avatarUrl}
                className="w-9 h-9 text-xs ring-1 ring-hairline group-hover:ring-accent transition-all"
              />
            </div>
            {isSupabaseConfigured && user && (
              <button
                onClick={signOut}
                title="Sign out"
                aria-label="Sign out"
                className="p-2 rounded-full text-ink-faint hover:text-ink hover:bg-surface-hover transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MOBILE TOP HEADER */}
      <header className="md:hidden fixed top-0 inset-x-0 z-50 bg-surface/92 backdrop-blur-xl border-b border-hairline">
        <div className="h-14 px-4 flex items-center justify-between">
          <div
            onClick={() => onTabChange('workspace')}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <BrandMark />
            <span className="text-base font-bold text-ink tracking-tight">Phort</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowMobileSearch(!showMobileSearch)}
              className="w-9 h-9 rounded-full bg-surface-raised border border-hairline flex items-center justify-center text-ink-muted hover:text-ink"
              aria-label="Toggle search"
            >
              <span className="material-symbols-outlined text-[18px]">search</span>
            </button>

            <NotificationBell className="w-9 h-9 bg-surface-raised border border-hairline" />

            <ThemeToggle className="w-9 h-9 bg-surface-raised border border-hairline" />

            <button
              onClick={onOpenUpload}
              className="w-9 h-9 rounded-full bg-accent-tint border border-accent/40 flex items-center justify-center text-accent"
              aria-label="Upload media"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
            </button>

            <button onClick={() => onTabChange('settings')} className="p-1" aria-label="Settings">
              <Avatar name={displayName} src={avatarUrl} className="w-8 h-8 text-[11px] ring-1 ring-hairline" />
            </button>
          </div>
        </div>

        {/* Mobile search expansion */}
        {showMobileSearch && (
          <div className="px-4 pb-3 pt-1">
            <div className="flex items-center bg-surface-raised rounded-full px-3 py-1.5 border border-accent/40">
              <span className="material-symbols-outlined text-ink-faint text-sm">search</span>
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search your catalog…"
                className="bg-transparent border-none focus:outline-none text-sm text-ink ml-2 w-full placeholder:text-ink-faint min-w-0"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="text-ink-faint hover:text-ink"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-surface-raised/95 backdrop-blur-xl border-t border-hairline pb-safe">
        <div className="flex justify-around items-center h-14 px-2">
          {[
            { tab: 'workspace' as NavigationTab, icon: 'grid_view', label: 'Workspace' },
            { tab: 'library' as NavigationTab, icon: 'photo_library', label: 'Library' },
            { tab: 'ingestion' as NavigationTab, icon: 'cloud_upload', label: 'Ingestion' },
            { tab: 'buckets' as NavigationTab, icon: 'database', label: 'Buckets' }
          ].map(({ tab, icon, label }) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors ${
                currentTab === tab ? 'text-accent font-semibold' : 'text-ink-muted'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{icon}</span>
              <span className="text-[10px]">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
};
