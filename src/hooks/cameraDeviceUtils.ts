export type CameraFacingMode = 'user' | 'environment';

type DeviceKindLike = {
  kind?: string;
};

export const hasMultipleVideoInputDevices = (devices: DeviceKindLike[]): boolean =>
  devices.filter((device) => device.kind === 'videoinput').length >= 2;

export const getNextCameraFacingMode = (current: CameraFacingMode): CameraFacingMode =>
  current === 'user' ? 'environment' : 'user';
