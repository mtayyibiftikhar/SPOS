"use client";

import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";

export function ResilientImage({
  fallback = null,
  onError,
  src,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  fallback?: ReactNode;
  src?: string | null;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    setFailedSrc(null);
  }, [src]);

  if (!src || failedSrc === src) {
    return <>{fallback}</>;
  }

  return (
    <img
      {...props}
      src={src}
      onError={(event) => {
        setFailedSrc(src);
        onError?.(event);
      }}
    />
  );
}
