/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Fredoka', 'sans-serif'],
                comic: ['"Comic Neue"', 'cursive'],
                hand: ['"Patrick Hand"', 'cursive'],
            },
            transitionTimingFunction: {
                'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            },
            animation: {
                'shake': 'shake 0.4s ease-in-out',
                'pop-in': 'pop-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
                'feedback-pop': 'feedback-pop 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards',
                'highlight-pulse': 'highlight-pulse 1.5s infinite ease-in-out',
                'label-pop': 'pop-in-up 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                'wiggle': 'wiggle 0.3s ease-in-out infinite',
                'shine': 'shine 4s linear infinite',
                'float': 'float 6s ease-in-out infinite',
                'spin-slow': 'spin 3s linear infinite',
                'bounce-slow': 'bounce 2s infinite',
            },
            keyframes: {
                shake: {
                    '0%, 100%': { transform: 'translateX(0)' },
                    '25%': { transform: 'translateX(-5px)' },
                    '75%': { transform: 'translateX(5px)' },
                },
                'pop-in': {
                    '0%': { transform: 'scale(0.8)', opacity: '0' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
                'feedback-pop': {
                    '0%': { transform: 'scale(0)', opacity: '0' },
                    '40%': { transform: 'scale(1.2)', opacity: '1' },
                    '70%': { transform: 'scale(1)', opacity: '1' },
                    '100%': { transform: 'scale(1.5)', opacity: '0' },
                },
                'highlight-pulse': {
                    '0%': {
                        fill: '#F59E0B',
                        strokeWidth: '2px',
                        stroke: '#B45309',
                        filter: 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.5))'
                    },
                    '50%': {
                        fill: '#FCD34D',
                        strokeWidth: '4px',
                        stroke: '#D97706',
                        filter: 'drop-shadow(0 0 12px rgba(251, 191, 36, 0.9))'
                    },
                    '100%': {
                        fill: '#F59E0B',
                        strokeWidth: '2px',
                        stroke: '#B45309',
                        filter: 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.5))'
                    },
                },
                'pop-in-up': {
                    '0%': { opacity: '0', transform: 'translateY(10px) scale(0.8)' },
                    '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
                },
                wiggle: {
                    '0%, 100%': { transform: 'rotate(-3deg)' },
                    '50%': { transform: 'rotate(3deg)' },
                },
                shine: {
                    'to': { backgroundPosition: '200% center' },
                },
                float: {
                    '0%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-10px)' },
                    '100%': { transform: 'translateY(0px)' },
                }
            }
        },
    },
    plugins: [],
}
