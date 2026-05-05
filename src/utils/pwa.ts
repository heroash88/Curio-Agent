export const isIOSDevice = (): boolean => {
    if (typeof navigator === 'undefined') {
        return false;
    }

    const userAgent = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const touchCapableMac = platform === 'MacIntel' && navigator.maxTouchPoints > 1;

    return /iPad|iPhone|iPod/.test(userAgent) || touchCapableMac;
};

export const isStandalonePwa = (): boolean => {
    if (typeof window === 'undefined') {
        return false;
    }

    const mediaStandalone = typeof window.matchMedia === 'function'
        && window.matchMedia('(display-mode: standalone)').matches;
    const legacyIOSStandalone = 'standalone' in window.navigator && window.navigator.standalone === true;

    return mediaStandalone || legacyIOSStandalone;
};

export const isIOSStandalonePwa = (): boolean => isIOSDevice() && isStandalonePwa();
