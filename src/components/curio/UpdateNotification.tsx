import React, { useState, useEffect } from 'react';
import { RefreshCw, X, ArrowUpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const KNOWN_VERSION_KEY = 'curio_known_version';

export const UpdateNotification: React.FC = () => {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [newVersion, setNewVersion] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    const checkForUpdates = async () => {
        try {
            // Cache busting query param to ensure we get the latest from Firebase
            const response = await fetch(`/version.json?t=${Date.now()}`);
            if (!response.ok) return;
            
            const data = await response.json();
            if (!data.version) return;

            const knownVersion = localStorage.getItem(KNOWN_VERSION_KEY);

            if (!knownVersion) {
                // First visit -- store current version, no popup
                localStorage.setItem(KNOWN_VERSION_KEY, data.version);
                return;
            }

            if (data.version !== knownVersion) {
                console.log(`[UpdateNotification] New version detected: ${data.version} (known: ${knownVersion})`);
                setNewVersion(data.version);
                setUpdateAvailable(true);
                setIsVisible(true);
            }
        } catch (error) {
            console.error('[UpdateNotification] Failed to check for updates:', error);
        }
    };

    useEffect(() => {
        // Initial check on mount
        checkForUpdates();
    }, []);

    const handleUpdate = () => {
        // Mark the new version as known so the popup won't reappear
        if (newVersion) {
            localStorage.setItem(KNOWN_VERSION_KEY, newVersion);
        }

        // Trigger SW update if possible
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (const registration of registrations) {
                    registration.update();
                }
            });
        }
        
        // Force reload from server
        window.location.reload();
    };

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Store the version so the popup won't reappear for this version
        if (newVersion) {
            localStorage.setItem(KNOWN_VERSION_KEY, newVersion);
        }
        setIsVisible(false);
    };

    return (
        <AnimatePresence>
            {isVisible && updateAvailable && (
                <motion.div
                    initial={{ y: -100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -100, opacity: 0 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                    className="fixed top-6 left-0 right-0 z-[100] flex justify-center px-4 pointer-events-none"
                >
                    <div className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-sky-200/50 bg-white/95 px-5 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500 text-white shadow-sm shadow-sky-200">
                            <ArrowUpCircle size={24} />
                        </div>
                        
                        <div className="flex flex-col">
                            <h3 className="text-sm font-bold text-slate-900 leading-tight">
                                New update available!
                            </h3>
                            <p className="text-[11px] font-medium text-slate-500">
                                Version {newVersion} is ready to explore.
                            </p>
                        </div>

                        <div className="ml-2 flex items-center gap-2">
                            <button
                                onClick={handleUpdate}
                                className="flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-teal-600 active:scale-95"
                            >
                                <RefreshCw size={14} className="animate-[spin_4s_linear_infinite]" />
                                UPDATE
                            </button>
                            
                            <button
                                onClick={handleDismiss}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                                aria-label="Dismiss"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
