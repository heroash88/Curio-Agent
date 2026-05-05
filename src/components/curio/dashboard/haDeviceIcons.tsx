import React from 'react';
import {
  Activity,
  DoorOpen,
  Droplets,
  Fan,
  Flame,
  Gauge,
  Home,
  LampDesk,
  Lightbulb,
  MousePointerClick,
  Plug,
  PlugZap,
  SunMedium,
  Thermometer,
  ToggleLeft,
  Zap,
  type LucideProps,
} from 'lucide-react';

import type { DashboardHaDeviceIcon } from '../../../services/haDeviceDisplay';

interface HaDeviceIconProps {
  icon: DashboardHaDeviceIcon;
  className?: string;
  size?: number;
}

const ICONS: Record<DashboardHaDeviceIcon, React.ComponentType<LucideProps>> = {
  auto: Gauge,
  lightbulb: Lightbulb,
  lamp: LampDesk,
  thermometer: Thermometer,
  droplets: Droplets,
  power: PlugZap,
  motion: Activity,
  sun: SunMedium,
  door: DoorOpen,
  gauge: Gauge,
  home: Home,
  fan: Fan,
  flame: Flame,
  switch: ToggleLeft,
  outlet: Plug,
  button: MousePointerClick,
};

export const HaDeviceIcon: React.FC<HaDeviceIconProps> = ({
  icon,
  className,
  size = 16,
}) => {
  const Icon = ICONS[icon] || Zap;
  return <Icon aria-hidden className={className} size={size} strokeWidth={2.2} />;
};
