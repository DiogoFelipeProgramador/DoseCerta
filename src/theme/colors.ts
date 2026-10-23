export const Colors = {
  // Brand palette (based on DoseCerta mockup design)
  primary: '#0D6B58',         // Deep emerald teal (buttons, active states)
  primaryDark: '#07483B',     // Deeper teal for maximum contrast
  primaryLight: '#E6F4F1',    // Very soft teal background tint
  primaryBorder: '#A7D7CE',   // Soft teal border

  // Accent & Brand dots
  brandOrange: '#FF7A00',     // Vibrant warm orange
  brandGreen: '#10B981',      // Vibrant green

  // Status colors (Heuristic 1: Visibility of System Status)
  statusTaken: '#10B981',     // Green
  statusTakenBg: '#E8FDF3',   // Soft light green
  statusTakenBorder: '#86EFAC',

  statusPending: '#6B7280',   // Neutral gray
  statusPendingBg: '#F3F4F6', // Light gray
  statusPendingBorder: '#D1D5DB',

  statusDelayed: '#F59E0B',   // Amber / Yellow
  statusDelayedBg: '#FEF9C3', // Soft yellow
  statusDelayedBorder: '#FDE047',

  statusSkipped: '#EF4444',   // Soft red
  statusSkippedBg: '#FEE2E2', // Light soft red
  statusSkippedBorder: '#FCA5A5',

  // Safety disclaimer banner
  safetyBannerBg: '#FEF3C7',
  safetyBannerText: '#92400E',
  safetyBannerBorder: '#FCD34D',

  // Neutrals & Backgrounds
  background: '#F8FAFC',
  cardBackground: '#FFFFFF',
  cardAltBg: '#F1F5F9',
  surface: '#FFFFFF',
  
  // High contrast text
  textPrimary: '#0F172A',     // Deepest charcoal for best readability
  textSecondary: '#475569',   // Slate gray
  textMuted: '#64748B',
  textOnPrimary: '#FFFFFF',

  // Borders & Dividers
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',

  // Pill palette options
  pillWhite: '#FFFFFF',
  pillLightBlue: '#93C5FD',
  pillCoral: '#FCA5A5',
  pillYellow: '#FDE047',
  pillDarkBlue: '#2563EB',
  pillGreen: '#10B981',
  pillOrange: '#FB923C',
  pillPurple: '#A855F7',
};

export const HighContrastColors = {
  ...Colors,
  background: '#FFFFFF',
  cardBackground: '#FFFFFF',
  textPrimary: '#000000',
  textSecondary: '#111827',
  border: '#000000',
  borderStrong: '#000000',
  primary: '#004D40',
  primaryDark: '#00251A',
};
