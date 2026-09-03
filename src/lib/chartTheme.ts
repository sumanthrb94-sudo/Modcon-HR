// ---------------------------------------------------------------------------
// Chart colours, from the brand kit.
//
// Charts are the one place a colour has to reach the DOM as a literal string —
// Recharts takes `fill`/`stroke` props, not classes — so this module is the
// chart-side twin of `tailwind.config.js`: the same tokens, spelt out. Every
// chart in the app reads from here rather than carrying its own hex, which is
// how the palette stayed indigo-and-violet through two brand changes.
//
// The system is near-mono: ink with one accent. A categorical series therefore
// walks the ink ramp and spends Signal Red on the first (most important)
// series only, rather than assigning an unrelated hue per category. Where a
// scale is genuinely semantic — present/absent, on track/at risk — the state
// colours below keep their meaning, muted onto the same perceptual lightness
// as the ramp so nothing outshouts the accent.
// ---------------------------------------------------------------------------

/** Signal Red — the accent. One module, used sparingly. */
export const BRAND_ACCENT = '#ec3013';
/** The accent's darker step, for a second emphasis or a pressed state. */
export const BRAND_ACCENT_DARK = '#ae1800';
/** Ink — type, rules, the mark's tile. */
export const INK = '#201e1d';

/** Steps of the ink ramp, dark to light. */
export const INK_RAMP = {
  900: '#201e1d',
  800: '#2d2b2b',
  700: '#444141',
  600: '#605d5d',
  500: '#7d7979',
  400: '#9b9797',
  300: '#bab6b6',
  200: '#d7d3d3',
  100: '#eae9e9',
  50: '#f3f2f2',
} as const;

/**
 * The default for a chart with ONE series — ink, not the accent. A ten-bar
 * chart drawn entirely in Signal Red is exactly what "use the accent
 * sparingly" rules out: the red stops meaning "look here" once every bar
 * carries it. Reach for `BRAND_ACCENT` when one series, one slice or one line
 * is the point of the chart.
 */
export const CHART_PRIMARY: string = INK_RAMP[900];

/**
 * The categorical sequence: accent first, then down the ink ramp. Read it with
 * `chartSeriesColor(i)` so a chart with more categories than steps wraps
 * instead of falling off the end.
 */
export const CHART_SERIES = [
  BRAND_ACCENT,
  INK_RAMP[900],
  INK_RAMP[600],
  BRAND_ACCENT_DARK,
  INK_RAMP[400],
  INK_RAMP[700],
  INK_RAMP[300],
  INK_RAMP[500],
] as const;

/** Nth colour of the categorical sequence, wrapping. */
export function chartSeriesColor(index: number): string {
  return CHART_SERIES[((index % CHART_SERIES.length) + CHART_SERIES.length) % CHART_SERIES.length];
}

/**
 * State colours, for scales that mean something. Muted onto the ramp's
 * lightness so they read as data rather than as decoration, and deliberately
 * kept clear of Signal Red: `negative` is a deeper, browner red so a failing
 * bar is never mistaken for the brand's accent.
 */
export const CHART_STATE = {
  positive: '#3f6b52',
  caution: '#9a6b18',
  negative: '#8c2f24',
  neutral: INK_RAMP[500],
  info: INK_RAMP[700],
} as const;

/** Grid lines and axis rules — hairline ink, never a coloured grid. */
export const CHART_GRID = INK_RAMP[200];
export const CHART_AXIS = INK_RAMP[500];

/** Recharts `contentStyle` for a tooltip: a square surface with an ink rule. */
export const CHART_TOOLTIP_STYLE = {
  borderRadius: 0,
  border: `1px solid ${INK_RAMP[300]}`,
  fontSize: 13,
  fontFamily: 'Archivo, system-ui, sans-serif',
  background: '#ffffff',
  color: INK,
} as const;

/** Axis tick colour. Each chart keeps its own label size. */
export const CHART_TICK_FILL: string = INK_RAMP[600];

/** The hover band behind a bar — an ink tint, matching table row hover. */
export const CHART_CURSOR_FILL = 'rgba(32, 30, 29, 0.06)';
