export interface PocketTtsRuntimeEnvironment {
  crossOriginIsolated?: boolean;
  hardwareConcurrency?: number;
  hasDocument?: boolean;
  preference?: PocketTtsRuntimePreference;
  userAgent?: string;
}

export type PocketTtsRuntimePreference = 'auto' | 'main-thread' | 'worker';

const getRuntimeEnvironment = (): PocketTtsRuntimeEnvironment => ({
  crossOriginIsolated: (globalThis as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated,
  hardwareConcurrency: typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency,
  hasDocument: typeof document !== 'undefined',
  preference: getPocketTtsRuntimePreference(),
  userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
});

const normalizePreference = (value: string | null | undefined): PocketTtsRuntimePreference | null => {
  if (value === 'main-thread' || value === 'worker' || value === 'auto') return value;
  return null;
};

export const getPocketTtsRuntimePreference = (): PocketTtsRuntimePreference => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = normalizePreference(params.get('curioPocketTtsRuntime') || params.get('pocketTtsRuntime'));
    if (fromUrl) return fromUrl;
  }

  try {
    const fromStorage = normalizePreference(localStorage.getItem('curio:pocket-tts-runtime'));
    if (fromStorage && fromStorage !== 'main-thread') return fromStorage;
  } catch {
    // localStorage may be unavailable in private/embedded contexts.
  }

  return 'auto';
};

export const getPocketTtsThreadCount = (
  environment: PocketTtsRuntimeEnvironment = getRuntimeEnvironment(),
): number => {
  if (!environment.crossOriginIsolated) return 1;
  return Math.max(1, Math.min(Math.floor(environment.hardwareConcurrency || 1), 4));
};

export const shouldUsePocketMainThreadFastPath = (
  environment: PocketTtsRuntimeEnvironment = getRuntimeEnvironment(),
): boolean => {
  const preference = environment.preference ?? 'auto';
  if (preference === 'worker') return false;

  const canUseMainThread = Boolean(environment.hasDocument)
    && environment.crossOriginIsolated === true
    && getPocketTtsThreadCount(environment) > 1;

  if (preference === 'main-thread') return canUseMainThread;
  return canUseMainThread;
};
