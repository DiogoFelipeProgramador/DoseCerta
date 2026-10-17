import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Colors, HighContrastColors } from './colors';
import { getTypography, TextScale } from './typography';

interface ThemeContextType {
  colors: typeof Colors;
  typography: ReturnType<typeof getTypography>;
  textScale: TextScale;
  setTextScale: (scale: TextScale) => void;
  isHighContrast: boolean;
  setIsHighContrast: (highContrast: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: Colors,
  typography: getTypography('padrao'),
  textScale: 'padrao',
  setTextScale: () => {},
  isHighContrast: false,
  setIsHighContrast: () => {},
});

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [textScale, setTextScale] = useState<TextScale>('padrao');
  const [isHighContrast, setIsHighContrast] = useState<boolean>(false);

  const colors = isHighContrast ? HighContrastColors : Colors;
  const typography = getTypography(textScale);

  return (
    <ThemeContext.Provider
      value={{
        colors,
        typography,
        textScale,
        setTextScale,
        isHighContrast,
        setIsHighContrast,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
