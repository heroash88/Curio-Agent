/**
 * Card-type-specific SVG content rendered inside AstroFace's centered eye
 * when a card is active. Extracted from AstroFace to reduce file size.
 */
import React from 'react';
import type { Card } from '../../services/cardTypes';

interface AstroCardEyeContentProps {
  activeCard: Card | null | undefined;
  centerGlintRef: React.RefObject<SVGCircleElement | null>;
  centerTimerTextRef: React.RefObject<SVGTextElement | null>;
}

export const AstroCardEyeContent: React.FC<AstroCardEyeContentProps> = React.memo(({
  activeCard,
  centerGlintRef,
  centerTimerTextRef,
}) => {
  if (!activeCard) return null;

  const data = activeCard.data as any;
  const cx = 300;
  const cy = 230;

  switch (activeCard.type) {
    case 'weather': {
      const condition = String(data?.condition || '').toLowerCase();
      if (condition.includes('snow') || condition.includes('flurries')) {
        return (
          <g>
            {[...Array(6)].map((_, i) => (
              <g key={i} transform={`translate(${240 + (i % 3) * 60}, ${130 + Math.floor(i / 3) * 60})`} className="animate-pulse" style={{ animationDelay: `${i * 0.2}s` }}>
                <line x1="-15" y1="0" x2="15" y2="0" stroke="url(#astro-dotPattern)" strokeWidth="6" strokeLinecap="round" />
                <line x1="-10" y1="-10" x2="10" y2="10" stroke="url(#astro-dotPattern)" strokeWidth="6" strokeLinecap="round" />
                <line x1="-10" y1="10" x2="10" y2="-10" stroke="url(#astro-dotPattern)" strokeWidth="6" strokeLinecap="round" />
              </g>
            ))}
          </g>
        );
      } else if (condition.includes('storm') || condition.includes('thunder')) {
        return (
          <g>
            <path d="M 240 240 Q 240 190 290 200 Q 320 160 350 200 Q 390 210 350 250 Z" fill="url(#astro-dotPattern)" opacity="0.7" />
            <path d="M 300 240 L 280 290 L 310 290 L 290 340 L 340 270 L 300 270 Z" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="10" strokeLinejoin="round" className="animate-pulse" />
          </g>
        );
      } else if (condition.includes('rain') || condition.includes('drizzle')) {
        return (
          <g>
            <path d="M 270 230 Q 280 260 290 230 Z M 300 270 Q 310 300 320 270 Z M 330 240 Q 340 270 350 240 Z" fill="url(#astro-dotPattern)" />
            <path d="M 250 250 Q 300 190 350 250" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="20" strokeLinecap="round" />
          </g>
        );
      } else if (condition.includes('cloud') || condition.includes('overcast') || condition.includes('fog') || condition.includes('partly') || condition.includes('mist') || condition.includes('haze') || condition.includes('broken') || condition.includes('scattered')) {
        return (
          <g>
            <path d="M 225 265 Q 225 215 275 225 Q 305 185 335 225 Q 375 235 335 275 Z" fill="url(#astro-dotPattern)" />
          </g>
        );
      } else {
        return (
          <g>
            <circle cx="300" cy="230" r="60" fill="url(#astro-dotPattern)" />
            <path d="M 300 140 L 300 110 M 300 320 L 300 350 M 210 230 L 180 230 M 390 230 L 420 230 M 235 165 L 215 145 M 365 295 L 385 315 M 235 295 L 215 315 M 365 165 L 385 145" stroke="url(#astro-dotPattern)" strokeWidth="15" strokeLinecap="round" />
          </g>
        );
      }
    }
    case 'device': {
      const isOn = data?.state === 'on';
      return (
        <g>
          <path d="M 300 135 C 360 135 360 215 330 245 L 330 295 L 270 295 L 270 245 C 240 215 240 135 300 135 Z" fill={isOn ? "url(#astro-dotPattern)" : "none"} stroke="url(#astro-dotPattern)" strokeWidth="15" />
          <line x1="285" y1="310" x2="315" y2="310" stroke="url(#astro-dotPattern)" strokeWidth="12" strokeLinecap="round" />
          <line x1="290" y1="325" x2="310" y2="325" stroke="url(#astro-dotPattern)" strokeWidth="12" strokeLinecap="round" />
          {isOn && <circle ref={centerGlintRef} cx="285" cy="175" r="20" fill="url(#astro-eye-glint)" style={{ opacity: 0.8 }} />}
        </g>
      );
    }
    case 'sportsScore': {
      const scoreText = data?.score || '0-0';
      return (
        <text x={cx} y={cy + 30} fill="url(#astro-dotPattern)" fontSize="90" fontWeight="bold" textAnchor="middle" style={{ letterSpacing: '4px' }}>
          {scoreText}
        </text>
      );
    }
    case 'timer':
    case 'stopwatch':
      return (
        <text ref={centerTimerTextRef} x={cx} y={cy + 30} fill="url(#astro-dotPattern)" fontSize="100" fontWeight="bold" textAnchor="middle" style={{ letterSpacing: '6px' }}>
          00:00
        </text>
      );
    case 'music':
    case 'media':
      return (
        <g>
          <rect x="220" y="190" width="20" height="80" rx="10" fill="url(#astro-dotPattern)" className="animate-pulse" style={{ animationDuration: '0.8s' }} />
          <rect x="260" y="150" width="20" height="120" rx="10" fill="url(#astro-dotPattern)" className="animate-pulse" style={{ animationDuration: '1.2s' }} />
          <rect x="300" y="170" width="20" height="100" rx="10" fill="url(#astro-dotPattern)" className="animate-pulse" style={{ animationDuration: '0.9s' }} />
          <rect x="340" y="130" width="20" height="140" rx="10" fill="url(#astro-dotPattern)" className="animate-pulse" style={{ animationDuration: '1.4s' }} />
          <rect x="380" y="180" width="20" height="90" rx="10" fill="url(#astro-dotPattern)" className="animate-pulse" style={{ animationDuration: '1.1s' }} />
        </g>
      );
    case 'calculation':
      return (
        <g>
          <text x="300" y="240" fill="url(#astro-dotPattern)" fontSize="120" fontWeight="bold" textAnchor="middle" style={{ animation: 'astro-sun-spin 10s linear infinite', transformOrigin: '300px 230px' }}>+</text>
        </g>
      );
    case 'joke':
      return (
        <g>
          <text x="250" y="250" fill="url(#astro-dotPattern)" fontSize="80" fontWeight="bold" textAnchor="middle" style={{ animation: 'astro-bounce 1s ease-in-out infinite' }}>HA</text>
          <text x="350" y="230" fill="url(#astro-dotPattern)" fontSize="80" fontWeight="bold" textAnchor="middle" style={{ animation: 'astro-bounce 1s ease-in-out infinite 0.2s' }}>HA</text>
        </g>
      );
    case 'airQuality':
      return (
        <g>
          <path d="M 180 210 Q 240 170 300 210 T 420 210" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="12" strokeLinecap="round" strokeDasharray="50 20" className="animate-pulse" />
          <path d="M 160 250 Q 220 210 280 250 T 400 250" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="12" strokeLinecap="round" strokeDasharray="40 30" className="animate-pulse" style={{ animationDelay: '0.3s' }} />
        </g>
      );
    case 'reminder':
    case 'list':
      return (
        <g>
          <rect x="240" y="150" width="120" height="160" rx="10" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="12" />
          <line x1="260" y1="190" x2="340" y2="190" stroke="url(#astro-dotPattern)" strokeWidth="8" strokeLinecap="round" />
          <line x1="260" y1="230" x2="340" y2="230" stroke="url(#astro-dotPattern)" strokeWidth="8" strokeLinecap="round" />
          <line x1="260" y1="270" x2="310" y2="270" stroke="url(#astro-dotPattern)" strokeWidth="8" strokeLinecap="round" />
          <path d="M 220 230 L 250 260 L 320 170" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'alarm':
      return (
        <g className="animate-pulse">
          <path d="M 300 150 C 350 150 360 220 360 250 L 380 270 L 220 270 L 240 250 C 240 220 250 150 300 150 Z" fill="url(#astro-dotPattern)" />
          <circle cx="300" cy="290" r="15" fill="url(#astro-dotPattern)" />
          <path d="M 260 150 Q 300 110 340 150" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="10" strokeLinecap="round" />
        </g>
      );
    case 'calendar':
      return (
        <g>
          <rect x="230" y="170" width="140" height="130" rx="15" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="15" />
          <line x1="230" y1="210" x2="370" y2="210" stroke="url(#astro-dotPattern)" strokeWidth="10" />
          <circle cx="270" cy="160" r="8" fill="url(#astro-dotPattern)" />
          <circle cx="330" cy="160" r="8" fill="url(#astro-dotPattern)" />
        </g>
      );
    case 'astronomy':
      return (
        <g>
          <path d="M 300 150 A 70 70 0 1 0 300 290 A 90 90 0 1 1 300 150 Z" fill="url(#astro-dotPattern)" />
          <circle cx="220" cy="180" r="10" fill="url(#astro-dotPattern)" className="animate-pulse" />
          <circle cx="380" cy="270" r="8" fill="url(#astro-dotPattern)" className="animate-pulse" style={{ animationDelay: '0.5s' }} />
        </g>
      );
    case 'map':
    case 'commute':
      return (
        <g style={{ animation: 'astro-bounce 1s ease-in-out infinite' }}>
          <path d="M 300 130 C 340 130 360 170 360 200 C 360 250 300 310 300 310 C 300 310 240 250 240 200 C 240 170 260 130 300 130 Z" fill="url(#astro-dotPattern)" />
          <circle cx="300" cy="190" r="25" fill="#020617" />
        </g>
      );
    case 'finance':
      return (
        <g>
          <polyline points="210,290 260,240 310,270 380,170" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
          <polygon points="350,170 390,160 380,200" fill="url(#astro-dotPattern)" />
          <line x1="200" y1="300" x2="400" y2="300" stroke="url(#astro-dotPattern)" strokeWidth="10" strokeLinecap="round" />
        </g>
      );
    case 'news':
      return (
        <g>
          <rect x="220" y="160" width="160" height="140" rx="5" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="12" />
          <line x1="240" y1="190" x2="320" y2="190" stroke="url(#astro-dotPattern)" strokeWidth="12" strokeLinecap="round" />
          <line x1="240" y1="220" x2="360" y2="220" stroke="url(#astro-dotPattern)" strokeWidth="8" strokeLinecap="round" />
          <line x1="240" y1="250" x2="340" y2="250" stroke="url(#astro-dotPattern)" strokeWidth="8" strokeLinecap="round" />
        </g>
      );
    case 'funFact':
      return (
        <g className="animate-pulse">
          <path d="M 290 150 L 310 150 L 305 250 L 295 250 Z" fill="url(#astro-dotPattern)" />
          <circle cx="300" cy="290" r="15" fill="url(#astro-dotPattern)" />
        </g>
      );
    case 'trivia':
      return (
        <g>
          <text x="300" y="270" fill="url(#astro-dotPattern)" fontSize="140" fontWeight="bold" textAnchor="middle" style={{ animation: 'astro-float-math 4s ease-in-out infinite', transformOrigin: '300px 230px' }}>?</text>
        </g>
      );
    case 'translation':
      return (
        <g>
          <path d="M 220 210 C 220 170 260 170 300 170 C 340 170 340 210 340 210 C 340 250 300 250 300 250 L 260 270 L 270 245 C 240 240 220 230 220 210 Z" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="10" strokeLinejoin="round" />
          <path d="M 270 250 C 270 220 310 220 350 220 C 390 220 390 260 390 260 C 390 290 350 290 350 290 L 310 310 L 320 285 C 290 280 270 270 270 250 Z" fill="url(#astro-dotPattern)" opacity="0.6" />
          <text x="280" y="220" fill="url(#astro-dotPattern)" fontSize="30" fontWeight="bold" textAnchor="middle">A</text>
        </g>
      );
    case 'definition':
      return (
        <g>
          <path d="M 220 270 Q 260 250 300 270 Q 340 250 380 270 L 380 190 Q 340 170 300 190 Q 260 170 220 190 Z" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="12" strokeLinejoin="round" />
          <line x1="300" y1="190" x2="300" y2="270" stroke="url(#astro-dotPattern)" strokeWidth="10" strokeLinecap="round" />
          <circle cx="340" cy="230" r="25" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="8" className="animate-pulse" />
        </g>
      );
    case 'recipe':
      return (
        <g>
          <path d="M 230 230 C 230 290 370 290 370 230 Z" fill="url(#astro-dotPattern)" />
          <path d="M 260 210 Q 270 170 280 210 M 300 210 Q 310 160 320 210 M 340 210 Q 350 180 360 210" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="6" strokeLinecap="round" className="animate-pulse" />
        </g>
      );
    case 'image':
      return (
        <g>
          <rect x="210" y="170" width="180" height="120" rx="20" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="15" />
          <circle cx="300" cy="230" r="30" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="10" />
          <circle cx="340" cy="190" r="8" fill="url(#astro-dotPattern)" className="animate-pulse" />
        </g>
      );
    case 'youtube':
      return (
        <g>
          <rect x="210" y="170" width="180" height="120" rx="30" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="15" />
          <polygon points="270,200 270,260 340,230" fill="url(#astro-dotPattern)" className="animate-pulse" />
        </g>
      );
    default:
      return (
        <g>
          <rect x="240" y="170" width="120" height="120" rx="20" fill="none" stroke="url(#astro-dotPattern)" strokeWidth="15" className="animate-pulse" />
          <circle cx="300" cy="230" r="20" fill="url(#astro-dotPattern)" />
        </g>
      );
  }
});
