import type { NotificationPriority } from './proactiveTypes';

export interface NotificationPriorityDetails {
  label: string;
  description: string;
  soundDescription: string;
}

export const NOTIFICATION_PRIORITY_ORDER: NotificationPriority[] = ['low', 'normal', 'high'];

export const NOTIFICATION_PRIORITY_DETAILS: Record<NotificationPriority, NotificationPriorityDetails> = {
  low: {
    label: 'Low',
    description: 'Quiet update',
    soundDescription: 'Single soft chime',
  },
  normal: {
    label: 'Medium',
    description: 'Standard alert',
    soundDescription: 'Warm double chime',
  },
  high: {
    label: 'High',
    description: 'Urgent alert',
    soundDescription: 'Clear triple chime',
  },
};

export const getNotificationPriorityDetails = (
  priority: NotificationPriority = 'normal',
): NotificationPriorityDetails =>
  NOTIFICATION_PRIORITY_DETAILS[priority] || NOTIFICATION_PRIORITY_DETAILS.normal;
