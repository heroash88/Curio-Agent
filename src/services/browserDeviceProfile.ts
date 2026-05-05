export interface BrowserDeviceProfile {
  cores: number;
  memoryGb: number | null;
  touchPoints: number;
  userAgent: string;
  isChromiumLike: boolean;
  isMobileClass: boolean;
  isChromiumMobileClass: boolean;
  isLowEnd: boolean;
  isConstrained: boolean;
}

type NavigatorLike = Partial<Pick<Navigator, 'hardwareConcurrency' | 'maxTouchPoints' | 'userAgent'>> & {
  deviceMemory?: number;
};

const CHROMIUM_LIKE_RE = /(Chrome|Chromium|CriOS|EdgA|EdgiOS|Silk|HeadlessChrome)/i;
const MOBILE_CLASS_RE = /(Android|Mobile|Silk|Kindle|KF[A-Z]{2,}|CrOS)/i;

export function createBrowserDeviceProfile(
  navigatorLike?: NavigatorLike | null,
): BrowserDeviceProfile {
  const source = navigatorLike ?? (typeof navigator !== 'undefined' ? (navigator as NavigatorLike) : null);
  const cores = Number(source?.hardwareConcurrency ?? 0) || 0;
  const rawMemory = Number(source?.deviceMemory ?? Number.NaN);
  const memoryGb = Number.isFinite(rawMemory) && rawMemory > 0 ? rawMemory : null;
  const touchPoints = Number(source?.maxTouchPoints ?? 0) || 0;
  const userAgent = String(source?.userAgent ?? '');
  const isChromiumLike = CHROMIUM_LIKE_RE.test(userAgent);
  const isMobileClass = MOBILE_CLASS_RE.test(userAgent);
  const isChromiumMobileClass = isChromiumLike && isMobileClass;
  const isLowEnd = (cores > 0 && cores <= 2) || (memoryGb !== null && memoryGb <= 2);
  const isConstrained =
    isLowEnd ||
    (isChromiumMobileClass && ((cores > 0 && cores <= 6) || (memoryGb !== null && memoryGb <= 6))) ||
    (!isChromiumMobileClass && ((cores > 0 && cores <= 4) || (memoryGb !== null && memoryGb <= 4))) ||
    (touchPoints > 0 && isChromiumLike && ((cores > 0 && cores <= 4) || (memoryGb !== null && memoryGb <= 4)));

  return {
    cores,
    memoryGb,
    touchPoints,
    userAgent,
    isChromiumLike,
    isMobileClass,
    isChromiumMobileClass,
    isLowEnd,
    isConstrained,
  };
}

export const getBrowserDeviceProfile = (): BrowserDeviceProfile => createBrowserDeviceProfile();

export const isAutoLowPowerBrowserDevice = (profile: Pick<
  BrowserDeviceProfile,
  'cores' | 'memoryGb' | 'isLowEnd' | 'isChromiumMobileClass'
>): boolean =>
  profile.isLowEnd ||
  (profile.isChromiumMobileClass &&
    ((profile.cores > 0 && profile.cores <= 4) || (profile.memoryGb !== null && profile.memoryGb <= 4)));
