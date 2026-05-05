export type ElectronMediaAccessKind = 'camera' | 'microphone';

export async function requestElectronMediaAccess(kind: ElectronMediaAccessKind): Promise<boolean> {
  const bridge = typeof window !== 'undefined' ? window.curioDesktop : undefined;
  if (!bridge?.requestMediaAccess) return true;

  try {
    return await bridge.requestMediaAccess(kind);
  } catch (error) {
    console.warn(`[ElectronMediaAccess] Failed to request ${kind} access:`, error);
    return false;
  }
}
