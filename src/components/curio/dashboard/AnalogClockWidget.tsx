import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useSyncedDashboardTime } from '../../../hooks/useSyncedDashboardTime';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type { DashboardClockDesign, DashboardWidget } from '../../../services/dashboardTypes';
import { useClockShowSeconds } from '../../../utils/settingsStorage';
import { DashboardWidgetActionSlotContext, DashboardWidgetEditModeContext } from './WidgetShell';
import { WidgetBody, WidgetText } from './widgetPrimitives';

const ROMAN_NUMERALS = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
const ARABIC_NUMERALS = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
const CARDINAL_NUMERALS = new Map<number, string>([
  [0, '12'],
  [3, '3'],
  [6, '6'],
  [9, '9'],
]);

const CLOCK_DESIGN_LABELS: Record<DashboardClockDesign, string> = {
  minimal: 'Minimal',
  classical: 'Classical',
  classical_black_white: 'Classical B/W',
  regulator: 'Regulator',
  railway: 'Railway',
  marine: 'Marine',
  modern: 'Modern',
  instrument: 'Instrument',
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type DialTokens = {
  shellBg: string;
  shellBorder: string;
  shellShadow: string;
  aura: string;
  caseBg: string;
  caseBorder: string;
  caseShadow: string;
  faceBg: string;
  faceBorder: string;
  faceShadow: string;
  glare: string;
  marker: string;
  majorMarker: string;
  numeral: string;
  numeralMode: 'none' | 'roman' | 'arabic' | 'cardinal';
  numeralFontClass: string;
  hourHand: string;
  minuteHand: string;
  secondHand: string;
  handShadow: string;
  capOuter: string;
  capInner: string;
  innerRing: string;
  label: string;
  accent: string;
};

const formatAriaTime = (date: Date) =>
  date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });

const formatDesignLabel = (design: DashboardClockDesign) =>
  CLOCK_DESIGN_LABELS[design];

