"use client";

import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";

export function ResilientImage({
  cacheKey,
  fallback = null,
  onError,
  src,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  cacheKey?: string;
  fallback?: ReactNode;
  src?: string | null;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [cachedImage, setCachedImage] = useState<{ dataUrl: string; sourceUrl: string } | null>(null);

  useEffect(() => {
    if (!cacheKey) {
      setCachedImage(null);
      return;
    }
    try {
      const raw = window.localStorage.getItem(`spos:image-cache:${cacheKey}`);
      setCachedImage(raw ? JSON.parse(raw) as { dataUrl: string; sourceUrl: string } : null);
    } catch {
      setCachedImage(null);
    }
  }, [cacheKey]);

  useEffect(() => {
    if (!cacheKey || !src || cachedImage?.sourceUrl === src) return;
    let active = true;
    const cacheImage = async () => {
      try {
        const response = await fetch(src, { cache: "force-cache" });
        if (!response.ok) return;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/") || blob.size > 750_000) return;
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        if (!active) return;
        const record = { dataUrl, sourceUrl: src };
        window.localStorage.setItem(`spos:image-cache:${cacheKey}`, JSON.stringify(record));
        setCachedImage(record);
      } catch {
        // Network URL remains the fallback when local image caching is unavailable.
      }
    };
    void cacheImage();
    return () => { active = false; };
  }, [cacheKey, cachedImage?.sourceUrl, src]);

  const resolvedSrc = src
    ? cachedImage?.sourceUrl === src ? cachedImage.dataUrl : src
    : cachedImage?.dataUrl;

  useEffect(() => {
    setFailedSrc(null);
  }, [resolvedSrc]);

  if (!resolvedSrc || failedSrc === resolvedSrc) {
    return <>{fallback}</>;
  }

  return (
    <img
      {...props}
      src={resolvedSrc}
      onError={(event) => {
        setFailedSrc(resolvedSrc);
        onError?.(event);
      }}
    />
  );
}
