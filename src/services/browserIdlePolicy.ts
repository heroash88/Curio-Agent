export type SessionMicRestoreMode = 'defer' | 'reuse_existing' | 'reacquire';

interface SessionMicRestoreInput {
  isConnected?: boolean;
  isConnecting?: boolean;
  hasExistingLiveTracks?: boolean;
}

export const getSessionMicRestoreMode = ({
  isConnected = false,
  isConnecting = false,
  hasExistingLiveTracks = false,
}: SessionMicRestoreInput): SessionMicRestoreMode => {
  if (!isConnected && !isConnecting) {
    return 'defer';
  }

  if (hasExistingLiveTracks) {
    return 'reuse_existing';
  }

  return 'reacquire';
};
