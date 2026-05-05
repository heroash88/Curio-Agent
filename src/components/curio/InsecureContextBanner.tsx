import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const DISMISS_KEY = 'curio_insecure_banner_dismissed';

/**
 * Warns the user when the app is loaded from a non-secure origin
 * (plain HTTP, not localhost). On such origins:
 *   - navigator.mediaDevices.getUserMedia is blocked, so the mic
 *     won't start, which means no Gemini or Nova voice connection.
 *   - window.crypto.subtle is undefined, so encrypted API keys saved
 *     on an HTTPS visit cannot be decrypted here.
 *
 * This is a browser-level restriction, not something we can patch
 * from JS. The banner directs users to open the app via HTTPS --
 * typically the HA ingress panel when running as an add-on.
 */
export const InsecureContextBanner: React.FC = () => {
    const [dismissed, setDismissed] = useState<boolean>(() => {
        if (typeof window === 'undefined') return true;
        return sessionStorage.getItem(DISMISS_KEY) === 'true';
    });

    // window.isSecureContext is true for https:, wss:, localhost, 127.0.0.1, file:.
    // We only surface the banner when it's explicitly false.
    const isInsecure = typeof window !== 'undefined' && window.isSecureContext === false;
    if (!isInsecure || dismissed) return null;

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation();
        sessionStorage.setItem(DISMISS_KEY, 'true');
        setDismissed(true);
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -100, opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                className="fixed top-6 left-0 right-0 z-[100] flex justify-center px-4 pointer-events-none"
            >
                <div className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/95 px-4 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
                        <AlertTriangle size={18} />
                    </div>

                    <div className="flex flex-col text-amber-900">
                        <h3 className="text-sm font-bold leading-tight">
                            Voice features disabled on insecure origin
                        </h3>
                        <p className="mt-1 text-[11px] font-medium leading-snug text-amber-800">
                            Browsers block microphone access and encrypted storage
                            on plain HTTP. Open Curio through the Home Assistant
                            ingress panel (HTTPS) or via localhost to use Gemini
                            and Nova voice.
                        </p>
                    </div>

                    <button
                        onClick={handleDismiss}
                        className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-900"
                        aria-label="Dismiss"
                    >
                        <X size={16} />
                    </button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
