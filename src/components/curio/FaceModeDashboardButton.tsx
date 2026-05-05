import { LayoutDashboard } from 'lucide-react';

type FaceModeDashboardButtonProps = {
  dark: boolean;
  onOpenDashboard: () => void;
};

export function FaceModeDashboardButton({ dark, onOpenDashboard }: FaceModeDashboardButtonProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpenDashboard();
      }}
      className={`h-11 w-11 flex items-center justify-center rounded-full border shadow-sm transition-all active:scale-95 ${
        dark
          ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
          : 'border-sky-200/60 bg-white/90 text-slate-700 hover:bg-white'
      }`}
      aria-label="Dashboard mode"
      title="Dashboard mode"
    >
      <LayoutDashboard size={19} />
    </button>
  );
}
