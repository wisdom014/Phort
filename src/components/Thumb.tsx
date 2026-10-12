import React, { useState } from 'react';
import { MediaKind } from '../types';

/**
 * Media thumbnail with a graceful fallback.
 *
 * Renders an <img> when a source is available and loads, and swaps to a themed
 * icon tile if the source is missing or errors. This is what keeps videos
 * (whose posters may not have decoded) and any expired remote URLs from showing
 * the browser's broken-image glyph.
 *
 * It's a drop-in for a plain <img>: the same `className` is applied to whichever
 * element renders, so object-fit / positioning classes carry over unchanged.
 */
interface ThumbProps {
  src?: string;
  alt: string;
  kind?: MediaKind;
  className?: string;
}

export const Thumb: React.FC<ThumbProps> = ({ src, alt, kind = 'image', className = '' }) => {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={className}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${className} flex items-center justify-center bg-surface-sunken text-ink-faint`}
      role="img"
      aria-label={alt}
    >
      <span className="material-symbols-outlined text-3xl">
        {kind === 'video' ? 'movie' : 'image'}
      </span>
    </div>
  );
};
