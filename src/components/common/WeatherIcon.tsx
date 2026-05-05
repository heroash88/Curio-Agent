import React from 'react';

export const AnimatedWeatherIcon = ({ icon, size = 48 }: { icon: string; size?: number }) => {
    const s = size;
    const styles: Record<string, React.ReactNode> = {
        sun: (
            <svg width={s} height={s} viewBox="0 0 48 48">
                <defs>
                    <radialGradient id="sunGrad" cx="50%" cy="45%" r="50%">
                        <stop offset="0%" stopColor="#FDE68A" />
                        <stop offset="60%" stopColor="#FBBF24" />
                        <stop offset="100%" stopColor="#F59E0B" />
                    </radialGradient>
                </defs>
                {/* Rays */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
                    <line
                        key={i}
                        x1="24" y1={24 - 18} x2="24" y2={24 - 14}
                        stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round"
                        transform={`rotate(${angle} 24 24)`}
                    >
                        <animate attributeName="opacity" values="0.5;1;0.5" dur="2.5s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
                    </line>
                ))}
                {/* Sun body */}
                <circle cx="24" cy="24" r="10" fill="url(#sunGrad)">
                    <animate attributeName="r" values="10;11;10" dur="3s" repeatCount="indefinite" />
                </circle>
                {/* Highlight */}
                <circle cx="21" cy="21" r="4" fill="#FEF3C7" opacity="0.6" />
            </svg>
        ),
        moon: (
            <svg width={s} height={s} viewBox="0 0 48 48">
                <defs>
                    <radialGradient id="moonGrad" cx="40%" cy="40%" r="55%">
                        <stop offset="0%" stopColor="#E2E8F0" />
                        <stop offset="100%" stopColor="#94A3B8" />
                    </radialGradient>
                </defs>
                <path d="M28 8a16 16 0 1 0 12 28A13 13 0 0 1 28 8z" fill="url(#moonGrad)">
                    <animate attributeName="opacity" values="0.85;1;0.85" dur="4s" repeatCount="indefinite" />
                </path>
                {[{ x: 35, y: 11, r: 1.5 }, { x: 39, y: 19, r: 1 }, { x: 37, y: 26, r: 0.8 }].map((star, i) => (
                    <circle key={i} cx={star.x} cy={star.y} r={star.r} fill="#FBBF24">
                        <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" begin={`${i * 0.6}s`} repeatCount="indefinite" />
                    </circle>
                ))}
            </svg>
        ),
        cloud: (
            <svg width={s} height={s} viewBox="0 0 48 48">
                <defs>
                    <linearGradient id="cloudGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#E2E8F0" />
                        <stop offset="100%" stopColor="#94A3B8" />
                    </linearGradient>
                </defs>
                <g>
                    <animateTransform attributeName="transform" type="translate" values="0,0;2,0;0,0" dur="5s" repeatCount="indefinite" />
                    <ellipse cx="20" cy="28" rx="13" ry="8" fill="#CBD5E1" />
                    <ellipse cx="29" cy="25" rx="11" ry="7" fill="url(#cloudGrad)" />
                    <ellipse cx="16" cy="25" rx="9" ry="6" fill="#E2E8F0" opacity="0.9" />
                </g>
            </svg>
        ),
        rain: (
            <svg width={s} height={s} viewBox="0 0 48 48">
                <g>
                    <ellipse cx="24" cy="17" rx="13" ry="8" fill="#94A3B8" />
                    <ellipse cx="31" cy="15" rx="9" ry="6" fill="#CBD5E1" opacity="0.9" />
                </g>
                {[14, 20, 26, 32].map((x, i) => (
                    <line key={i} x1={x} y1="28" x2={x - 2} y2="37" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" opacity="0.85">
                        <animate attributeName="y1" values="26;35;26" dur="0.9s" begin={`${i * 0.18}s`} repeatCount="indefinite" />
                        <animate attributeName="y2" values="33;42;33" dur="0.9s" begin={`${i * 0.18}s`} repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.85;0.15;0.85" dur="0.9s" begin={`${i * 0.18}s`} repeatCount="indefinite" />
                    </line>
                ))}
            </svg>
        ),
        thunder: (
            <svg width={s} height={s} viewBox="0 0 48 48">
                <ellipse cx="24" cy="15" rx="14" ry="9" fill="#64748B" />
                <ellipse cx="30" cy="13" rx="9" ry="6" fill="#94A3B8" opacity="0.8" />
                <polygon points="23,22 18,33 24,29 26,22 31,12 25,16" fill="#FBBF24">
                    <animate attributeName="opacity" values="1;0.2;1;1;0.15;1" dur="1.8s" repeatCount="indefinite" />
                </polygon>
                {[16, 30].map((x, i) => (
                    <line key={i} x1={x} y1="28" x2={x - 1} y2="37" stroke="#60A5FA" strokeWidth="1.8" strokeLinecap="round" opacity="0.6">
                        <animate attributeName="opacity" values="0.6;0;0.6" dur="0.7s" begin={`${i * 0.35}s`} repeatCount="indefinite" />
                    </line>
                ))}
            </svg>
        ),
        snow: (
            <svg width={s} height={s} viewBox="0 0 48 48">
                <ellipse cx="24" cy="15" rx="13" ry="8" fill="#CBD5E1" />
                <ellipse cx="30" cy="13" rx="8" ry="5" fill="#E2E8F0" opacity="0.9" />
                {[14, 20, 26, 32, 17, 29].map((x, i) => (
                    <circle key={i} cx={x} cy={28 + (i % 3) * 4} r="2" fill="#BFDBFE">
                        <animate attributeName="cy" values={`${26 + (i % 3) * 4};${40 + (i % 3) * 2};${26 + (i % 3) * 4}`} dur={`${1.8 + i * 0.2}s`} repeatCount="indefinite" />
                        <animate attributeName="opacity" values="1;0.2;1" dur={`${1.8 + i * 0.2}s`} repeatCount="indefinite" />
                    </circle>
                ))}
            </svg>
        ),
        mist: (
            <svg width={s} height={s} viewBox="0 0 48 48">
                {[16, 22, 28, 34].map((y, i) => (
                    <line key={i} x1={8 + i * 2} y1={y} x2={40 - i * 2} y2={y} stroke="#94A3B8" strokeWidth="3" strokeLinecap="round">
                        <animate attributeName="opacity" values="0.25;0.65;0.25" dur={`${2.5 + i * 0.5}s`} repeatCount="indefinite" />
                        <animateTransform attributeName="transform" type="translate" values="-3,0;3,0;-3,0" dur={`${3.5 + i * 0.5}s`} repeatCount="indefinite" />
                    </line>
                ))}
            </svg>
        ),
        partlyCloudyDay: (
            <svg width={s} height={s} viewBox="0 0 48 48">
                <defs>
                    <radialGradient id="pcSunGrad" cx="50%" cy="45%" r="50%">
                        <stop offset="0%" stopColor="#FDE68A" />
                        <stop offset="100%" stopColor="#F59E0B" />
                    </radialGradient>
                </defs>
                {/* Sun behind */}
                {[0, 60, 120, 180, 240, 300].map((angle, i) => (
                    <line key={i} x1="16" y1={16 - 13} x2="16" y2={16 - 10}
                        stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"
                        transform={`rotate(${angle} 16 16)`}
                    >
                        <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.5s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
                    </line>
                ))}
                <circle cx="16" cy="16" r="8" fill="url(#pcSunGrad)">
                    <animate attributeName="opacity" values="0.85;1;0.85" dur="3s" repeatCount="indefinite" />
                </circle>
                <circle cx="14" cy="14" r="3" fill="#FEF3C7" opacity="0.5" />
                {/* Cloud in front */}
                <g>
                    <animateTransform attributeName="transform" type="translate" values="0,0;1.5,0;0,0" dur="5s" repeatCount="indefinite" />
                    <ellipse cx="28" cy="30" rx="13" ry="7" fill="#E2E8F0" />
                    <ellipse cx="22" cy="28" rx="9" ry="6" fill="#F1F5F9" opacity="0.95" />
                </g>
            </svg>
        ),
        partlyCloudyNight: (
            <svg width={s} height={s} viewBox="0 0 48 48">
                <defs>
                    <radialGradient id="pcMoonGrad" cx="40%" cy="40%" r="55%">
                        <stop offset="0%" stopColor="#E2E8F0" />
                        <stop offset="100%" stopColor="#94A3B8" />
                    </radialGradient>
                </defs>
                <path d="M18 8a10 10 0 1 0 8 16A8 8 0 0 1 18 8z" fill="url(#pcMoonGrad)">
                    <animate attributeName="opacity" values="0.7;1;0.7" dur="4s" repeatCount="indefinite" />
                </path>
                <g>
                    <animateTransform attributeName="transform" type="translate" values="0,0;1.5,0;0,0" dur="5s" repeatCount="indefinite" />
                    <ellipse cx="28" cy="32" rx="13" ry="7" fill="#94A3B8" opacity="0.9" />
                    <ellipse cx="22" cy="30" rx="9" ry="6" fill="#CBD5E1" opacity="0.85" />
                </g>
            </svg>
        ),
        overcast: (
            <svg width={s} height={s} viewBox="0 0 48 48">
                <g>
                    <animateTransform attributeName="transform" type="translate" values="0,0;1,0;0,0" dur="6s" repeatCount="indefinite" />
                    <ellipse cx="24" cy="30" rx="15" ry="9" fill="#94A3B8" />
                    <ellipse cx="33" cy="26" rx="12" ry="8" fill="#CBD5E1" />
                    <ellipse cx="16" cy="24" rx="11" ry="7" fill="#E2E8F0" opacity="0.9" />
                </g>
            </svg>
        ),
    };

    // Support both legacy OpenWeatherMap codes (01d, 02n, etc.) and
    // direct icon keys from Open-Meteo WMO mapping (sun, rain, cloud, etc.)
    const legacyMap: Record<string, string> = {
        '01d': 'sun', '01n': 'moon',
        '02d': 'partlyCloudyDay', '02n': 'partlyCloudyNight',
        '03d': 'cloud', '03n': 'cloud',
        '04d': 'overcast', '04n': 'overcast',
        '09d': 'rain', '09n': 'rain',
        '10d': 'rain', '10n': 'rain',
        '11d': 'thunder', '11n': 'thunder',
        '13d': 'snow', '13n': 'snow',
        '50d': 'mist', '50n': 'mist',
    };

    // If the icon is already a direct key (e.g. "sun", "rain"), use it directly
    const key = styles[icon] ? icon : (legacyMap[icon] || 'cloud');
    return <div className="flex items-center justify-center" style={{ width: s, height: s }}>{styles[key]}</div>;
};
