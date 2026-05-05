import React from 'react';
// Image loading optimization utilities

export const getFactImage = (keyword: string, localImage?: string): string => {
  // Try local image first
  if (localImage) {
    return localImage;
  }

  // Fallback to external service with deterministic hash for consistency
  const hash = Math.abs(keyword.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0));

  return `https://loremflickr.com/800/500/${keyword.split(',')[0]}?lock=${hash}`;
};

export const preloadImage = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = src;
  });
};

export const createImageWithFallback = (
  primarySrc: string,
  fallbackSrc: string,
  alt: string,
  className?: string
) => {
  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    if (target.src !== fallbackSrc) {
      target.src = fallbackSrc;
    }
  };

  return {
    src: primarySrc,
    alt,
    className,
    onError: handleError,
    loading: 'lazy' as const
  };
};
