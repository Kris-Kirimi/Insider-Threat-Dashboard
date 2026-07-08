// lib/theme.ts — shared design tokens + MUI theme for the whole app.
//
// Direction: a security operations console. Deep near-black canvas, subtle
// glass surfaces layered with hairline borders, one restrained teal accent,
// and severity colours reserved strictly for risk signalling.
import { createTheme } from '@mui/material/styles';

export const tokens = {
  bg: '#05070d',
  bgElevated: '#0a0f1a',
  surface: 'rgba(255,255,255,0.035)',
  surfaceSolid: '#0c1220',
  hairline: 'rgba(255,255,255,0.08)',
  hairlineStrong: 'rgba(255,255,255,0.14)',
  text: '#e6edf3',
  textDim: '#8b98a5',
  textFaint: '#5b6b7b',
  accent: '#2dd4bf',
  accentBright: '#5eead4',
  accentDim: 'rgba(45,212,191,0.12)',
  radius: 20,
  radiusInner: 14,
  // Risk / severity palette (emerald → amber → orange → rose)
  severity: {
    low: '#34d399',
    medium: '#fbbf24',
    high: '#fb923c',
    critical: '#f43f5e',
  },
  risk: {
    low: '#34d399',
    elevated: '#fbbf24',
    high: '#fb923c',
    critical: '#f43f5e',
  },
} as const;

// The ambient background used across authenticated pages: a deep canvas with
// two faint radial glows. Static (no scroll repaint) and GPU-cheap.
export const appBackground =
  `radial-gradient(1100px 620px at 12% -10%, rgba(45,212,191,0.10), transparent 60%),` +
  `radial-gradient(900px 560px at 100% 8%, rgba(99,102,241,0.10), transparent 55%),` +
  `${tokens.bg}`;

export const FONT_STACK =
  'var(--font-jakarta), "Segoe UI", system-ui, -apple-system, sans-serif';

export const appTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: tokens.accent },
    background: { default: tokens.bg, paper: tokens.surfaceSolid },
    text: { primary: tokens.text, secondary: tokens.textDim },
    divider: tokens.hairline,
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: FONT_STACK,
    h1: { fontWeight: 800, letterSpacing: '-0.03em' },
    h2: { fontWeight: 800, letterSpacing: '-0.025em' },
    h3: { fontWeight: 700, letterSpacing: '-0.02em' },
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, letterSpacing: '-0.015em' },
    h6: { fontWeight: 600, letterSpacing: '-0.01em' },
    button: { fontWeight: 600, textTransform: 'none' },
    overline: { letterSpacing: '0.22em', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          paddingInline: 20,
          transition: 'transform 180ms cubic-bezier(0.32,0.72,0,1), background 180ms, border-color 180ms',
          '&:active': { transform: 'scale(0.97)' },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
  },
});

// "Double-bezel" surface: an outer glass shell holding an inner solid core,
// giving cards a machined, physical depth instead of sitting flat.
export const bezelShell = {
  p: 0.75,
  borderRadius: `${tokens.radius}px`,
  background: tokens.surface,
  border: `1px solid ${tokens.hairline}`,
} as const;

export const bezelCore = {
  borderRadius: `${tokens.radiusInner}px`,
  background: tokens.surfaceSolid,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
} as const;
