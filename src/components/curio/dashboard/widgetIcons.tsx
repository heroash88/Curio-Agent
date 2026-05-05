// Compact multi-hue inline SVG icons used across dashboard widgets.
// Each icon uses its own palette so the widget row reads as colorful rather
// than a single-tint monotone strip. Using raw SVG (not lucide-react) keeps
// the widget bundle small and lets us mix fills + strokes freely.

const BASE_SVG_PROPS = {
  viewBox: '0 0 24 24',
  className: 'w-4 h-4',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// YouTube -- Red logo with play triangle
export const IconYouTube = ({ className = "" }: { className?: string }) => (
  <svg {...BASE_SVG_PROPS} viewBox="0 0 24 24" className={`${BASE_SVG_PROPS.className} ${className}`}>
    <rect x="2" y="5" width="20" height="14" rx="4" fill="#FF0000" />
    <path d="M10 9l5 3-5 3V9z" fill="white" />
  </svg>
);

// Image Gallery -- Stack of photos with blue accents
export const IconImageGallery = ({ className = "" }: { className?: string }) => (
  <svg {...BASE_SVG_PROPS} viewBox="0 0 24 24" className={`${BASE_SVG_PROPS.className} ${className}`}>
    <rect x="3" y="3" width="14" height="14" rx="2" fill="#DBEAFE" stroke="#2563EB" strokeWidth="1.4" />
    <rect x="7" y="7" width="14" height="14" rx="2" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1.4" />
    <circle cx="11" cy="11" r="1.5" fill="#3B82F6" />
    <path d="M7 17l3-3 2 2 4-4 5 5" stroke="#3B82F6" strokeWidth="1.4" fill="none" />
  </svg>
);

// Clock -- blue face, orange hands
export const IconClock = () => (
  <svg {...BASE_SVG_PROPS}>
    <circle cx="12" cy="12" r="9" fill="#DBEAFE" stroke="#2563EB" strokeWidth="1.6" />
    <path d="M12 7v5l3 2" stroke="#F97316" strokeWidth="2" fill="none" />
    <circle cx="12" cy="12" r="1" fill="#F97316" />
  </svg>
);

// Analog Clock -- white face, indigo frame, multiple hands
export const IconAnalogClock = () => (
  <svg {...BASE_SVG_PROPS}>
    <circle cx="12" cy="12" r="9.5" fill="#F8FAFC" stroke="#6366F1" strokeWidth="1.4" />
    <path d="M12 5.5v6.5h4" stroke="#4F46E5" strokeWidth="1.8" fill="none" />
    <line x1="12" y1="12" x2="8" y2="16" stroke="#EC4899" strokeWidth="1" />
    <circle cx="12" cy="12" r="0.8" fill="#4F46E5" />
  </svg>
);

// Weather -- yellow sun peeking behind a white cloud
export const IconWeather = () => (
  <svg {...BASE_SVG_PROPS}>
    <circle cx="16" cy="8" r="3.5" fill="#FBBF24" stroke="#F59E0B" strokeWidth="1.2" />
    <path
      d="M6 18h11a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6-1.5A3.5 3.5 0 0 0 6 18z"
      fill="#F1F5F9"
      stroke="#64748B"
      strokeWidth="1.4"
    />
  </svg>
);

// Calendar -- red header, white body, slate grid
export const IconCalendar = () => (
  <svg {...BASE_SVG_PROPS}>
    <rect x="3" y="5" width="18" height="16" rx="2" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="1.4" />
    <rect x="3" y="5" width="18" height="5" rx="2" fill="#EF4444" />
    <line x1="8" y1="3" x2="8" y2="8" stroke="#991B1B" strokeWidth="2" />
    <line x1="16" y1="3" x2="16" y2="8" stroke="#991B1B" strokeWidth="2" />
    <circle cx="8.5" cy="14.5" r="1.1" fill="#EF4444" />
    <circle cx="12" cy="14.5" r="1.1" fill="#94A3B8" />
    <circle cx="15.5" cy="14.5" r="1.1" fill="#94A3B8" />
  </svg>
);

// Timer -- orange body, red top cap
export const IconTimer = () => (
  <svg {...BASE_SVG_PROPS}>
    <line x1="9" y1="2.5" x2="15" y2="2.5" stroke="#DC2626" strokeWidth="2.2" />
    <circle cx="12" cy="14" r="7.5" fill="#FED7AA" stroke="#EA580C" strokeWidth="1.6" />
    <path d="M12 10v4l2.5 2" stroke="#EA580C" strokeWidth="2" fill="none" />
  </svg>
);

// Music -- purple note, pink disc
export const IconMusic = () => (
  <svg {...BASE_SVG_PROPS}>
    <path d="M9 18V5l11-2v13" stroke="#7C3AED" strokeWidth="1.8" fill="none" />
    <circle cx="6" cy="18" r="3" fill="#EC4899" stroke="#BE185D" strokeWidth="1.2" />
    <circle cx="17" cy="16" r="3" fill="#A855F7" stroke="#7C3AED" strokeWidth="1.2" />
  </svg>
);

// Bell -- gold bell, red clapper
export const IconBell = () => (
  <svg {...BASE_SVG_PROPS}>
    <path
      d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9z"
      fill="#FCD34D"
      stroke="#B45309"
      strokeWidth="1.4"
    />
    <path d="M10.3 20a1.94 1.94 0 0 0 3.4 0" stroke="#B45309" strokeWidth="1.6" fill="none" />
    <circle cx="12" cy="12" r="1.2" fill="#DC2626" />
  </svg>
);

// Home -- green roof, brown door
export const IconHome = () => (
  <svg {...BASE_SVG_PROPS}>
    <path d="M3 12l9-8 9 8v9H3z" fill="#BBF7D0" stroke="#16A34A" strokeWidth="1.5" />
    <path d="M3 12l9-8 9 8" stroke="#15803D" strokeWidth="1.8" fill="none" />
    <rect x="10" y="14" width="4" height="7" fill="#92400E" stroke="#78350F" strokeWidth="1" />
  </svg>
);

// Route -- blue line, green + red pins
export const IconRoute = () => (
  <svg {...BASE_SVG_PROPS}>
    <path d="M6 19v-5a4 4 0 0 1 4-4h4a4 4 0 0 0 4-4" stroke="#3B82F6" strokeWidth="1.8" fill="none" strokeDasharray="2 2" />
    <circle cx="6" cy="19" r="3" fill="#22C55E" stroke="#15803D" strokeWidth="1.2" />
    <circle cx="18" cy="6" r="3" fill="#EF4444" stroke="#991B1B" strokeWidth="1.2" />
  </svg>
);

// Leaf -- green leaf, dark stem
export const IconLeaf = () => (
  <svg {...BASE_SVG_PROPS}>
    <path
      d="M11 20A7 7 0 0 1 9.8 6.1c2.1-.5 4.5.1 6.5 2.1 2 2 2.5 4.3 2 6.5a7 7 0 0 1-7.3 5.3z"
      fill="#86EFAC"
      stroke="#15803D"
      strokeWidth="1.4"
    />
    <path d="M2 21c.5-4.5 2.5-8 7-10" stroke="#166534" strokeWidth="1.6" fill="none" />
  </svg>
);

// Quote -- teal marks
export const IconQuote = () => (
  <svg {...BASE_SVG_PROPS}>
    <path d="M3 21c3 0 7-1 7-8V5H3v7h4" fill="#99F6E4" stroke="#0F766E" strokeWidth="1.4" />
    <path d="M14 21c3 0 7-1 7-8V5h-7v7h4" fill="#99F6E4" stroke="#0F766E" strokeWidth="1.4" />
  </svg>
);

// Brain -- pink brain lobes
export const IconBrain = () => (
  <svg {...BASE_SVG_PROPS}>
    <path
      d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-5 0V16a2.5 2.5 0 0 1-2.5-2.5v-2A2.5 2.5 0 0 1 7 9V7.5a2.5 2.5 0 0 1 2.5-5z"
      fill="#FBCFE8"
      stroke="#BE185D"
      strokeWidth="1.3"
    />
    <path
      d="M14.5 2a2.5 2.5 0 0 0-2.5 2.5v15a2.5 2.5 0 0 0 5 0V16a2.5 2.5 0 0 0 2.5-2.5v-2A2.5 2.5 0 0 0 17 9V7.5A2.5 2.5 0 0 0 14.5 2z"
      fill="#F9A8D4"
      stroke="#BE185D"
      strokeWidth="1.3"
    />
  </svg>
);

// Sparkle -- purple + yellow
export const IconSparkle = () => (
  <svg {...BASE_SVG_PROPS}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="#FDE047" stroke="#CA8A04" strokeWidth="1" />
    <circle cx="19" cy="5" r="1.5" fill="#A855F7" />
    <circle cx="5" cy="19" r="1.2" fill="#EC4899" />
  </svg>
);

// Edit -- yellow pencil body, gray tip
export const IconEdit = () => (
  <svg {...BASE_SVG_PROPS}>
    <path
      d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
      fill="#FEF3C7"
      stroke="#B45309"
      strokeWidth="1.4"
    />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" fill="#FBBF24" stroke="#B45309" strokeWidth="1.4" />
  </svg>
);

// CPU -- blue chip, yellow core
export const IconCpu = () => (
  <svg {...BASE_SVG_PROPS}>
    <rect x="4" y="4" width="16" height="16" rx="2" fill="#DBEAFE" stroke="#1D4ED8" strokeWidth="1.4" />
    <rect x="9" y="9" width="6" height="6" fill="#FDE047" stroke="#CA8A04" strokeWidth="1" />
    <g stroke="#1D4ED8" strokeWidth="1.4">
      <line x1="9" y1="2" x2="9" y2="4" />
      <line x1="15" y1="2" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="22" />
      <line x1="15" y1="20" x2="15" y2="22" />
      <line x1="20" y1="9" x2="22" y2="9" />
      <line x1="20" y1="14" x2="22" y2="14" />
      <line x1="2" y1="9" x2="4" y2="9" />
      <line x1="2" y1="14" x2="4" y2="14" />
    </g>
  </svg>
);

// Bolt -- yellow lightning bolt
export const IconBolt = () => (
  <svg {...BASE_SVG_PROPS}>
    <polygon
      points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"
      fill="#FACC15"
      stroke="#B45309"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

// Sun -- yellow core, orange rays
export const IconSun = () => (
  <svg {...BASE_SVG_PROPS}>
    <circle cx="12" cy="12" r="4" fill="#FBBF24" stroke="#D97706" strokeWidth="1.4" />
    <g stroke="#F97316" strokeWidth="2">
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="6.34" y1="17.66" x2="4.93" y2="19.07" />
      <line x1="19.07" y1="4.93" x2="17.66" y2="6.34" />
    </g>
  </svg>
);

// Moon -- indigo night, lavender face
export const IconMoon = () => (
  <svg {...BASE_SVG_PROPS}>
    <path
      d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
      fill="#E0E7FF"
      stroke="#4338CA"
      strokeWidth="1.4"
    />
  </svg>
);

// Target -- red + white dartboard
export const IconTarget = () => (
  <svg {...BASE_SVG_PROPS}>
    <circle cx="12" cy="12" r="10" fill="#FEE2E2" stroke="#B91C1C" strokeWidth="1.3" />
    <circle cx="12" cy="12" r="6" fill="#FCA5A5" stroke="#B91C1C" strokeWidth="1.1" />
    <circle cx="12" cy="12" r="2.5" fill="#DC2626" />
  </svg>
);

// Battery -- green body
export const IconBattery = () => (
  <svg {...BASE_SVG_PROPS}>
    <rect x="2" y="7" width="17" height="10" rx="2" fill="#BBF7D0" stroke="#15803D" strokeWidth="1.4" />
    <rect x="4" y="9" width="11" height="6" fill="#22C55E" />
    <rect x="19.5" y="10" width="2.5" height="4" rx="0.8" fill="#15803D" />
  </svg>
);

// Check -- green status dot
export const IconCheck = () => (
  <svg {...BASE_SVG_PROPS}>
    <circle cx="12" cy="12" r="10" fill="#86EFAC" stroke="#15803D" strokeWidth="1.3" />
    <polyline points="7 12 11 16 17 9" fill="none" stroke="#065F46" strokeWidth="2.2" />
  </svg>
);

// Calculator -- slate body, blue screen
export const IconCalc = () => (
  <svg {...BASE_SVG_PROPS}>
    <rect x="4" y="2" width="16" height="20" rx="2" fill="#E2E8F0" stroke="#475569" strokeWidth="1.4" />
    <rect x="6" y="4" width="12" height="4" rx="1" fill="#3B82F6" />
    <g fill="#475569">
      <circle cx="8" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="16" cy="12" r="1" />
      <circle cx="8" cy="16" r="1" />
      <circle cx="12" cy="16" r="1" />
      <circle cx="16" cy="16" r="1" />
      <circle cx="8" cy="19.5" r="1" />
      <circle cx="12" cy="19.5" r="1" />
    </g>
  </svg>
);

// Globe -- blue ocean, green continents
export const IconGlobe = () => (
  <svg {...BASE_SVG_PROPS}>
    <circle cx="12" cy="12" r="10" fill="#BAE6FD" stroke="#0369A1" strokeWidth="1.4" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" fill="none" stroke="#0369A1" strokeWidth="1.3" />
    <line x1="2" y1="12" x2="22" y2="12" stroke="#0369A1" strokeWidth="1.3" />
    <path d="M5 8c2 0 3 1.5 5 1.5S13 8 15 8" stroke="#16A34A" strokeWidth="1.4" fill="none" />
  </svg>
);

// Play -- green triangle
export const IconPlay = () => (
  <svg {...BASE_SVG_PROPS}>
    <polygon points="6 4 20 12 6 20 6 4" fill="#22C55E" stroke="#166534" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

// Pause -- orange bars
export const IconPause = () => (
  <svg {...BASE_SVG_PROPS}>
    <rect x="6" y="4" width="4" height="16" rx="1" fill="#F97316" stroke="#B45309" strokeWidth="1.2" />
    <rect x="14" y="4" width="4" height="16" rx="1" fill="#F97316" stroke="#B45309" strokeWidth="1.2" />
  </svg>
);

// Skip -- purple
export const IconSkip = () => (
  <svg {...BASE_SVG_PROPS}>
    <polygon points="5 4 15 12 5 20 5 4" fill="#A855F7" stroke="#6B21A8" strokeWidth="1.3" strokeLinejoin="round" />
    <line x1="19" y1="5" x2="19" y2="19" stroke="#6B21A8" strokeWidth="2.2" />
  </svg>
);

// Flag -- red flag, brown pole
export const IconFlag = () => (
  <svg {...BASE_SVG_PROPS}>
    <path
      d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"
      fill="#EF4444"
      stroke="#991B1B"
      strokeWidth="1.3"
    />
    <line x1="4" y1="22" x2="4" y2="3" stroke="#78350F" strokeWidth="2" />
  </svg>
);

// Stopwatch -- gold body, red cap
export const IconStopwatch = ({ className = "" }: { className?: string }) => (
  <svg {...BASE_SVG_PROPS} className={`${BASE_SVG_PROPS.className} ${className}`}>
    <line x1="9" y1="2.5" x2="15" y2="2.5" stroke="#DC2626" strokeWidth="2.2" />
    <circle cx="12" cy="14" r="7.5" fill="#FEF3C7" stroke="#B45309" strokeWidth="1.5" />
    <path d="M12 10v4l2 2" stroke="#B45309" strokeWidth="2" fill="none" />
  </svg>
);

// DND -- red sign
export const IconDoNotDisturb = () => (
  <svg {...BASE_SVG_PROPS}>
    <circle cx="12" cy="12" r="10" fill="#FEE2E2" stroke="#B91C1C" strokeWidth="1.4" />
    <line x1="6" y1="6" x2="18" y2="18" stroke="#DC2626" strokeWidth="2.4" />
  </svg>
);

// Camera -- dark gray body, blue lens
export const IconCamera = () => (
  <svg {...BASE_SVG_PROPS}>
    <path
      d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
      fill="#475569"
      stroke="#1E293B"
      strokeWidth="1.4"
    />
    <circle cx="12" cy="13" r="4" fill="#1E293B" />
    <circle cx="12" cy="13" r="2.5" fill="#3B82F6" />
    <circle cx="11.2" cy="12.2" r="0.7" fill="#BAE6FD" />
    <circle cx="18.5" cy="9.5" r="0.7" fill="#EF4444" />
  </svg>
);

// Lightbulb -- yellow bulb, gray base
export const IconLightbulb = () => (
  <svg {...BASE_SVG_PROPS}>
    <path
      d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5a6 6 0 0 0-12 0c0 1 .2 2 1 3 .7.8 1.2 1.5 1.5 2.5"
      fill="#FDE047"
      stroke="#B45309"
      strokeWidth="1.4"
    />
    <rect x="9" y="14" width="6" height="3" rx="0.5" fill="#94A3B8" stroke="#475569" strokeWidth="1.2" />
    <rect x="10" y="17" width="4" height="2" rx="0.5" fill="#64748B" stroke="#334155" strokeWidth="1" />
    <path d="M10 22h4" stroke="#334155" strokeWidth="1.4" />
  </svg>
);

// Thermometer -- red mercury
export const IconThermometer = () => (
  <svg {...BASE_SVG_PROPS}>
    <path
      d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"
      fill="#FECACA"
      stroke="#991B1B"
      strokeWidth="1.4"
    />
    <circle cx="11.5" cy="17.5" r="2.3" fill="#DC2626" />
    <rect x="10.5" y="6" width="2" height="10" rx="1" fill="#DC2626" />
  </svg>
);
