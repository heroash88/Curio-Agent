import { useLayoutEffect } from 'react';

export const useTransparentDesktopSurface = () => {
  useLayoutEffect(() => {
    const root = document.getElementById('root');
    const previousHtmlBackground = document.documentElement.style.background;
    const previousBodyBackground = document.body.style.background;
    const previousRootBackground = root?.style.background;

    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    if (root) root.style.background = 'transparent';

    return () => {
      document.documentElement.style.background = previousHtmlBackground;
      document.body.style.background = previousBodyBackground;
      if (root && previousRootBackground !== undefined) {
        root.style.background = previousRootBackground;
      }
    };
  }, []);
};
