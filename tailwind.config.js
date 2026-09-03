/** @type {import('tailwindcss').Config} */
//
// Tokens come from the Modcon HR brand identity kit (Modernist design system):
// Signal Red #EC3013 on Paper #F3F2F2, ink #201E1D, Archivo throughout, and a
// radius scale that is 0 at every step. The 100-900 ramps are the kit's, which
// were generated in OKLCH on one shared lightness scale — the same step of any
// ramp carries the same visual weight, so a tint swapped for another tint keeps
// its contrast. Tailwind's own 50/950 steps are extrapolated from those ends.
//
// Never hard-code a brand hex in a component: read it from these tokens, or
// from `src/lib/chartTheme.ts` where the value has to reach a chart library as
// a string.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Signal Red — the accent. One accent only; the system is mostly ink
        // on ground and red is spent on the primary action and small emphasis.
        brand: {
          50: '#fff8f6',
          100: '#fff2ef',
          200: '#ffe0d9',
          300: '#ffc4b8',
          400: '#ff9783',
          500: '#ff563c',
          600: '#ec3013',
          700: '#ae1800',
          800: '#7c1405',
          900: '#4d170e',
          950: '#2b0d08',
        },
        // The kit records no second accent: accent-2 is a machine-derived
        // stand-in kept only so both sets resolve. Treat it as one role with
        // `brand` rather than reaching for it as a second colour.
        accent: {
          50: '#fff8f6',
          100: '#fff2ef',
          200: '#ffe0da',
          300: '#ffc4b9',
          400: '#ff9784',
          500: '#ef6853',
          600: '#c94b39',
          700: '#9e3526',
          800: '#71261b',
          900: '#471d16',
        },
        // Warm neutrals — the kit's ramp. `ink-50` is Paper (#F3F2F2, the
        // default ground) and `ink-100` is Surface (#EAE9E9, cards and table
        // headers); `ink-900` is Ink (#201E1D), the type and rule colour.
        ink: {
          50: '#f3f2f2',
          100: '#eae9e9',
          200: '#d7d3d3',
          300: '#bab6b6',
          400: '#9b9797',
          500: '#7d7979',
          600: '#605d5d',
          700: '#444141',
          800: '#2d2b2b',
          900: '#201e1d',
          // A step past Ink, for the near-black panels (image lightboxes, the
          // console output in Settings) that need to sit behind Ink itself.
          950: '#141312',
        },
      },
      fontFamily: {
        sans: ['Archivo', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Archivo', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        // The kit's three elevation steps, ink-tinted and tuned to the ground.
        // Tailwind's own `sm`/`md`/`lg` are redefined onto them too, so a
        // stray `shadow-sm` picks up the ink tint rather than the framework's
        // blue-grey default.
        sm: '0 1px 2px rgba(45, 43, 43, 0.14)',
        DEFAULT: '0 1px 2px rgba(45, 43, 43, 0.14)',
        md: '0 3px 10px rgba(45, 43, 43, 0.16)',
        lg: '0 12px 32px rgba(45, 43, 43, 0.22)',
        card: '0 1px 2px rgba(45, 43, 43, 0.14)',
        'card-hover': '0 3px 10px rgba(45, 43, 43, 0.16)',
        nav: '0 3px 10px rgba(45, 43, 43, 0.16)',
        modal: '0 12px 32px rgba(45, 43, 43, 0.22)',
      },
      // "Do not round a corner anywhere" — the whole scale is 0, `full`
      // included, so `rounded-full` on a pill or an avatar squares off with
      // everything else instead of quietly reintroducing the old look.
      borderRadius: {
        none: '0px',
        sm: '0px',
        DEFAULT: '0px',
        md: '0px',
        lg: '0px',
        xl: '0px',
        '2xl': '0px',
        '3xl': '0px',
        full: '0px',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        // The mark's build sequence, from the kit's motion spec.
        'mark-tile': { '0%': { clipPath: 'inset(0 0 100% 0)' }, '100%': { clipPath: 'inset(0 0 0 0)' } },
        'mark-rise': { '0%': { transform: 'scaleY(0)' }, '100%': { transform: 'scaleY(1)' } },
        'mark-drop': {
          '0%': { transform: 'translateY(-130%)' },
          '62%': { transform: 'translateY(7%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'mark-wipe': { '0%': { clipPath: 'inset(0 100% 0 0)' }, '100%': { clipPath: 'inset(0 0 0 0)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in': 'slide-in 0.25s ease-out',
        'mark-tile': 'mark-tile 0.42s cubic-bezier(0.2,0.9,0.2,1) both',
        'mark-rise': 'mark-rise 0.4s cubic-bezier(0.2,0.9,0.2,1) both',
        'mark-drop': 'mark-drop 0.5s cubic-bezier(0.3,1.1,0.4,1) both',
        'mark-wipe': 'mark-wipe 0.62s cubic-bezier(0.2,0.9,0.2,1) both',
      },
    },
  },
  plugins: [],
};
