import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Timer, Image, Trash2, Upload } from 'lucide-react';
import { signInWithGoogle, googleSignOut } from '../../../services/googleOAuth';
import { getPickerPhotoUrls, setPickerPhotoUrls } from '../../../utils/settingsStorage';
import type { ScreensaverSource } from '../../../utils/settingsStorage';
import { isIOSDevice, isIOSStandalonePwa } from '../../../utils/pwa';
import SettingsSection from '../SettingsSection';
import SettingsToggle from '../SettingsToggle';
import { PENDING_GOOGLE_PICKER_SESSION_KEY } from './settingsTypes';

interface ScreensaverSectionProps {
    open: boolean;
    screensaverEnabled: boolean;
    setScreensaverEnabled: (v: boolean) => void;
    screensaverTimeout: number;
    setScreensaverTimeout: (v: number) => void;
    screensaverSource: ScreensaverSource;
    setScreensaverSource: (v: ScreensaverSource) => void;
    googleAccessToken: string;
    setGoogleAccessToken: (v: string) => void;
    setGoogleSelectedAlbumId: (v: string) => void;
}

const ScreensaverSection: React.FC<ScreensaverSectionProps> = ({
    open,
    screensaverEnabled, setScreensaverEnabled,
    screensaverTimeout, setScreensaverTimeout,
    screensaverSource, setScreensaverSource,
    googleAccessToken, setGoogleAccessToken,
    setGoogleSelectedAlbumId,
}) => {
    const iosDevice = useMemo(() => isIOSDevice(), []);
    const iosStandalonePwa = useMemo(() => isIOSStandalonePwa(), []);
    const [pickerStatus, setPickerStatus] = useState<'idle' | 'opening' | 'waiting' | 'done' | 'error'>('idle');
    const [pickerPhotoCount, setPickerPhotoCount] = useState(0);
    const [pickerErrorMsg, setPickerErrorMsg] = useState('');
    const [offlineImageCount, setOfflineImageCount] = useState(0);
    const [offlineUploading, setOfflineUploading] = useState(false);
    const offlineFileInputRef = useRef<HTMLInputElement>(null);
    // Debounced slider state
    const [draftTimeout, setDraftTimeout] = useState(screensaverTimeout);
    const sliderRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const commitSlider = useCallback((value: number) => {
        if (sliderRef.current) clearTimeout(sliderRef.current);
        sliderRef.current = setTimeout(() => setScreensaverTimeout(value), 300);
    }, [setScreensaverTimeout]);

    // Init counts when modal opens
    useEffect(() => {
        if (!open) return;
        setPickerPhotoCount(getPickerPhotoUrls().length);
        // Restore "waiting" status if there's a pending picker session
        if (localStorage.getItem(PENDING_GOOGLE_PICKER_SESSION_KEY)) {
            setPickerStatus('waiting');
        }
        void import('../../../services/offlineImageStore').then(({ getOfflineImageCount }) =>
            getOfflineImageCount().then(setOfflineImageCount)
        ).catch(() => setOfflineImageCount(0));
    }, [open]);

    const finalizeGooglePickerSelection = useCallback(async (sessionId: string) => {
        const { listPickerMediaItems } = await import('../../../services/googlePhotosPickerAPI');
        const items = await listPickerMediaItems(googleAccessToken, sessionId);
        const urls = items.map((item) => item.mediaFile.baseUrl);
        localStorage.removeItem(PENDING_GOOGLE_PICKER_SESSION_KEY);
        setGoogleSelectedAlbumId('picker');
        setPickerPhotoCount(urls.length);
        setPickerPhotoUrls(urls, sessionId);
        setPickerStatus('done');
    }, [googleAccessToken, setGoogleSelectedAlbumId]);

    const recoverPendingGooglePickerSelection = useCallback(async () => {
        if (!googleAccessToken) return false;
        const sessionId = localStorage.getItem(PENDING_GOOGLE_PICKER_SESSION_KEY) || '';
        if (!sessionId) return false;
        try {
            const { getPickerSession } = await import('../../../services/googlePhotosPickerAPI');
            const session = await getPickerSession(googleAccessToken, sessionId);
            if (!session.mediaItemsSet) return false;
            await finalizeGooglePickerSelection(sessionId);
            return true;
        } catch (error) {
            console.warn('[Picker] Failed to recover pending session:', error);
            // Don't clear the pending key on transient errors -- let retries continue
            const msg = String((error as any)?.message || '');
            if (msg.includes('401') || msg.includes('403') || msg.includes('404')) {
                localStorage.removeItem(PENDING_GOOGLE_PICKER_SESSION_KEY);
                setPickerStatus('idle');
            }
            return false;
        }
    }, [finalizeGooglePickerSelection, googleAccessToken]);

    // Recover pending picker session on visibility change
    useEffect(() => {
        if (!open || !googleAccessToken) return;
        let retryTimer: number | undefined;
        let retryCount = 0;
        const MAX_RETRIES = 30;
        const RETRY_INTERVAL = 3000;

        const attemptRecovery = () => {
            void recoverPendingGooglePickerSelection().then((recovered) => {
                if (recovered) {
                    retryCount = MAX_RETRIES; // stop retrying
                    return;
                }
                if (localStorage.getItem(PENDING_GOOGLE_PICKER_SESSION_KEY) && retryCount < MAX_RETRIES) {
                    retryCount++;
                    window.clearTimeout(retryTimer);
                    retryTimer = window.setTimeout(attemptRecovery, RETRY_INTERVAL);
                }
            });
        };

        const handleReturnToApp = () => {
            if (document.hidden) return;
            retryCount = 0; // reset retries on each return
            attemptRecovery();
        };

        // Try immediately when modal opens (handles case where user
        // returned from picker while modal was closed, then re-opened it)
        attemptRecovery();

        document.addEventListener('visibilitychange', handleReturnToApp);
        window.addEventListener('focus', handleReturnToApp);
        window.addEventListener('pageshow', handleReturnToApp);
        return () => { window.clearTimeout(retryTimer); document.removeEventListener('visibilitychange', handleReturnToApp); window.removeEventListener('focus', handleReturnToApp); window.removeEventListener('pageshow', handleReturnToApp); };
    }, [googleAccessToken, open, recoverPendingGooglePickerSelection]);

    const handleGooglePhotosSignIn = useCallback(async () => {
        try {
            const result = await signInWithGoogle(['https://www.googleapis.com/auth/photospicker.mediaitems.readonly']);
            setGoogleAccessToken(result.accessToken);
        } catch (error) { console.error('[Google Photos] Sign-in failed:', error); }
    }, [setGoogleAccessToken]);

    const handleGooglePickerLaunch = useCallback(() => {
        const pickerWindow = window.open('about:blank', '_blank', iosStandalonePwa ? undefined : 'width=1000,height=700');
        if (!pickerWindow) { setPickerStatus('error'); return; }
        pickerWindow.document.write(`<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: #f8fafc; color: #64748b;"><div style="font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #1e293b;">Opening Google Photos...</div><div style="font-size: 14px;">Preparing your selection session. Just a moment!</div></div>`);
        void (async () => {
            try {
                setPickerStatus('opening');
                const { createPickerSession, pollPickerSession } = await import('../../../services/googlePhotosPickerAPI');
                const session = await createPickerSession(googleAccessToken);
                localStorage.setItem(PENDING_GOOGLE_PICKER_SESSION_KEY, session.id);
                pickerWindow.location.replace(session.pickerUri);
                setPickerStatus('waiting');

                // On iOS the app is suspended while the picker tab is active,
                // so polling is pointless -- recovery happens via the
                // visibilitychange/focus effect when the user returns.
                // Don't close the picker window either -- the user is still in it.
                if (iosDevice) return;

                try {
                    const done = await pollPickerSession(googleAccessToken, session.id);
                    if (done.mediaItemsSet) await finalizeGooglePickerSelection(session.id);
                } finally {
                    try { pickerWindow.close(); } catch { /* ignore */ }
                }
            } catch (error) {
                console.error('[Picker] Error:', error);
                localStorage.removeItem(PENDING_GOOGLE_PICKER_SESSION_KEY);
                const { friendlyGoogleError } = await import('../../../utils/googleApiErrors');
                setPickerErrorMsg(friendlyGoogleError(error));
                setPickerStatus('error');
            }
        })();
    }, [finalizeGooglePickerSelection, googleAccessToken, iosDevice, iosStandalonePwa]);

    return (
        <SettingsSection title="Screensaver" icon={<Image size={18} className="text-amber-500" />}>
            <SettingsToggle label="Smart Screensaver" description="Clock & Weather overlay when idle" enabled={screensaverEnabled} onToggle={() => setScreensaverEnabled(!screensaverEnabled)} color="bg-indigo-500" />
            {screensaverEnabled && (
                <div className="space-y-3 rounded-xl bg-slate-50/50 p-4 border border-indigo-100 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex flex-col">
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Timer size={14} className="text-indigo-500" /> Idle Timeout</span>
                            <span className="text-[10px] text-slate-400 italic">Activate after <span className="text-indigo-600 font-medium">{screensaverTimeout}s</span> of silence</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <input type="number" min="10" max="3600" className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50" value={screensaverTimeout} onChange={(e) => setScreensaverTimeout(parseInt(e.target.value, 10) || 120)} onKeyDown={(e) => e.stopPropagation()} />
                            <span className="text-[10px] font-bold text-slate-400">sec</span>
                        </div>
                    </div>
                    <input type="range" min="10" max="3600" step="30" className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500" value={draftTimeout} onChange={(e) => { const v = parseInt(e.target.value, 10); setDraftTimeout(v); commitSlider(v); }} />

                    {/* Photo Source Selector */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Image size={14} className="text-indigo-500" /> Photo Source</label>
                        <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-slate-100 p-1">
                            {([
                                { id: 'unsplash' as ScreensaverSource, label: 'Default' },
                                { id: 'google' as ScreensaverSource, label: 'Google' },
                                { id: 'offline' as ScreensaverSource, label: 'My Photos' },
                            ]).map((src) => (
                                <button key={src.id} onClick={() => setScreensaverSource(src.id)}
                                    className={`rounded-md px-2 py-1.5 text-[10px] font-bold transition-all ${screensaverSource === src.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    {src.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Google Photos section */}
                    {screensaverSource === 'google' && (
                        <>
                            {!googleAccessToken ? (
                                <div className="space-y-2">
                                    {!localStorage.getItem('curio_google_client_id') && (
                                        <p className="text-[10px] text-amber-600 font-medium">Set up your Google OAuth Client ID in Accounts & Keys above first.</p>
                                    )}
                                    <button onClick={handleGooglePhotosSignIn} className="w-full rounded-xl bg-blue-500 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-600">
                                        {iosStandalonePwa ? 'Sign In with Google in Safari' : 'Sign In with Google (Photos)'}
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold uppercase text-green-600">Connected to Google</label>
                                        <button onClick={async () => { try { googleSignOut(); } catch (e) { console.warn("Failed to sign out:", e); } localStorage.removeItem(PENDING_GOOGLE_PICKER_SESSION_KEY); setGoogleAccessToken(''); }} className="text-[10px] text-red-500 underline">Disconnect</button>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Image size={14} className="text-indigo-500" /> Screensaver Photos</label>
                                        {iosStandalonePwa && (
                                            <p className="text-[10px] text-slate-500 italic">On iPhone and iPad home-screen apps, Google Photos may open outside Curio. After picking photos, switch back here and Curio will finish syncing them.</p>
                                        )}
                                        {pickerPhotoCount > 0 && pickerStatus !== 'waiting' && (
                                            <p className="text-[10px] text-green-600 font-semibold">&#10003; {pickerPhotoCount} photo{pickerPhotoCount !== 1 ? 's' : ''} selected for screensaver</p>
                                        )}
                                        {pickerStatus === 'waiting' && (
                                            <p className="text-[10px] text-amber-600 animate-pulse">&#9203; Waiting for you to finish selecting in Google Photos...</p>
                                        )}
                                        {pickerStatus === 'error' && (
                                            <p className="text-[10px] text-red-500">{pickerErrorMsg || 'Failed to load photos. Try again.'}</p>
                                        )}
                                        <button disabled={pickerStatus === 'opening' || pickerStatus === 'waiting'} onClick={handleGooglePickerLaunch}
                                            className="w-full rounded-xl bg-indigo-500 py-2.5 text-xs font-bold text-white shadow-md hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed">
                                            {pickerStatus === 'opening' ? 'Opening Google Photos...' : pickerStatus === 'waiting' ? 'Waiting for selection...' : pickerPhotoCount > 0 ? 'Change Screensaver Photos' : 'Choose Photos for Screensaver'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Offline / My Photos section */}
                    {screensaverSource === 'offline' && (
                        <div className="space-y-2">
                            {offlineImageCount > 0 && (
                                <p className="text-[10px] text-green-600 font-semibold">&#10003; {offlineImageCount} photo{offlineImageCount !== 1 ? 's' : ''} saved for screensaver</p>
                            )}
                            <label className={`relative flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold text-white shadow-md ${offlineUploading ? 'cursor-not-allowed bg-emerald-400 opacity-50' : 'cursor-pointer bg-emerald-500 hover:bg-emerald-600'}`}>
                                <input ref={offlineFileInputRef} type="file" accept="image/*" multiple disabled={offlineUploading} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    onChange={async (e) => {
                                        const files = e.target.files;
                                        if (!files || files.length === 0) return;
                                        setOfflineUploading(true);
                                        try {
                                            const { addOfflineImages, getOfflineImageCount } = await import('../../../services/offlineImageStore');
                                            await addOfflineImages(Array.from(files));
                                            const count = await getOfflineImageCount();
                                            setOfflineImageCount(count);
                                        } catch (err) { console.error('[Offline Photos] Upload failed:', err); }
                                        finally { setOfflineUploading(false); if (offlineFileInputRef.current) offlineFileInputRef.current.value = ''; }
                                    }} />
                                <Upload size={14} />
                                {offlineUploading ? 'Adding photos...' : offlineImageCount > 0 ? 'Add More Photos' : 'Add Photos from Device'}
                            </label>
                            {offlineImageCount > 0 && (
                                <button onClick={async () => { if (!window.confirm(`Remove all ${offlineImageCount} offline photos?`)) return; const { clearOfflineImages } = await import('../../../services/offlineImageStore'); await clearOfflineImages(); setOfflineImageCount(0); }}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-2 text-[10px] font-bold text-red-600 hover:bg-red-100">
                                    <Trash2 size={12} /> Clear All Offline Photos
                                </button>
                            )}
                            <p className="text-[10px] text-slate-400 italic">Photos are stored locally on this device. Works offline -- no internet needed.</p>
                        </div>
                    )}

                    {screensaverSource === 'unsplash' && (
                        <p className="text-[10px] text-slate-400 italic">Using beautiful default nature photos. No setup needed.</p>
                    )}
                </div>
            )}
        </SettingsSection>
    );
};

export default React.memo(ScreensaverSection);
