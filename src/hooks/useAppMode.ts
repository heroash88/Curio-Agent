import { useState, useCallback } from 'react';

export enum AppMode {
  HOME = 0,
  CURIO_MODE = 1,
}

export const useAppMode = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.HOME);

  const goHome = useCallback(() => {
    setMode(AppMode.HOME);
  }, []);

  const setAppMode = useCallback((newMode: AppMode) => {
    setMode(newMode);
  }, []);

  const getThemeForMode = useCallback(() => {
    return 'glass';
  }, []);

  return {
    mode,
    goHome,
    setMode: setAppMode,
    getThemeForMode,
  };
};
