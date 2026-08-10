'use client';

import { createContext, useContext } from 'react';

interface RuntimeConfig {
  authEnabled: boolean;
  desktop: boolean;
}

const RuntimeConfigContext = createContext<RuntimeConfig>({
  authEnabled: false,
  desktop: false,
});

export function RuntimeConfigProvider({
  children,
  authEnabled,
  desktop,
}: {
  children: React.ReactNode;
  authEnabled: boolean;
  desktop: boolean;
}) {
  return (
    <RuntimeConfigContext.Provider value={{ authEnabled, desktop }}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}

export function useRuntimeConfig() {
  return useContext(RuntimeConfigContext);
}
