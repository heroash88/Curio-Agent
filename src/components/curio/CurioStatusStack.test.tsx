import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurioStatusStack } from './CurioStatusStack';
import type { CurioState } from '../../services/emotionDetection';

vi.mock('framer-motion', () => {
  const MotionDiv = ({
    animate,
    exit,
    initial,
    transition,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    animate?: unknown;
    exit?: unknown;
    initial?: unknown;
    transition?: unknown;
  }) => <div {...props} />;

  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: {
      div: MotionDiv,
    },
  };
});

const baseProps = {
  idlePromptPosition: 'bottom',
  isMiniPlayerActive: false,
  connectButtonPosition: 'center',
  homeFaceDetected: false,
  faceIdentityFeedback: null,
  showDashboard: true,
  isConnected: false,
  isConnecting: false,
  offlineActive: false,
  haVoiceActive: false,
  showTranscript: false,
  showIdlePrompt: false,
  idlePromptScale: 100,
  curioState: 'idle' as CurioState,
  statusMessage: 'Idle',
  statusPillClass: 'status-pill',
  renderStatusWithWakeWord: (text: string) => text,
};

describe('CurioStatusStack face status', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('does not show a persistent looking-for-face badge', () => {
    render(<CurioStatusStack {...baseProps} />);

    expect(screen.queryByText('Looking for face')).toBeNull();
    expect(screen.queryByText('Face detected')).toBeNull();
  });

  it('shows face detected for five seconds after a detection event', () => {
    const { rerender } = render(<CurioStatusStack {...baseProps} />);

    rerender(<CurioStatusStack {...baseProps} homeFaceDetected />);

    expect(screen.getByText('Face detected')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(screen.getByText('Face detected')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Face detected')).toBeNull();
  });

  it('shows recognized-person feedback instead of the generic detection badge', () => {
    const { rerender } = render(<CurioStatusStack {...baseProps} />);

    rerender(
      <CurioStatusStack
        {...baseProps}
        homeFaceDetected
        faceIdentityFeedback={{
          id: 1,
          message: 'Hi Alex',
          tone: 'recognized',
        }}
      />,
    );

    expect(screen.queryByText('Face detected')).toBeNull();
    expect(screen.getByText('Hi Alex')).toBeInTheDocument();
  });
});
