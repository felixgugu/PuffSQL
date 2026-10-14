function withOpacity(variableName) {
  return ({ opacityValue }) => {
    if (opacityValue !== undefined) {
      return `rgb(var(${variableName}) / ${opacityValue})`;
    }
    return `rgb(var(${variableName}))`;
  };
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          950: withOpacity('--color-dark-950'),
          900: withOpacity('--color-dark-900'), // Deepest background (e.g. status bar, title bar)
          850: withOpacity('--color-dark-850'), // Outer background
          800: withOpacity('--color-dark-800'), // Panel background (sidebar, bottom panel)
          750: withOpacity('--color-dark-750'), // Surface background (active tab, header)
          700: withOpacity('--color-dark-700'), // Border color / divider
          600: withOpacity('--color-dark-600'), // Hover border
          500: withOpacity('--color-dark-500'), // Muted text / icon
          400: withOpacity('--color-dark-400'), // Secondary text
          300: withOpacity('--color-dark-300'), // Body text
          200: withOpacity('--color-dark-200'), // Headings / high contrast text
          100: withOpacity('--color-dark-100'), // Brightest text
        },
        brand: {
          // Minimal spec accent: one low-saturation steel blue for every primary action. The
          // darker steps are the hover/pressed fills (white text stays >= 5.4:1 on all three).
          500: '#2a6791',
          600: '#235a7e',
          700: '#1e4f70',
        },
        // Theme-aware accent roles. Unlike the fixed `brand` scale above (which is used for
        // solid backgrounds whose text is white), these resolve per colour mode so accent text
        // and icons stay >= 4.5:1 in light and dark mode. See services/themeManager.ts.
        raised: withOpacity('--color-raised'), // Menus, popovers, tooltips: the one surface above the canvas
        accent: withOpacity('--color-accent'),
        // Solid fills: the darker step that keeps white label text legible in both modes.
        'accent-fill': withOpacity('--color-accent-fill'),
        'accent-fill-hover': withOpacity('--color-accent-fill-hover'),
        ok: withOpacity('--color-ok'),
        danger: withOpacity('--color-danger'),
        warn: withOpacity('--color-warn'),
        info: withOpacity('--color-info'),
        plan: withOpacity('--color-plan'),
        er: withOpacity('--color-er'),
        structure: withOpacity('--color-structure'),
        primary: {
          DEFAULT: 'var(--p-primary-color)',
          contrast: 'var(--p-primary-contrast-color)',
        }
      },
      fontFamily: {
        mono: ['"Fira Code"', 'Consolas', 'Monaco', 'monospace'],
        sans: ['var(--app-font-sans)'],
      },
      // The only two shadows the minimal design allows: one for floating layers (menus,
      // popovers, tooltips) and one for dialogs. Panels, toolbars and grids use borders.
      boxShadow: {
        raised: '0 1px 2px rgba(16, 24, 40, 0.06), 0 4px 12px rgba(16, 24, 40, 0.08)',
        overlay: '0 8px 24px rgba(16, 24, 40, 0.12)',
      },
      fontSize: {
        'xxs': '0.6875rem',
      }
    },
  },
  plugins: [],
}
