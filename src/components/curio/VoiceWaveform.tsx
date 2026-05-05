import React, { useEffect, useRef, useCallback } from 'react';
import { getVolume } from '../../services/volumeStore';

interface VoiceWaveformProps {
  isSpeaking: boolean;
  isConnected: boolean;
  className?: string;
  lowPowerMode?: boolean;
  performanceMode?: boolean;
}

const TAU = Math.PI * 2;

// --- Colorful frequency bar config ---
const BAR_COUNT = 64;
const BAR_COUNT_LOW = 32;

// --- Particle system ---
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  life: number;
  maxLife: number;
  size: number;
}

const MAX_PARTICLES = 40;
const MAX_PARTICLES_LOW = 12;

// --- Ribbon config (kept from original, enhanced colors) ---
interface Ribbon {
  hue: number;
  hueShift: number;
  speed: number;
  frequency: number;
  amplitudeIdle: number;
  amplitudeSpeaking: number;
  phase: number;
  yOffset: number;
  thickness: number;
  opacity: number;
}

const RIBBONS: Ribbon[] = [
  { hue: 0, hueShift: 60, speed: 0.18, frequency: 0.6, amplitudeIdle: 4, amplitudeSpeaking: 22, phase: 0, yOffset: 0, thickness: 2.8, opacity: 0.4 },
  { hue: 60, hueShift: 50, speed: 0.24, frequency: 0.85, amplitudeIdle: 3, amplitudeSpeaking: 18, phase: 1.2, yOffset: 3, thickness: 2.2, opacity: 0.35 },
  { hue: 120, hueShift: 40, speed: 0.2, frequency: 1.05, amplitudeIdle: 3.5, amplitudeSpeaking: 20, phase: 2.5, yOffset: -2, thickness: 2, opacity: 0.3 },
  { hue: 200, hueShift: 45, speed: 0.28, frequency: 1.25, amplitudeIdle: 2, amplitudeSpeaking: 15, phase: 3.8, yOffset: 5, thickness: 1.8, opacity: 0.25 },
  { hue: 280, hueShift: 55, speed: 0.15, frequency: 0.45, amplitudeIdle: 5, amplitudeSpeaking: 26, phase: 5.0, yOffset: -4, thickness: 3.2, opacity: 0.2 },
  { hue: 330, hueShift: 35, speed: 0.3, frequency: 1.5, amplitudeIdle: 1.5, amplitudeSpeaking: 12, phase: 6.2, yOffset: 2, thickness: 1.5, opacity: 0.18 },
];

