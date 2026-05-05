import React from "react";
import { Trash2 } from "lucide-react";

interface DashboardDeleteConfirmationModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export const DashboardDeleteConfirmationModal: React.FC<
  DashboardDeleteConfirmationModalProps
> = ({ onConfirm, onCancel }) => (
  <>
    <div
      className="absolute inset-0 z-[100] bg-black/35 backdrop-blur-sm"
      onClick={onCancel}
    />
    <div className="absolute inset-0 z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-[320px] rounded-[2.5rem] border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] p-8 text-[var(--ether-on-surface)] shadow-[0_32px_80px_rgba(0,0,0,0.24)] backdrop-blur-2xl animate-in zoom-in-95 duration-200">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/15 text-rose-500 ring-8 ring-rose-500/5">
            <Trash2 size={28} />
          </div>
          <h3 className="text-xl font-bold tracking-tight text-[var(--ether-on-surface)]">
            Remove Widget?
          </h3>
          <p className="mt-3 px-2 text-[13px] leading-relaxed text-[var(--ether-on-surface-variant)]">
            Are you sure you want to remove this widget? This will clear its
            current settings.
          </p>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="rounded-2xl bg-[var(--ether-control-bg)] py-3.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface)] transition-all hover:bg-[var(--ether-control-hover)] active:scale-[0.96]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-2xl bg-rose-500 py-3.5 text-[11px] font-bold uppercase tracking-[0.2em] text-white shadow-lg shadow-rose-500/25 active:scale-[0.96] transition-all"
          >
            Yes, Remove
          </button>
        </div>
      </div>
    </div>
  </>
);
