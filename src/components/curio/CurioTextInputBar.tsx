import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Send } from 'lucide-react';

type CurioTextInputBarProps = {
    visible: boolean;
    formRef: React.RefObject<HTMLFormElement | null>;
    placeholder: string;
    onSubmitText: (text: string) => void;
};

export function CurioTextInputBar({
    visible,
    formRef,
    placeholder,
    onSubmitText,
}: CurioTextInputBarProps) {
    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.98 }}
                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                    className="absolute left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-2rem)] max-w-lg px-4 pointer-events-auto curio-face-text-input"
                    onClick={(event) => event.stopPropagation()}
                >
                    <form
                        ref={formRef}
                        className="group flex w-full items-center gap-3 rounded-3xl bg-slate-900/90 backdrop-blur-md border border-white/10 p-2 pl-5 shadow-[0_20px_50px_rgba(0,0,0,0.4)] ring-1 ring-white/5 transition-colors focus-within:ring-[#00B2FF]/40 focus-within:border-[#00B2FF]/30"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const input = event.currentTarget.querySelector('input') as HTMLInputElement;
                            const text = input?.value?.trim();
                            if (!text) return;
                            input.value = '';
                            onSubmitText(text);
                        }}
                    >
                        <input
                            type="text"
                            placeholder={placeholder}
                            className="flex-1 bg-transparent py-2.5 text-[15px] font-medium text-white outline-none placeholder:text-white/30 focus:placeholder:text-white/10"
                            autoComplete="off"
                            autoFocus
                        />
                        <button
                            type="submit"
                            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#00B2FF] text-white shadow-lg shadow-[#00B2FF]/20 hover:brightness-110 hover:scale-[1.02] active:scale-95 transition-all group-focus-within:brightness-110"
                            aria-label="Send message"
                        >
                            <Send size={18} fill="currentColor" className="opacity-90" />
                        </button>
                    </form>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
