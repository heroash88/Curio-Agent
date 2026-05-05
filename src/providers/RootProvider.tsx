import React from 'react';
import { LiveAPIProvider } from '../contexts/LiveAPIContext';

interface RootProviderProps {
  children: React.ReactNode;
}

export const RootProvider: React.FC<RootProviderProps> = ({ children }) => (
  <LiveAPIProvider>
    {children}
  </LiveAPIProvider>
);