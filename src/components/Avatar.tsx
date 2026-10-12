import React, { useState } from 'react';

/**
 * Round profile image with a graceful fallback.
 *
 * The seed data shipped with expiring Google CDN avatar URLs that 404 in most
 * sessions, leaving a broken-image icon. Rather than depend on any remote image
 * loading, this renders the person's initials on the accent colour whenever the
 * source is missing or fails to load — so there is always something legible.
 *
 * Sizing and ring styles come from `className` (e.g. "w-9 h-9 ring-1
 * ring-hairline"); the font size for the initials is taken from the same
 * className so callers control it in one place.
 */

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AvatarProps {
  name: string;
  src?: string | null;
  /** Sizing, ring, and text-size utilities. */
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ name, src, className = '' }) => {
  const [failed, setFailed] = useState(false);
  const showImage = !!src && !failed;

  return (
    <div
      className={`rounded-full overflow-hidden flex items-center justify-center bg-accent text-accent-ink font-semibold leading-none select-none shrink-0 ${className}`}
      role="img"
      aria-label={name}
      title={name}
    >
      {showImage ? (
        <img
          src={src as string}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{initialsFor(name)}</span>
      )}
    </div>
  );
};
