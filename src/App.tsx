import React, { useEffect } from 'react';
import { RootProvider } from './providers/RootProvider';
import AppContent from './components/AppContent';
import DesktopCardOverlayApp from './components/desktop/DesktopCardOverlayApp';
import DesktopFaceApp from './components/desktop/DesktopFaceApp';
import { getDesktopRole } from './desktop/desktopRole';
import { setupAutoResumeOnInteraction } from './services/audioContext';
import { useThemeMode, useRobotColorTheme } from './utils/settingsStorage';
import { useWakeLock } from './hooks/useWakeLock';

/** Syncs themeMode + robot color theme to document.documentElement so CSS variables are available globally */
const ThemeSync: React.FC = () => {
  const themeMode = useThemeMode();
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  // Sync robot color theme to CSS variables (--robot-accent, --robot-eye-arc, --robot-eye-rim-outer).
  // Without this, the variables are unset on first launch and AstroFace eyes render dark.
  useRobotColorTheme();

  return null;
};

const HostApp: React.FC = () => {
  // Keep the screen awake -- this is a kiosk/always-on display app
  useWakeLock();

  useEffect(() => {
    // Crucial for iOS Safari: Attach global interaction listeners to unlock Web Audio API
    setupAutoResumeOnInteraction();
  }, []);

  // Pause all CSS animations when the tab is hidden to save CPU
  useEffect(() => {
    const handleVisibility = () => {
      document.documentElement.classList.toggle('page-hidden', document.hidden);
    };
    // Set initial state
    handleVisibility();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return (
    <RootProvider>
      <ThemeSync />
      <AppContent />
    </RootProvider>
  );
};

const App: React.FC = () => {
  const desktopRole = getDesktopRole();

  if (desktopRole === 'face') {
    return (
      <>
        <ThemeSync />
        <DesktopFaceApp />
      </>
    );
  }

  if (desktopRole === 'cards') {
    return (
      <>
        <ThemeSync />
        <DesktopCardOverlayApp />
      </>
    );
  }

  return <HostApp />;
};

export default App;