const getDialTokens = (design: DashboardClockDesign, dark: boolean): DialTokens => {
  const tokens: Record<DashboardClockDesign, DialTokens> = {
    minimal: {
      shellBg: dark ? 'rgba(17,24,39,0.52)' : 'rgba(255,252,246,0.76)',
      shellBorder: dark ? 'rgba(255,255,255,0.08)' : 'rgba(40,56,84,0.08)',
      shellShadow: dark ? '0 24px 72px rgba(2,6,23,0.48)' : '0 22px 54px rgba(148,163,184,0.22)',
      aura: dark ? 'rgba(148,163,184,0.24)' : 'rgba(148,163,184,0.16)',
      caseBg: dark
        ? 'linear-gradient(145deg, rgba(32,40,54,0.96), rgba(9,14,22,0.98))'
        : 'linear-gradient(145deg, rgba(255,255,255,0.96), rgba(236,239,244,0.92))',
      caseBorder: dark ? 'rgba(255,255,255,0.08)' : 'rgba(80,92,115,0.08)',
      caseShadow: dark
        ? '0 18px 46px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)'
        : '0 18px 40px rgba(148,163,184,0.28), inset 0 1px 0 rgba(255,255,255,0.95)',
      faceBg: dark
        ? 'radial-gradient(circle at 35% 20%, rgba(255,255,255,0.12), transparent 28%), linear-gradient(180deg, rgba(25,33,46,0.96), rgba(11,16,24,0.98))'
        : 'radial-gradient(circle at 32% 18%, rgba(255,255,255,0.96), rgba(255,255,255,0.7) 28%, transparent 48%), linear-gradient(180deg, #fdfbf6, #ece7dc)',
      faceBorder: dark ? 'rgba(255,255,255,0.06)' : 'rgba(73,86,107,0.08)',
      faceShadow: dark
        ? 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -24px 34px rgba(0,0,0,0.35)'
        : 'inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -22px 30px rgba(210,214,220,0.42)',
      glare: dark
        ? 'linear-gradient(135deg, rgba(255,255,255,0.14), transparent 42%)'
        : 'linear-gradient(135deg, rgba(255,255,255,0.96), transparent 40%)',
      marker: dark ? 'rgba(229,231,235,0.28)' : 'rgba(51,65,85,0.22)',
      majorMarker: dark ? 'rgba(244,244,245,0.76)' : 'rgba(15,23,42,0.58)',
      numeral: dark ? 'rgba(241,245,249,0.84)' : 'rgba(30,41,59,0.82)',
      numeralMode: 'none',
      numeralFontClass: 'font-headline',
      hourHand: dark ? '#f8fafc' : '#0f172a',
      minuteHand: dark ? '#cbd5e1' : '#334155',
      secondHand: dark ? '#a5b4fc' : '#4f46e5',
      handShadow: dark ? '0 3px 8px rgba(0,0,0,0.5)' : '0 2px 6px rgba(15,23,42,0.18)',
      capOuter: dark ? '#e2e8f0' : '#0f172a',
      capInner: dark ? '#94a3b8' : '#94a3b8',
      innerRing: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
      label: dark ? 'rgba(226,232,240,0.62)' : 'rgba(30,41,59,0.52)',
      accent: dark ? '#a5b4fc' : '#4f46e5',
    },
    classical: {
      shellBg: dark ? 'rgba(33,24,17,0.56)' : 'rgba(255,249,240,0.82)',
      shellBorder: dark ? 'rgba(245,222,179,0.12)' : 'rgba(180,146,108,0.12)',
      shellShadow: dark ? '0 26px 74px rgba(6,4,3,0.58)' : '0 24px 56px rgba(180,146,108,0.18)',
      aura: dark ? 'rgba(245,158,11,0.16)' : 'rgba(217,119,6,0.12)',
      caseBg: dark
        ? 'linear-gradient(145deg, rgba(92,63,39,0.95), rgba(45,29,19,0.98))'
        : 'linear-gradient(145deg, #eadbc1, #c9ae83)',
      caseBorder: dark ? 'rgba(252,211,77,0.22)' : 'rgba(161,98,7,0.18)',
      caseShadow: dark
        ? '0 22px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,248,220,0.16)'
        : '0 18px 38px rgba(180,146,108,0.3), inset 0 1px 0 rgba(255,252,245,0.88)',
      faceBg: dark
        ? 'radial-gradient(circle at 35% 22%, rgba(255,245,220,0.15), transparent 28%), linear-gradient(180deg, #2a211b, #17100d)'
        : 'radial-gradient(circle at 38% 18%, rgba(255,255,255,0.95), rgba(255,255,255,0.5) 26%, transparent 42%), linear-gradient(180deg, #fffdf7, #f1e6d2)',
      faceBorder: dark ? 'rgba(252,211,77,0.14)' : 'rgba(161,98,7,0.16)',
      faceShadow: dark
        ? 'inset 0 1px 0 rgba(255,252,245,0.08), inset 0 -24px 32px rgba(0,0,0,0.36)'
        : 'inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -18px 26px rgba(184,146,102,0.16)',
      glare: dark
        ? 'linear-gradient(135deg, rgba(255,248,220,0.08), transparent 46%)'
        : 'linear-gradient(135deg, rgba(255,255,255,0.78), transparent 44%)',
      marker: dark ? 'rgba(253,230,138,0.22)' : 'rgba(71,55,37,0.2)',
      majorMarker: dark ? 'rgba(253,230,138,0.74)' : 'rgba(71,55,37,0.74)',
      numeral: dark ? 'rgba(255,244,214,0.88)' : 'rgba(66,49,30,0.9)',
      numeralMode: 'roman',
      numeralFontClass: 'font-display',
      hourHand: dark ? '#f5deb3' : '#3b2f24',
      minuteHand: dark ? '#bfdbfe' : '#23406c',
      secondHand: dark ? '#fb7185' : '#9f1239',
      handShadow: dark ? '0 3px 8px rgba(0,0,0,0.5)' : '0 2px 6px rgba(71,55,37,0.18)',
      capOuter: dark ? '#f5deb3' : '#3b2f24',
      capInner: dark ? '#bfdbfe' : '#23406c',
      innerRing: dark ? 'rgba(253,230,138,0.12)' : 'rgba(161,98,7,0.12)',
      label: dark ? 'rgba(255,244,214,0.48)' : 'rgba(92,63,39,0.54)',
      accent: dark ? '#bfdbfe' : '#23406c',
    },
    classical_black_white: {
      shellBg: dark ? 'rgba(3,7,18,0.56)' : 'rgba(255,255,255,0.82)',
      shellBorder: dark ? 'rgba(255,255,255,0.12)' : 'rgba(3,7,18,0.1)',
      shellShadow: dark ? '0 28px 74px rgba(0,0,0,0.64)' : '0 24px 54px rgba(15,23,42,0.16)',
      aura: dark ? 'rgba(248,250,252,0.18)' : 'rgba(15,23,42,0.1)',
      caseBg: dark
        ? 'linear-gradient(145deg, #1f2937, #020617)'
        : 'linear-gradient(145deg, #18181b, #030712)',
      caseBorder: dark ? 'rgba(255,255,255,0.2)' : 'rgba(3,7,18,0.28)',
      caseShadow: dark
        ? '0 24px 58px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.14)'
        : '0 20px 42px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.12)',
      faceBg: dark
        ? 'radial-gradient(circle at 34% 18%, rgba(255,255,255,0.9), rgba(255,255,255,0.42) 26%, transparent 45%), linear-gradient(180deg, #f8fafc, #e5e7eb)'
        : 'radial-gradient(circle at 34% 18%, rgba(255,255,255,1), rgba(255,255,255,0.58) 27%, transparent 45%), linear-gradient(180deg, #ffffff, #f1f5f9)',
      faceBorder: dark ? 'rgba(15,23,42,0.22)' : 'rgba(3,7,18,0.18)',
      faceShadow: dark
        ? 'inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -24px 32px rgba(15,23,42,0.18)'
        : 'inset 0 1px 0 rgba(255,255,255,1), inset 0 -22px 30px rgba(15,23,42,0.08)',
      glare: dark
        ? 'linear-gradient(135deg, rgba(255,255,255,0.8), transparent 42%)'
        : 'linear-gradient(135deg, rgba(255,255,255,0.86), transparent 40%)',
      marker: dark ? 'rgba(15,23,42,0.28)' : 'rgba(3,7,18,0.3)',
      majorMarker: dark ? 'rgba(3,7,18,0.88)' : 'rgba(3,7,18,0.88)',
      numeral: dark ? 'rgba(2,6,23,0.96)' : 'rgba(2,6,23,0.96)',
      numeralMode: 'arabic',
      numeralFontClass: 'font-headline',
      hourHand: '#020617',
      minuteHand: '#111827',
      secondHand: '#dc2626',
      handShadow: dark ? '0 3px 8px rgba(0,0,0,0.24)' : '0 2px 7px rgba(15,23,42,0.18)',
      capOuter: '#020617',
      capInner: '#dc2626',
      innerRing: dark ? 'rgba(15,23,42,0.08)' : 'rgba(15,23,42,0.07)',
      label: dark ? 'rgba(248,250,252,0.58)' : 'rgba(15,23,42,0.5)',
      accent: '#dc2626',
    },
    regulator: {
      shellBg: dark ? 'rgba(39,30,20,0.58)' : 'rgba(255,250,241,0.82)',
      shellBorder: dark ? 'rgba(251,191,36,0.14)' : 'rgba(146,93,32,0.13)',
      shellShadow: dark ? '0 28px 78px rgba(7,4,2,0.62)' : '0 24px 54px rgba(146,93,32,0.16)',
      aura: dark ? 'rgba(251,191,36,0.16)' : 'rgba(146,93,32,0.1)',
      caseBg: dark
        ? 'linear-gradient(145deg, #51361e, #20150d)'
        : 'linear-gradient(145deg, #d9bd84, #9b743d)',
      caseBorder: dark ? 'rgba(254,240,138,0.22)' : 'rgba(120,76,28,0.22)',
      caseShadow: dark
        ? '0 24px 56px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,246,210,0.16)'
        : '0 18px 38px rgba(146,93,32,0.26), inset 0 1px 0 rgba(255,252,242,0.92)',
      faceBg: dark
        ? 'radial-gradient(circle at 35% 20%, rgba(255,247,214,0.13), transparent 28%), linear-gradient(180deg, #2d2418, #150f09)'
        : 'radial-gradient(circle at 36% 18%, rgba(255,255,255,0.94), rgba(255,255,255,0.48) 28%, transparent 46%), linear-gradient(180deg, #fffaf0, #ead7b0)',
      faceBorder: dark ? 'rgba(254,240,138,0.16)' : 'rgba(120,76,28,0.18)',
      faceShadow: dark
        ? 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -26px 34px rgba(0,0,0,0.38)'
        : 'inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -20px 28px rgba(146,93,32,0.18)',
      glare: dark
        ? 'linear-gradient(135deg, rgba(255,248,220,0.08), transparent 46%)'
        : 'linear-gradient(135deg, rgba(255,255,255,0.72), transparent 44%)',
      marker: dark ? 'rgba(254,240,138,0.22)' : 'rgba(74,51,31,0.22)',
      majorMarker: dark ? 'rgba(254,240,138,0.76)' : 'rgba(74,51,31,0.72)',
      numeral: dark ? 'rgba(255,247,214,0.9)' : 'rgba(55,39,24,0.92)',
      numeralMode: 'roman',
      numeralFontClass: 'font-display',
      hourHand: dark ? '#fef3c7' : '#332416',
      minuteHand: dark ? '#bfdbfe' : '#1d3b63',
      secondHand: dark ? '#f87171' : '#991b1b',
      handShadow: dark ? '0 3px 8px rgba(0,0,0,0.52)' : '0 2px 6px rgba(74,51,31,0.2)',
      capOuter: dark ? '#fef3c7' : '#332416',
      capInner: dark ? '#bfdbfe' : '#1d3b63',
      innerRing: dark ? 'rgba(254,240,138,0.12)' : 'rgba(120,76,28,0.14)',
      label: dark ? 'rgba(255,247,214,0.52)' : 'rgba(74,51,31,0.5)',
      accent: dark ? '#bfdbfe' : '#1d3b63',
    },
    railway: {
      shellBg: dark ? 'rgba(15,23,42,0.54)' : 'rgba(255,255,255,0.78)',
      shellBorder: dark ? 'rgba(226,232,240,0.1)' : 'rgba(15,23,42,0.08)',
      shellShadow: dark ? '0 26px 70px rgba(2,6,23,0.58)' : '0 22px 50px rgba(15,23,42,0.12)',
      aura: dark ? 'rgba(248,250,252,0.18)' : 'rgba(15,23,42,0.08)',
      caseBg: dark
        ? 'linear-gradient(145deg, #1f2937, #030712)'
        : 'linear-gradient(145deg, #ffffff, #dfe4ea)',
      caseBorder: dark ? 'rgba(226,232,240,0.16)' : 'rgba(15,23,42,0.12)',
      caseShadow: dark
        ? '0 22px 54px rgba(0,0,0,0.56), inset 0 1px 0 rgba(255,255,255,0.1)'
        : '0 18px 38px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.98)',
      faceBg: dark
        ? 'radial-gradient(circle at 35% 18%, rgba(255,255,255,0.1), transparent 28%), linear-gradient(180deg, #111827, #020617)'
        : 'radial-gradient(circle at 34% 18%, rgba(255,255,255,0.96), rgba(255,255,255,0.62) 28%, transparent 46%), linear-gradient(180deg, #ffffff, #eef2f5)',
      faceBorder: dark ? 'rgba(226,232,240,0.12)' : 'rgba(15,23,42,0.1)',
      faceShadow: dark
        ? 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -24px 34px rgba(0,0,0,0.36)'
        : 'inset 0 1px 0 rgba(255,255,255,1), inset 0 -20px 28px rgba(148,163,184,0.18)',
      glare: dark
        ? 'linear-gradient(135deg, rgba(255,255,255,0.1), transparent 44%)'
        : 'linear-gradient(135deg, rgba(255,255,255,0.72), transparent 42%)',
      marker: dark ? 'rgba(241,245,249,0.36)' : 'rgba(15,23,42,0.36)',
      majorMarker: dark ? 'rgba(248,250,252,0.9)' : 'rgba(2,6,23,0.82)',
      numeral: dark ? 'rgba(248,250,252,0.88)' : 'rgba(2,6,23,0.86)',
      numeralMode: 'none',
      numeralFontClass: 'font-headline',
      hourHand: dark ? '#f8fafc' : '#020617',
      minuteHand: dark ? '#e2e8f0' : '#111827',
      secondHand: dark ? '#fb7185' : '#dc2626',
      handShadow: dark ? '0 3px 8px rgba(0,0,0,0.52)' : '0 2px 6px rgba(15,23,42,0.18)',
      capOuter: dark ? '#f8fafc' : '#020617',
      capInner: dark ? '#fb7185' : '#dc2626',
      innerRing: dark ? 'rgba(226,232,240,0.1)' : 'rgba(15,23,42,0.08)',
      label: dark ? 'rgba(226,232,240,0.52)' : 'rgba(15,23,42,0.46)',
      accent: dark ? '#fb7185' : '#dc2626',
    },
    marine: {
      shellBg: dark ? 'rgba(8,18,34,0.58)' : 'rgba(250,247,238,0.82)',
      shellBorder: dark ? 'rgba(125,211,252,0.14)' : 'rgba(120,76,28,0.12)',
      shellShadow: dark ? '0 28px 76px rgba(2,8,23,0.62)' : '0 24px 54px rgba(120,76,28,0.15)',
      aura: dark ? 'rgba(125,211,252,0.18)' : 'rgba(120,76,28,0.09)',
      caseBg: dark
        ? 'linear-gradient(145deg, #263852, #07111f)'
        : 'linear-gradient(145deg, #d8bb79, #8f6a34)',
      caseBorder: dark ? 'rgba(186,230,253,0.18)' : 'rgba(120,76,28,0.2)',
      caseShadow: dark
        ? '0 24px 58px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.1)'
        : '0 18px 38px rgba(120,76,28,0.24), inset 0 1px 0 rgba(255,252,242,0.92)',
      faceBg: dark
        ? 'radial-gradient(circle at 36% 18%, rgba(125,211,252,0.12), transparent 28%), linear-gradient(180deg, #101f33, #030812)'
        : 'radial-gradient(circle at 36% 18%, rgba(255,255,255,0.94), rgba(255,255,255,0.48) 28%, transparent 46%), linear-gradient(180deg, #fffaf0, #ece1c8)',
      faceBorder: dark ? 'rgba(186,230,253,0.12)' : 'rgba(120,76,28,0.16)',
      faceShadow: dark
        ? 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -26px 34px rgba(0,0,0,0.4)'
        : 'inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -20px 28px rgba(120,76,28,0.16)',
      glare: dark
        ? 'linear-gradient(135deg, rgba(255,255,255,0.09), transparent 44%)'
        : 'linear-gradient(135deg, rgba(255,255,255,0.72), transparent 42%)',
      marker: dark ? 'rgba(186,230,253,0.22)' : 'rgba(20,48,80,0.22)',
      majorMarker: dark ? 'rgba(224,242,254,0.8)' : 'rgba(12,38,66,0.74)',
      numeral: dark ? 'rgba(224,242,254,0.9)' : 'rgba(12,38,66,0.9)',
      numeralMode: 'arabic',
      numeralFontClass: 'font-headline',
      hourHand: dark ? '#f8fafc' : '#10243c',
      minuteHand: dark ? '#bae6fd' : '#173f67',
      secondHand: dark ? '#fbbf24' : '#b45309',
      handShadow: dark ? '0 3px 8px rgba(0,0,0,0.52)' : '0 2px 6px rgba(20,48,80,0.2)',
      capOuter: dark ? '#e0f2fe' : '#10243c',
      capInner: dark ? '#fbbf24' : '#b45309',
      innerRing: dark ? 'rgba(186,230,253,0.12)' : 'rgba(120,76,28,0.12)',
      label: dark ? 'rgba(224,242,254,0.5)' : 'rgba(12,38,66,0.48)',
      accent: dark ? '#fbbf24' : '#b45309',
    },
    modern: {
      shellBg: dark ? 'rgba(13,17,29,0.48)' : 'rgba(255,255,255,0.72)',
      shellBorder: dark ? 'rgba(99,102,241,0.16)' : 'rgba(99,102,241,0.1)',
      shellShadow: dark ? '0 28px 72px rgba(2,6,23,0.56)' : '0 22px 52px rgba(99,102,241,0.16)',
      aura: dark ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.16)',
      caseBg: dark
        ? 'linear-gradient(145deg, rgba(42,53,78,0.96), rgba(13,17,29,0.98))'
        : 'linear-gradient(145deg, rgba(255,255,255,0.98), rgba(225,230,255,0.96))',
      caseBorder: dark ? 'rgba(165,180,252,0.16)' : 'rgba(129,140,248,0.12)',
      caseShadow: dark
        ? '0 24px 56px rgba(1,4,20,0.58), inset 0 1px 0 rgba(255,255,255,0.12)'
        : '0 18px 42px rgba(129,140,248,0.2), inset 0 1px 0 rgba(255,255,255,0.96)',
      faceBg: dark
        ? 'radial-gradient(circle at 34% 18%, rgba(165,180,252,0.18), transparent 26%), linear-gradient(180deg, rgba(19,28,45,0.98), rgba(9,12,20,1))'
        : 'radial-gradient(circle at 34% 18%, rgba(255,255,255,0.96), rgba(255,255,255,0.6) 26%, transparent 46%), linear-gradient(180deg, #f9fbff, #e9eeff)',
      faceBorder: dark ? 'rgba(165,180,252,0.12)' : 'rgba(129,140,248,0.12)',
      faceShadow: dark
        ? 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -28px 36px rgba(0,0,0,0.32)'
        : 'inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -24px 32px rgba(129,140,248,0.14)',
      glare: dark
        ? 'linear-gradient(135deg, rgba(255,255,255,0.12), transparent 42%)'
        : 'linear-gradient(135deg, rgba(255,255,255,0.92), transparent 40%)',
      marker: dark ? 'rgba(191,219,254,0.2)' : 'rgba(79,70,229,0.18)',
      majorMarker: dark ? 'rgba(224,231,255,0.76)' : 'rgba(79,70,229,0.52)',
      numeral: dark ? 'rgba(248,250,252,0.88)' : 'rgba(67,56,202,0.76)',
      numeralMode: 'cardinal',
      numeralFontClass: 'font-headline',
      hourHand: dark ? '#ffffff' : '#111827',
      minuteHand: dark ? '#dbeafe' : '#312e81',
      secondHand: dark ? '#7dd3fc' : '#0284c7',
      handShadow: dark ? '0 4px 10px rgba(0,0,0,0.58)' : '0 2px 8px rgba(67,56,202,0.16)',
      capOuter: dark ? '#e0e7ff' : '#312e81',
      capInner: dark ? '#7dd3fc' : '#38bdf8',
      innerRing: dark ? 'rgba(165,180,252,0.1)' : 'rgba(99,102,241,0.1)',
      label: dark ? 'rgba(224,231,255,0.58)' : 'rgba(67,56,202,0.44)',
      accent: dark ? '#7dd3fc' : '#0284c7',
    },
    instrument: {
      shellBg: dark ? 'rgba(10,12,14,0.56)' : 'rgba(245,247,248,0.78)',
      shellBorder: dark ? 'rgba(34,197,94,0.12)' : 'rgba(31,41,55,0.08)',
      shellShadow: dark ? '0 28px 70px rgba(0,0,0,0.66)' : '0 22px 52px rgba(31,41,55,0.14)',
      aura: dark ? 'rgba(34,197,94,0.16)' : 'rgba(31,41,55,0.12)',
      caseBg: dark
        ? 'linear-gradient(145deg, rgba(42,44,47,0.98), rgba(9,10,12,1))'
        : 'linear-gradient(145deg, rgba(229,231,235,0.98), rgba(209,213,219,0.96))',
      caseBorder: dark ? 'rgba(255,255,255,0.09)' : 'rgba(31,41,55,0.12)',
      caseShadow: dark
        ? '0 22px 58px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.08)'
        : '0 18px 40px rgba(31,41,55,0.18), inset 0 1px 0 rgba(255,255,255,0.92)',
      faceBg: dark
        ? 'radial-gradient(circle at 38% 18%, rgba(34,197,94,0.12), transparent 24%), linear-gradient(180deg, #17191c, #0b0d0f)'
        : 'radial-gradient(circle at 38% 18%, rgba(255,255,255,0.8), transparent 24%), linear-gradient(180deg, #f8fafc, #dfe5ea)',
      faceBorder: dark ? 'rgba(255,255,255,0.08)' : 'rgba(31,41,55,0.12)',
      faceShadow: dark
        ? 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -28px 40px rgba(0,0,0,0.45)'
        : 'inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -24px 32px rgba(148,163,184,0.24)',
      glare: dark
        ? 'linear-gradient(135deg, rgba(255,255,255,0.08), transparent 42%)'
        : 'linear-gradient(135deg, rgba(255,255,255,0.88), transparent 40%)',
      marker: dark ? 'rgba(187,247,208,0.22)' : 'rgba(31,41,55,0.2)',
      majorMarker: dark ? 'rgba(220,252,231,0.82)' : 'rgba(17,24,39,0.72)',
      numeral: dark ? 'rgba(220,252,231,0.88)' : 'rgba(17,24,39,0.84)',
      numeralMode: 'cardinal',
      numeralFontClass: 'font-headline',
      hourHand: dark ? '#f9fafb' : '#111827',
      minuteHand: dark ? '#dcfce7' : '#1f2937',
      secondHand: dark ? '#fb7185' : '#be123c',
      handShadow: dark ? '0 4px 10px rgba(0,0,0,0.62)' : '0 2px 8px rgba(31,41,55,0.2)',
      capOuter: dark ? '#dcfce7' : '#111827',
      capInner: dark ? '#fb7185' : '#be123c',
      innerRing: dark ? 'rgba(220,252,231,0.1)' : 'rgba(31,41,55,0.08)',
      label: dark ? 'rgba(220,252,231,0.52)' : 'rgba(31,41,55,0.52)',
      accent: dark ? '#86efac' : '#111827',
    },
  };

  return tokens[design];
};

const AnalogClockWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const actionSlot = useContext(DashboardWidgetActionSlotContext);
  const editMode = useContext(DashboardWidgetEditModeContext);
  const globalShowSeconds = useClockShowSeconds();
  const design = (widget.config?.clockDesign || 'modern') as DashboardClockDesign;
  const showSeconds = widget.config?.showSecondsHand ?? globalShowSeconds;

  const now = useSyncedDashboardTime(showSeconds ? 'second' : 'minute');
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [tapReveal, setTapReveal] = useState(false);
  const hideChromeTimerRef = useRef<number | null>(null);

  const clearHideChromeTimer = useCallback(() => {
    if (!hideChromeTimerRef.current) return;
    window.clearTimeout(hideChromeTimerRef.current);
    hideChromeTimerRef.current = null;
  }, []);

  const revealChrome = useCallback((durationMs = 2200) => {
    clearHideChromeTimer();
    setTapReveal(true);
    hideChromeTimerRef.current = window.setTimeout(() => {
      setTapReveal(false);
      hideChromeTimerRef.current = null;
    }, durationMs);
  }, [clearHideChromeTimer]);

  useEffect(() => () => clearHideChromeTimer(), [clearHideChromeTimer]);

  const chromeVisible = editMode || hovered || focusWithin || tapReveal;
  const compactChrome = size.pixelWidth < 270 || size.pixelHeight < 270;
  const decorativeChromeVisible = chromeVisible && !compactChrome;
  const dial = useMemo(() => getDialTokens(design, theme.dark), [design, theme.dark]);

  const time = useMemo(() => {
    const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
    const minutes = now.getMinutes() + seconds / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    return {
      hourDeg: hours * 30,
      minuteDeg: minutes * 6,
      secondDeg: seconds * 6,
    };
  }, [now]);

  const faceDiameter = useMemo(() => {
    const framePadding = chromeVisible ? (compactChrome ? 20 : 34) : 14;
    const available = Math.min(size.pixelWidth, size.pixelHeight) - framePadding;
    return clamp(available, 108, Math.max(108, Math.min(size.pixelWidth, size.pixelHeight)));
  }, [chromeVisible, compactChrome, size.pixelHeight, size.pixelWidth]);

  const compactFace = faceDiameter < 170 || size.sizeClass === 'tiny';
  const fullNumeralThreshold = design === 'classical_black_white' ? 148 : 210;
  const showFullNumerals = faceDiameter >= fullNumeralThreshold && !compactFace;
  const showHeaderLabel = decorativeChromeVisible && size.pixelWidth >= 180;
  const showHeaderMeta = decorativeChromeVisible && size.pixelWidth >= 250 && size.pixelHeight >= 190;
  const auraOpacity = theme.dark && decorativeChromeVisible ? 0.8 : 0;

  const hourLength = faceDiameter * 0.24;
  const minuteLength = faceDiameter * 0.35;
  const secondLength = faceDiameter * 0.39;
  const secondTailLength = faceDiameter * 0.08;
  const centerOuter = Math.max(10, faceDiameter * 0.08);
  const centerInner = Math.max(4, faceDiameter * 0.036);

  return (
    <WidgetBody
      gap="none"
      align="center"
      tabIndex={0}
      role="img"
      aria-label={`Analog clock showing ${formatAriaTime(now)}`}
      onPointerEnter={() => {
        clearHideChromeTimer();
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
      onPointerDown={() => {
        revealChrome();
      }}
      onFocusCapture={() => {
        clearHideChromeTimer();
        setFocusWithin(true);
      }}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }
        setFocusWithin(false);
      }}
      className={`group relative items-center justify-center rounded-[inherit] outline-none transition-[transform] duration-300 ${
        chromeVisible ? 'scale-[1.004]' : ''
      } focus-visible:ring-2 focus-visible:ring-[var(--ether-primary)]/35 focus-visible:ring-offset-0`}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-all duration-300"
        style={{
          opacity: decorativeChromeVisible ? 1 : 0,
          background: `linear-gradient(180deg, ${dial.shellBg}, transparent 24%, transparent 76%, ${dial.shellBg})`,
          border: `1px solid ${dial.shellBorder}`,
          boxShadow: dial.shellShadow,
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
        }}
      />

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 rounded-full blur-[42px] transition-all duration-500"
        style={{
          width: faceDiameter * 0.92,
          height: faceDiameter * 0.92,
          transform: 'translate(-50%, -50%)',
          opacity: auraOpacity,
          background: `radial-gradient(circle, ${dial.aura} 0%, transparent 72%)`,
        }}
      />

      {showHeaderLabel && (
        <div className="pointer-events-none absolute left-4 top-4 z-20 sm:left-5 sm:top-5">
          <WidgetText
            as="div"
            variant="label"
            tone="muted"
            className="tracking-[0.24em] text-[var(--ether-on-surface-variant)]"
          >
            {formatDesignLabel(design)}
          </WidgetText>
          {showHeaderMeta && (
            <WidgetText
              as="div"
              variant="caption"
              tone="default"
              className="mt-1 font-medium text-[var(--ether-on-surface)]"
            >
              Analog clock
            </WidgetText>
          )}
        </div>
      )}

      {actionSlot && (
        <div
          className={`absolute right-3 top-3 z-30 transition-all duration-250 sm:right-4 sm:top-4 ${
            chromeVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
          }`}
        >
          {actionSlot}
        </div>
      )}

      <div
        className="relative z-10 shrink-0 rounded-full"
        style={{
          width: faceDiameter,
          height: faceDiameter,
          background: dial.caseBg,
          border: `1px solid ${dial.caseBorder}`,
          boxShadow: dial.caseShadow,
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: faceDiameter * 0.92,
            height: faceDiameter * 0.92,
            transform: 'translate(-50%, -50%)',
            background: dial.faceBg,
            border: `1px solid ${dial.faceBorder}`,
            boxShadow: dial.faceShadow,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ background: dial.glare, opacity: chromeVisible ? 0.9 : 0.72 }}
          />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: '74%',
              height: '74%',
              transform: 'translate(-50%, -50%)',
              border: `1px solid ${dial.innerRing}`,
            }}
          />

          {dial.numeralMode === 'none' && Array.from({ length: 12 }).map((_, index) => {
            const angle = index * 30;
            const isCardinal = index % 3 === 0;
            const tickHeight = isCardinal ? faceDiameter * 0.078 : faceDiameter * 0.056;
            const tickWidth = isCardinal ? Math.max(2.8, faceDiameter * 0.016) : Math.max(2, faceDiameter * 0.011);

            return (
              <div
                key={`tick-${index}`}
                className="pointer-events-none absolute left-1/2 top-0 h-1/2 -translate-x-1/2 origin-bottom"
                style={{ transform: `rotate(${angle}deg)` }}
              >
                <div
                  className="rounded-full"
                  style={{
                    width: tickWidth,
                    height: tickHeight,
                    marginTop: faceDiameter * 0.053,
                    background: isCardinal ? dial.majorMarker : dial.marker,
                    boxShadow: isCardinal ? `0 0 8px ${dial.aura}` : undefined,
                  }}
                />
              </div>
            );
          })}

          {Array.from({ length: 12 }).map((_, index) => {
            if (dial.numeralMode === 'none') return null;
            if (dial.numeralMode === 'cardinal' && !CARDINAL_NUMERALS.has(index)) return null;
            if (dial.numeralMode !== 'cardinal' && !showFullNumerals && !CARDINAL_NUMERALS.has(index)) return null;

            const label = dial.numeralMode === 'roman'
              ? ROMAN_NUMERALS[index]
              : dial.numeralMode === 'arabic'
                ? ARABIC_NUMERALS[index]
                : CARDINAL_NUMERALS.get(index) || '';

            const angle = index * 30;
            const radius = faceDiameter * (dial.numeralMode === 'roman' ? 0.35 : 0.34);
            const fontSize = dial.numeralMode === 'roman'
              ? faceDiameter * 0.078
              : faceDiameter * 0.09;

            return (
              <div
                key={`numeral-${index}`}
                className={`pointer-events-none absolute left-1/2 top-1/2 flex h-0 w-0 items-center justify-center ${dial.numeralFontClass}`}
                style={{
                  transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}px) rotate(-${angle}deg)`,
                  color: dial.numeral,
                  fontSize,
                  letterSpacing: dial.numeralMode === 'roman' ? '0.04em' : '0',
                  fontWeight: dial.numeralMode === 'roman' ? 600 : 700,
                }}
              >
                {label}
              </div>
            );
          })}

          <div
            className="pointer-events-none absolute left-1/2 top-1/2"
            style={{
              width: Math.max(6, faceDiameter * 0.024),
              height: hourLength,
              background: dial.hourHand,
              borderRadius: 999,
              transformOrigin: '50% 100%',
              transform: `translate(-50%, -100%) rotate(${time.hourDeg}deg)`,
              boxShadow: dial.handShadow,
            }}
          />

          <div
            className="pointer-events-none absolute left-1/2 top-1/2"
            style={{
              width: Math.max(3.4, faceDiameter * 0.016),
              height: minuteLength,
              background: dial.minuteHand,
              borderRadius: 999,
              transformOrigin: '50% 100%',
              transform: `translate(-50%, -100%) rotate(${time.minuteDeg}deg)`,
              boxShadow: dial.handShadow,
            }}
          />

          {showSeconds && (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2"
              style={{
                width: Math.max(1.5, faceDiameter * 0.007),
                height: secondLength + secondTailLength,
                background: dial.secondHand,
                borderRadius: 999,
                transformOrigin: `50% ${secondLength}px`,
                transform: `translate(-50%, -${secondLength}px) rotate(${time.secondDeg}deg)`,
                boxShadow: `0 0 12px ${dial.aura}`,
                transition: 'transform 180ms linear',
              }}
            >
              <div
                className="absolute left-1/2 rounded-full"
                style={{
                  width: Math.max(7, faceDiameter * 0.038),
                  height: Math.max(7, faceDiameter * 0.038),
                  bottom: secondTailLength + faceDiameter * 0.045,
                  transform: 'translateX(-50%)',
                  background: dial.secondHand,
                }}
              />
            </div>
          )}

          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: centerOuter,
              height: centerOuter,
              background: dial.capOuter,
              boxShadow: dial.handShadow,
            }}
          />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: centerInner,
              height: centerInner,
              background: dial.capInner,
            }}
          />

        </div>
      </div>
    </WidgetBody>
  );
};

export default React.memo(AnalogClockWidget);
