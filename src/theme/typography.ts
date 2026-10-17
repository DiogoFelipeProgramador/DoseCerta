export type TextScale = 'padrao' | 'grande' | 'extra_grande';

export const getTypography = (scale: TextScale = 'padrao') => {
  const multiplier = scale === 'extra_grande' ? 1.25 : scale === 'grande' ? 1.12 : 1.0;

  return {
    // Senior Accessibility Base Sizes
    caption: {
      fontSize: Math.round(15 * multiplier),
      lineHeight: Math.round(22 * multiplier),
      fontWeight: '500' as const,
    },
    bodySmall: {
      fontSize: Math.round(17 * multiplier),
      lineHeight: Math.round(24 * multiplier),
      fontWeight: '400' as const,
    },
    body: {
      fontSize: Math.round(19 * multiplier), // Base > 18px
      lineHeight: Math.round(27 * multiplier),
      fontWeight: '500' as const,
    },
    bodyBold: {
      fontSize: Math.round(19 * multiplier),
      lineHeight: Math.round(27 * multiplier),
      fontWeight: '700' as const,
    },
    subtitle: {
      fontSize: Math.round(22 * multiplier),
      lineHeight: Math.round(30 * multiplier),
      fontWeight: '600' as const,
    },
    title: {
      fontSize: Math.round(26 * multiplier), // Titles >= 24px
      lineHeight: Math.round(34 * multiplier),
      fontWeight: '700' as const,
    },
    titleLarge: {
      fontSize: Math.round(32 * multiplier), // Hero titles
      lineHeight: Math.round(40 * multiplier),
      fontWeight: '800' as const,
    },
    button: {
      fontSize: Math.round(20 * multiplier),
      lineHeight: Math.round(26 * multiplier),
      fontWeight: '700' as const,
    },
  };
};
