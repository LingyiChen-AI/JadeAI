'use client';

import { useEffect, useState } from 'react';

import type { DeclarativeTemplateManifest } from '@/types/template';

export interface LocalTemplateThumbnailProps {
  thumbnail: Blob;
  manifest: DeclarativeTemplateManifest;
  alt: string;
}

export function LocalTemplateThumbnail({ thumbnail, manifest, alt }: LocalTemplateThumbnailProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(thumbnail);
    // Blob URL creation is an external resource synchronization required by this component.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setObjectUrl(url);
    setFailed(false);
    return () => URL.revokeObjectURL(url);
  }, [thumbnail]);

  const fallback = failed || !objectUrl;
  return (
    <div
      data-testid="local-template-thumbnail"
      className="aspect-[3/4] w-full overflow-hidden bg-zinc-100"
    >
      {fallback ? (
        <div
          data-testid="local-template-thumbnail-fallback"
          role="img"
          aria-label={alt}
          className="h-full w-full"
          style={{
            backgroundImage: `linear-gradient(135deg, ${manifest.colors.background} 0%, ${manifest.colors.background} 62%, ${manifest.colors.accent} 62%, ${manifest.colors.accent} 100%)`,
          }}
        />
      ) : (
        // Blob URLs are local resources and cannot use the Next.js image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={objectUrl}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
