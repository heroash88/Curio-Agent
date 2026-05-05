import React from "react";

const COLOR_WHEEL_BACKGROUND =
  "conic-gradient(from 90deg, #ef4444, #f97316, #facc15, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)";

const COLOR_INPUT_FALLBACK = "#38bdf8";

const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-10 w-10",
} as const;

const normalizeColorInputValue = (value: string | undefined) =>
  /^#[0-9a-fA-F]{6}$/.test(value || "") ? value || COLOR_INPUT_FALLBACK : COLOR_INPUT_FALLBACK;

interface ColorWheelInputProps {
  value?: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  title?: string;
  active?: boolean;
  size?: keyof typeof sizeClasses;
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  onBlur?: () => void;
}

const ColorWheelInput: React.FC<ColorWheelInputProps> = ({
  value,
  onChange,
  ariaLabel,
  title,
  active = false,
  size = "md",
  className = "",
  activeClassName = "scale-105 border-[var(--ether-on-surface)] shadow-lg",
  inactiveClassName = "border-[var(--ether-glass-border)] hover:border-[var(--ether-on-surface)]/55",
  onBlur,
}) => {
  const inputValue = normalizeColorInputValue(value);
  const handleColorChange = (event: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLInputElement>) => {
    onChange(event.currentTarget.value);
  };

  return (
    <label
      title={title || ariaLabel}
      className={`relative inline-flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[35%] border-2 bg-white/75 shadow-sm transition hover:scale-105 active:scale-95 focus-within:ring-2 focus-within:ring-[var(--ether-primary)]/35 ${sizeClasses[size]} ${
        active ? activeClassName : inactiveClassName
      } ${className}`}
    >
      <input
        type="color"
        value={inputValue}
        onInput={handleColorChange}
        onChange={handleColorChange}
        onBlur={onBlur}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        aria-label={ariaLabel}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: COLOR_WHEEL_BACKGROUND }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-[4px] rounded-[32%] border border-white/70 shadow-[inset_0_1px_8px_rgba(255,255,255,0.55)]"
        style={{
          background:
            "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.9), transparent 30%), transparent",
        }}
      />
      <span
        aria-hidden="true"
        className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full border border-white/90 shadow-[0_1px_4px_rgba(0,0,0,0.28)]"
        style={{ backgroundColor: inputValue }}
      />
    </label>
  );
};

export default ColorWheelInput;
