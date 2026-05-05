/**
 * Card-type-specific SVG content rendered inside KiroFace's centered eye
 * when a card is active. Extracted from KiroFace to reduce file size.
 *
 * Coordinate space: ghost-native coords (the same system the ghost body uses
 * before the outer translate/scale is applied). Eye centers land at
 * approximately (481, 365) and (581, 365). Card visuals anchor at (531, 365)
 * -- right between the two eyes.
 */
import React from 'react';
import type { Card } from '../../services/cardTypes';

interface KiroCardEyeContentProps {
  activeCard: Card | null | undefined;
  centerGlintRef: React.RefObject<SVGCircleElement | null>;
  centerTimerTextRef: React.RefObject<SVGTextElement | null>;
}

// Between-the-eyes anchor for card visuals.
const CX = 531;
const CY = 365;

export const KiroCardEyeContent: React.FC<KiroCardEyeContentProps> = React.memo(({
  activeCard,
  centerGlintRef,
  centerTimerTextRef,
}) => {
  if (!activeCard) return null;

  const data = activeCard.data as any;

  switch (activeCard.type) {
    case 'weather': {
      const condition = String(data?.condition || '').toLowerCase();
      if (condition.includes('snow') || condition.includes('flurries')) {
        return (
          <g transform={`translate(${CX - 75}, ${CY - 45})`}>
            {[...Array(6)].map((_, i) => (
              <g
                key={i}
                transform={`translate(${(i % 3) * 50}, ${Math.floor(i / 3) * 50})`}
                className="animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}
              >
                <line x1="-12" y1="0" x2="12" y2="0" stroke="#000000" strokeWidth="5" strokeLinecap="round" />
                <line x1="-8" y1="-8" x2="8" y2="8" stroke="#000000" strokeWidth="5" strokeLinecap="round" />
                <line x1="-8" y1="8" x2="8" y2="-8" stroke="#000000" strokeWidth="5" strokeLinecap="round" />
              </g>
            ))}
          </g>
        );
      } else if (condition.includes('storm') || condition.includes('thunder')) {
        return (
          <g transform={`translate(${CX - 60}, ${CY - 60})`}>
            <path d="M 10 60 Q 10 20 55 30 Q 80 -5 105 30 Q 140 40 105 70 Z" fill="#000000" opacity="0.75" />
            <path d="M 65 60 L 50 100 L 75 100 L 55 140 L 95 80 L 70 80 Z" fill="none" stroke="#000000" strokeWidth="8" strokeLinejoin="round" className="animate-pulse" />
          </g>
        );
      } else if (condition.includes('rain') || condition.includes('drizzle')) {
        return (
          <g transform={`translate(${CX - 60}, ${CY - 40})`}>
            <path d="M 10 30 Q 10 -5 55 5 Q 80 -30 105 5 Q 140 15 105 45 Z" fill="#000000" />
            <path d="M 30 60 Q 35 80 40 60 Z M 60 70 Q 65 90 70 70 Z M 90 60 Q 95 80 100 60 Z" fill="#000000" />
          </g>
        );
      } else if (
        condition.includes('cloud') ||
        condition.includes('overcast') ||
        condition.includes('fog') ||
        condition.includes('partly') ||
        condition.includes('mist') ||
        condition.includes('haze') ||
        condition.includes('broken') ||
        condition.includes('scattered')
      ) {
        return (
          <g transform={`translate(${CX - 60}, ${CY - 30})`}>
            <path d="M 10 50 Q 10 10 55 20 Q 80 -15 105 20 Q 140 30 105 60 Z" fill="#000000" />
          </g>
        );
      } else {
        return (
          <g transform={`translate(${CX}, ${CY})`}>
            <circle cx="0" cy="0" r="40" fill="#000000" />
            <g stroke="#000000" strokeWidth="10" strokeLinecap="round">
              <line x1="0" y1="-55" x2="0" y2="-75" />
              <line x1="0" y1="55" x2="0" y2="75" />
              <line x1="-55" y1="0" x2="-75" y2="0" />
              <line x1="55" y1="0" x2="75" y2="0" />
              <line x1="-40" y1="-40" x2="-54" y2="-54" />
              <line x1="40" y1="40" x2="54" y2="54" />
              <line x1="-40" y1="40" x2="-54" y2="54" />
              <line x1="40" y1="-40" x2="54" y2="-54" />
            </g>
          </g>
        );
      }
    }
    case 'device': {
      const isOn = data?.state === 'on';
      return (
        <g transform={`translate(${CX}, ${CY}) scale(0.85)`}>
          <path
            d="M 0 -70 C 40 -70 40 -15 25 10 L 25 40 L -25 40 L -25 10 C -40 -15 -40 -70 0 -70 Z"
            fill={isOn ? '#000000' : 'none'}
            stroke="#000000"
            strokeWidth="10"
          />
          <line x1="-12" y1="52" x2="12" y2="52" stroke="#000000" strokeWidth="8" strokeLinecap="round" />
          <line x1="-8" y1="64" x2="8" y2="64" stroke="#000000" strokeWidth="8" strokeLinecap="round" />
          {isOn && (
            <circle
              ref={centerGlintRef}
              cx="-14"
              cy="-42"
              r="14"
              fill="url(#kiro-eye-glint)"
              style={{ opacity: 0.9 }}
            />
          )}
        </g>
      );
    }
    case 'sportsScore': {
      const scoreText = data?.score || '0-0';
      return (
        <text
          x={CX}
          y={CY + 20}
          fill="#000000"
          fontSize="72"
          fontWeight="bold"
          textAnchor="middle"
          style={{ letterSpacing: '3px' }}
        >
          {scoreText}
        </text>
      );
    }
    case 'timer':
    case 'stopwatch':
      return (
        <text
          ref={centerTimerTextRef}
          x={CX}
          y={CY + 22}
          fill="#000000"
          fontSize="78"
          fontWeight="bold"
          textAnchor="middle"
          style={{ letterSpacing: '4px' }}
        >
          00:00
        </text>
      );
    case 'music':
    case 'media':
      return (
        <g transform={`translate(${CX - 60}, ${CY - 45})`}>
          <rect x="0" y="25" width="16" height="60" rx="8" fill="#000000" className="animate-pulse" style={{ animationDuration: '0.8s' }} />
          <rect x="28" y="0" width="16" height="85" rx="8" fill="#000000" className="animate-pulse" style={{ animationDuration: '1.2s' }} />
          <rect x="56" y="35" width="16" height="50" rx="8" fill="#000000" className="animate-pulse" style={{ animationDuration: '1.5s' }} />
          <rect x="84" y="15" width="16" height="70" rx="8" fill="#000000" className="animate-pulse" style={{ animationDuration: '0.9s' }} />
          <rect x="112" y="30" width="16" height="55" rx="8" fill="#000000" className="animate-pulse" style={{ animationDuration: '1.1s' }} />
        </g>
      );
    case 'joke':
    case 'funFact':
    case 'quote':
    case 'trivia':
      return (
        <text
          x={CX}
          y={CY + 25}
          fill="#000000"
          fontSize="100"
          fontWeight="bold"
          textAnchor="middle"
          className="animate-bounce"
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        >
          !
        </text>
      );
    case 'calendar':
      return (
        <g transform={`translate(${CX - 55}, ${CY - 55})`}>
          <rect x="0" y="0" width="110" height="110" rx="14" fill="none" stroke="#000000" strokeWidth="10" />
          <line x1="0" y1="35" x2="110" y2="35" stroke="#000000" strokeWidth="10" />
          <line x1="25" y1="-18" x2="25" y2="14" stroke="#000000" strokeWidth="10" strokeLinecap="round" />
          <line x1="85" y1="-18" x2="85" y2="14" stroke="#000000" strokeWidth="10" strokeLinecap="round" />
          <rect x="28" y="60" width="14" height="14" rx="3" fill="#000000" />
          <rect x="48" y="60" width="14" height="14" rx="3" fill="#000000" />
          <rect x="68" y="60" width="14" height="14" rx="3" fill="#000000" />
        </g>
      );
    default:
      return null;
  }
});
KiroCardEyeContent.displayName = 'KiroCardEyeContent';
