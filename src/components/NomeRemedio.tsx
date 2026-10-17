import React from 'react';
import { Text, TextProps } from 'react-native';

interface NomeRemedioProps extends TextProps {
  nome: string;
  maxLinhas?: number;
}

/**
 * Medication name that never splits a word in the middle ("Celestamin / e").
 * Allowing at most one line per word means a mid-word break would need an extra line,
 * so the text shrinks to fit instead of breaking.
 */
export const NomeRemedio: React.FC<NomeRemedioProps> = ({ nome, maxLinhas = 3, ...props }) => {
  const palavras = nome.trim().split(/\s+/).filter(Boolean).length || 1;
  return (
    <Text numberOfLines={Math.min(palavras, maxLinhas)} adjustsFontSizeToFit minimumFontScale={0.5} {...props}>
      {nome}
    </Text>
  );
};
