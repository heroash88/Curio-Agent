import React from 'react';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type {
  DashboardRobotFaceStyle,
  DashboardWidget,
  DashboardWidgetConfig,
} from '../../../services/dashboardTypes';
import { DashboardWidgetActionSlotContext } from './WidgetShell';
import type { DashboardRobotBubble } from './dashboardRobotBubbles';
import { WidgetBody } from './widgetPrimitives';

interface RobotFaceWidgetProps {
  faceSlot?:
    | React.ReactNode
    | ((faceStyle?: DashboardRobotFaceStyle) => React.ReactNode);
  widget: DashboardWidget;
  config?: DashboardWidgetConfig;
  robotBubble?: DashboardRobotBubble | null;
  noGlow?: boolean;
}

const BENDER_WIDGET_CANVAS_WIDTH = 760;
const BENDER_WIDGET_CANVAS_HEIGHT = 560;
const BENDER_WIDGET_MIN_SCALE = 0.18;

export const RobotFaceWidget: React.FC<RobotFaceWidgetProps> = ({ faceSlot, widget, config, robotBubble, noGlow }) => {
  const size = useWidgetSize(widget);
  const actionSlot = React.useContext(DashboardWidgetActionSlotContext);
  const cfg = config ?? widget.config;
  const accent = cfg.robotAccentColor || '#38bdf8';
  const selectedFaceStyle = cfg.robotFaceStyle;
  const fit = cfg.robotFit || 'float';
  const showGlow = cfg.robotShowGlow !== false;
  const isBender = selectedFaceStyle === 'bender';
  const tiny = size.w <= 1 || size.pixelWidth < 150 || size.pixelHeight < 150;
  const resolvedFaceSlot =
    typeof faceSlot === 'function' ? faceSlot(selectedFaceStyle) : faceSlot;
  const benderPadding = fit === 'cover' ? 8 : fit === 'contain' ? 34 : 20;
  const benderMaxScale = fit === 'cover' ? 1.16 : fit === 'contain' ? 0.98 : 1.06;
  const benderScale = isBender
    ? Math.max(
        BENDER_WIDGET_MIN_SCALE,
        Math.min(
          benderMaxScale,
          (Math.max(1, size.pixelWidth) - benderPadding) / BENDER_WIDGET_CANVAS_WIDTH,
          (Math.max(1, size.pixelHeight) - benderPadding) / BENDER_WIDGET_CANVAS_HEIGHT,
        ),
      )
    : 1;
  const benderFrameStyle = isBender
    ? ({
        width: `${BENDER_WIDGET_CANVAS_WIDTH}px`,
        height: `${BENDER_WIDGET_CANVAS_HEIGHT}px`,
        transform: `scale(${benderScale})`,
        transformOrigin: 'center',
        flex: '0 0 auto',
      } as React.CSSProperties)
    : undefined;
  const scale =
    isBender
      ? ''
      : fit === 'cover'
      ? 'scale-[1.12]'
      : fit === 'contain'
        ? 'scale-[0.86]'
        : tiny
          ? 'scale-[0.92]'
          : 'scale-100';
  const shouldShowGlow = showGlow && !isBender && !noGlow;

  return (
    <WidgetBody
      gap="none"
      align="center"
      data-robot-face-style={selectedFaceStyle || 'curio'}
      className={`group/robot-face relative items-center justify-center rounded-[inherit] ${
        isBender ? 'overflow-hidden bg-transparent' : '!overflow-visible'
      }`}
      style={{
        '--robot-accent': accent,
        '--robot-eye-arc': accent,
      } as React.CSSProperties}
    >
      {shouldShowGlow && (
        <div
          className="dashboard-robot-glow pointer-events-none absolute inset-x-[12%] bottom-[5%] top-[18%] rounded-[999px] blur-3xl"
          style={{
            background: `radial-gradient(ellipse at center, ${accent} 0%, transparent 68%)`,
            opacity: tiny ? 0.2 : 0.3,
          }}
        />
      )}
      {actionSlot && (
        <div className="dashboard-robot-action-slot pointer-events-none absolute right-3 top-3 z-30 opacity-0 transition-opacity duration-200 group-hover/robot-face:pointer-events-auto group-hover/robot-face:opacity-100 group-focus-within/robot-face:pointer-events-auto group-focus-within/robot-face:opacity-100">
          {actionSlot}
        </div>
      )}
      {robotBubble && (
        <div
          data-testid="dashboard-robot-bubble"
          data-dashboard-robot-bubble-kind={robotBubble.kind}
          className="pointer-events-none absolute left-3 right-12 top-3 z-40 rounded-[1.1rem] border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] px-3 py-2 text-[11px] font-semibold leading-4 text-[var(--ether-on-surface)] shadow-[0_14px_34px_rgba(0,0,0,0.22)] backdrop-blur-[var(--ether-glass-blur)]"
        >
          {robotBubble.text}
        </div>
      )}
      <div
        className={`relative flex items-center justify-center transition-transform duration-300 ease-out ${
          isBender
            ? 'dashboard-bender-face-frame overflow-visible'
            : `h-full w-full overflow-visible ${scale} group-hover/robot-face:-translate-y-1`
        }`}
        style={benderFrameStyle}
      >
        {resolvedFaceSlot}
      </div>
    </WidgetBody>
  );
};
