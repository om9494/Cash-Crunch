/**
 * Cash Crunch Autopilot — Design Tokens
 * Clean light theme: white background, black/gray shades, color-coded alerts.
 */

export const colors = {
  // Base surfaces
  void:    '#F8F9FA',   // page background — off-white
  panel:   '#FFFFFF',   // card/panel surface — pure white
  lift:    '#F1F3F5',   // elevated panel / hover state
  border:  '#DEE2E6',   // subtle dividers
  muted:   '#CED4DA',   // disabled / placeholder borders

  // Text
  textPrimary:   '#212529',
  textSecondary: '#6C757D',
  textDim:       '#ADB5BD',

  // Accent — Amber (warning / attention / pending)
  amber:      '#F59E0B',
  amberLight: '#92400E',
  amberDim:   '#FDE68A',
  amberBg:    '#FFFBEB',

  // Cyan / Blue (processing / in-progress / action)
  cyan:      '#2563EB',
  cyanLight: '#1D4ED8',
  cyanDim:   '#BFDBFE',
  cyanBg:    '#EFF6FF',

  // Red (critical / shortfall)
  red:      '#DC2626',
  redLight: '#991B1B',
  redDim:   '#FECACA',
  redBg:    '#FEF2F2',

  // Green (healthy / processed / approved)
  teal:      '#16A34A',
  tealLight: '#14532D',
  tealDim:   '#BBF7D0',
  tealBg:    '#F0FDF4',

  // Gauge arc zones
  gaugeRed:    '#DC2626',
  gaugeAmber:  '#F59E0B',
  gaugeTeal:   '#16A34A',
  gaugeTrack:  '#E5E7EB',

  // Chart
  chartLine:   '#2563EB',
  chartArea:   'rgba(37,99,235,0.08)',
  chartGrid:   '#F3F4F6',
};

export const fonts = {
  display: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  body:    "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  mono:    "'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', monospace",
};

export const spacing = {
  xs:  '4px',
  sm:  '8px',
  md:  '16px',
  lg:  '24px',
  xl:  '32px',
  '2xl': '48px',
  '3xl': '64px',
};

/** Payout status → color mapping */
export const payoutStatusColor = {
  queued:     { bg: colors.amberBg,  border: colors.amber,  text: colors.amberLight },
  processing: { bg: colors.cyanBg,   border: colors.cyan,   text: colors.cyanLight  },
  processed:  { bg: colors.tealBg,   border: colors.teal,   text: colors.tealLight  },
  failed:     { bg: colors.redBg,    border: colors.red,     text: colors.redLight   },
  reversed:   { bg: colors.lift,     border: colors.border,  text: colors.textSecondary },
};

/** Recommendation status colors */
export const recStatusColor = {
  pending:          { bg: colors.amberBg,  border: colors.amber,  text: colors.amberLight },
  approved:         { bg: colors.tealBg,   border: colors.teal,   text: colors.tealLight  },
  rejected:         { bg: colors.redBg,    border: colors.red,     text: colors.redLight   },
  approval_failed:  { bg: colors.redBg,    border: colors.red,     text: colors.redLight   },
};