const RIBBONS_LOW = RIBBONS.slice(0, 3);

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const VoiceWaveformComponent: React.FC<VoiceWaveformProps> = ({
  isSpeaking,
  isConnected,
  className = '',
  lowPowerMode,
  performanceMode = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const amplitudeRef = useRef(0);
  const targetAmplitudeRef = useRef(0);
  const timeRef = useRef(0);
  const isVisibleRef = useRef(false);
  const lowPower = lowPowerMode ?? performanceMode;
  const isSpeakingRef = useRef(isSpeaking);
  const cachedSizeRef = useRef({ w: 0, h: 0 });
  const pointBufRef = useRef<Float32Array>(new Float32Array(512));
  const particlesRef = useRef<Particle[]>([]);
  // Reusable per-bar height buffer to avoid per-frame allocation
  const barBufRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));

  const isVisible = isConnected;
  isVisibleRef.current = isVisible;
  isSpeakingRef.current = isSpeaking;

  useEffect(() => {
    if (!isSpeaking) {
      targetAmplitudeRef.current = 0.15;
    }
  }, [isSpeaking]);

  const draw = useCallback(() => {
    if (!isVisibleRef.current && amplitudeRef.current < 0.02) {
      rafRef.current = 0;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

    const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 2);
    let w = cachedSizeRef.current.w;
    let h = cachedSizeRef.current.h;
    if (w === 0 || h === 0) {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      cachedSizeRef.current = { w, h };
    }

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    const dt = lowPower ? 0.02 : 0.014;
    timeRef.current += dt;
    const t = timeRef.current;

    if (isSpeakingRef.current) {
      const vol = getVolume();
      // If volume store has data (Gemini/Nova), use it.
      // Otherwise (offline/HA/text-only), simulate a gentle pulse.
      if (vol > 0.01) {
        targetAmplitudeRef.current = 0.25 + vol * 0.75;
      } else {
        // Organic pulsing between 0.4 and 0.75 for backends without volume data
        targetAmplitudeRef.current = 0.55 + Math.sin(t * 2.5) * 0.15 + Math.sin(t * 1.3) * 0.08;
      }
    }

    amplitudeRef.current = lerp(amplitudeRef.current, targetAmplitudeRef.current, 0.04);
    const amp = amplitudeRef.current;

    ctx.clearRect(0, 0, w, h);

    // === 1. COLORFUL FREQUENCY BARS (bottom layer) ===
    const barCount = lowPower ? BAR_COUNT_LOW : BAR_COUNT;
    const barGap = 2;
    const totalBarWidth = w - barGap * (barCount - 1);
    const barW = Math.max(totalBarWidth / barCount, 2);
    const maxBarH = h * 0.7;
    const baseY = h;

    // Grow bar buffer if needed
    if (barBufRef.current.length < barCount) {
      barBufRef.current = new Float32Array(barCount);
    }
    const barBuf = barBufRef.current;

    // Compute bar heights into reusable buffer
    for (let i = 0; i < barCount; i++) {
      const nx = i / (barCount - 1);
      // Multiple sine waves for organic frequency-like movement
      const wave1 = Math.sin(nx * TAU * 2.0 + t * 1.8) * 0.4;
      const wave2 = Math.sin(nx * TAU * 3.5 + t * 2.5 + 1.0) * 0.25;
      const wave3 = Math.sin(nx * TAU * 1.2 + t * 0.9 + 2.5) * 0.2;
      const wave4 = Math.sin(nx * TAU * 5.0 + t * 3.2) * 0.15 * amp;
      // Center-weighted envelope so bars are taller in the middle
      const envelope = 0.3 + 0.7 * Math.sin(nx * Math.PI);
      const rawH = (0.08 + (wave1 + wave2 + wave3 + wave4 + 1.0) * 0.5 * amp) * envelope;
      barBuf[i] = Math.max(rawH * maxBarH, 2);
    }

    for (let i = 0; i < barCount; i++) {
      const nx = i / (barCount - 1);
      const barH = barBuf[i];
      const x = i * (barW + barGap);

      // Rainbow hue that shifts over time
      const hue = (nx * 300 + t * 40) % 360;
      const sat = 80 + amp * 15;
      const light = 55 + amp * 15;

      // Glow behind bar
      if (!lowPower) {
        ctx.shadowColor = `hsla(${hue}, ${sat}%, ${light}%, ${0.4 * amp})`;
        ctx.shadowBlur = 8 + amp * 12;
      }

      // Bar gradient (vertical)
      const grad = ctx.createLinearGradient(x, baseY, x, baseY - barH);
      grad.addColorStop(0, `hsla(${hue}, ${sat}%, ${light - 10}%, ${0.6 + amp * 0.3})`);
      grad.addColorStop(0.5, `hsla(${(hue + 30) % 360}, ${sat + 5}%, ${light + 5}%, ${0.7 + amp * 0.25})`);
      grad.addColorStop(1, `hsla(${(hue + 60) % 360}, ${sat}%, ${light + 15}%, ${0.3 + amp * 0.2})`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      const radius = Math.min(barW * 0.4, barH * 0.3, 4);
      // Rounded top rect
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, baseY - barH + radius);
      ctx.quadraticCurveTo(x, baseY - barH, x + radius, baseY - barH);
      ctx.lineTo(x + barW - radius, baseY - barH);
      ctx.quadraticCurveTo(x + barW, baseY - barH, x + barW, baseY - barH + radius);
      ctx.lineTo(x + barW, baseY);
      ctx.closePath();
      ctx.fill();

      // Reset shadow
      if (!lowPower) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
    }

    // === 2. FLOATING PARTICLES (middle layer) ===
    const particles = particlesRef.current;
    const maxP = lowPower ? MAX_PARTICLES_LOW : MAX_PARTICLES;

    // Spawn particles when speaking
    if (amp > 0.2 && particles.length < maxP) {
      const spawnRate = lowPower ? 0.3 : 0.7;
      if (Math.random() < spawnRate * amp) {
        particles.push({
          x: Math.random() * w,
          y: baseY - Math.random() * maxBarH * amp * 0.6,
          vx: (Math.random() - 0.5) * 1.5,
          vy: -(0.5 + Math.random() * 1.5) * (0.5 + amp),
          hue: (Math.random() * 360 + t * 20) % 360,
          life: 1,
          maxLife: 0.6 + Math.random() * 0.8,
          size: 2 + Math.random() * 3 * amp,
        });
      }
    }

    // Update and draw particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt * (1 / p.maxLife);
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vy -= 0.02; // slight upward drift
      const alpha = p.life * (0.4 + amp * 0.4);

      if (!lowPower) {
        ctx.shadowColor = `hsla(${p.hue}, 90%, 70%, ${alpha * 0.6})`;
        ctx.shadowBlur = 6;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, TAU);
      ctx.fillStyle = `hsla(${p.hue}, 90%, 75%, ${alpha})`;
      ctx.fill();

      if (!lowPower) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
    }

    // === 3. AURORA RIBBONS (top layer) ===
    const ribbons = lowPower ? RIBBONS_LOW : RIBBONS;
    const ribbonBaseY = h * 0.55;
    const step = lowPower ? 4 : 2;

    const pointCount = Math.floor(w / step) + 1;
    if (pointBufRef.current.length < pointCount * 2) {
      pointBufRef.current = new Float32Array(pointCount * 2 * 2);
    }
    const buf = pointBufRef.current;

    for (let ri = 0; ri < ribbons.length; ri++) {
      const r = ribbons[ri];
      const waveAmp = lerp(r.amplitudeIdle, r.amplitudeSpeaking, amp);
      // Rainbow-cycling hue instead of static
      const hue = (r.hue + t * 15 + Math.sin(t * 0.15 + r.phase) * r.hueShift) % 360;
      const alpha = r.opacity * (0.5 + amp * 0.5);

      let pi = 0;
      for (let x = 0; x <= w; x += step) {
        const nx = x / w;
        const y1 = Math.sin(nx * TAU * r.frequency + t * r.speed + r.phase) * waveAmp;
        const y2 = Math.sin(nx * TAU * (r.frequency * 0.6) + t * r.speed * 1.4 + r.phase + 2.0) * waveAmp * 0.35;
        const y3 = Math.sin(nx * TAU * (r.frequency * 1.8) + t * r.speed * 0.7 + r.phase + 4.0) * waveAmp * 0.15;
        buf[pi++] = x;
        buf[pi++] = ribbonBaseY + r.yOffset + y1 + y2 + y3;
      }
      const pointsLen = pi;

      // Glow layer
      if (!lowPower) {
        ctx.beginPath();
        ctx.moveTo(buf[0], buf[1]);
        for (let i = 2; i < pointsLen; i += 2) ctx.lineTo(buf[i], buf[i + 1]);
        ctx.strokeStyle = `hsla(${hue}, 85%, 70%, ${alpha * 0.35})`;
        ctx.lineWidth = r.thickness * 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      // Rainbow gradient along the ribbon
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      const h0 = hue;
      const h1 = (hue + 40) % 360;
      const h2 = (hue + 80) % 360;
      const h3 = (hue + 120) % 360;
      grad.addColorStop(0, `hsla(${h0}, 90%, 65%, ${alpha * 0.3})`);
      grad.addColorStop(0.25, `hsla(${h1}, 85%, 72%, ${alpha})`);
      grad.addColorStop(0.5, `hsla(${h2}, 95%, 78%, ${alpha * 1.2})`);
      grad.addColorStop(0.75, `hsla(${h3}, 85%, 72%, ${alpha})`);
      grad.addColorStop(1, `hsla(${h0}, 90%, 65%, ${alpha * 0.3})`);

      ctx.beginPath();
      ctx.moveTo(buf[0], buf[1]);
      for (let i = 2; i < pointsLen; i += 2) ctx.lineTo(buf[i], buf[i + 1]);
      ctx.strokeStyle = grad;
      ctx.lineWidth = r.thickness * (0.7 + amp * 0.5);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    // === 4. CENTER GLOW PULSE ===
    if (!lowPower) {
      const glowRadius = 40 + amp * 80;
      const cx = w * 0.5;
      const cy = h * 0.5;
      const glowHue = (t * 30) % 360;
      const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      glowGrad.addColorStop(0, `hsla(${glowHue}, 90%, 75%, ${0.12 * amp})`);
      glowGrad.addColorStop(0.4, `hsla(${(glowHue + 60) % 360}, 85%, 70%, ${0.06 * amp})`);
      glowGrad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, w, h);
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [lowPower]);

  // Start/stop RAF based on visibility
  useEffect(() => {
    if (isVisible && !rafRef.current) {
      rafRef.current = requestAnimationFrame(draw);
    }
    if (!isVisible) {
      targetAmplitudeRef.current = 0;
    }
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [isVisible, draw]);

  // Pause when tab hidden
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
      } else if (!document.hidden && isVisibleRef.current && !rafRef.current) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [draw]);

  // Invalidate cached canvas size on resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      cachedSizeRef.current = { w: 0, h: 0 };
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={`relative w-full h-32 overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full z-10 pointer-events-none transition-opacity duration-[1500ms] ease-in-out"
        style={{ opacity: isConnected ? 1 : 0 }}
      />
    </div>
  );
};

export const VoiceWaveform = React.memo(VoiceWaveformComponent);
VoiceWaveform.displayName = 'VoiceWaveform';
