import React from 'react';
import { View, StyleSheet } from 'react-native';
import { FormaFarmaceutica } from '../types';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

interface PillGraphicProps {
  forma: FormaFarmaceutica;
  cor: string;
  size?: number;
  highlightCard?: boolean;
}

export const PillGraphic: React.FC<PillGraphicProps> = ({
  forma,
  cor,
  size = 56,
  highlightCard = false,
}) => {
  // If highlightCard (like the hero card in dosecerta-inicio prototype)
  if (highlightCard) {
    return (
      <View style={[styles.heroContainer, { width: 72, height: 72 }]}>
        <View style={[styles.heroPillShadow, { backgroundColor: '#A7D7CE' }]}>
          <View style={[styles.heroPillBody, { backgroundColor: cor === '#FFFFFF' ? '#F1F5F9' : cor }]}>
            <View style={styles.pillDivisionLine} />
          </View>
        </View>
      </View>
    );
  }

  // Visual icons and shapes for list items
  const isDarkColor = cor === '#2563EB' || cor === '#059669' || cor === '#A855F7';
  const iconColor = isDarkColor ? '#FFFFFF' : '#1E293B';

  const renderIcon = () => {
    switch (forma) {
      case 'Comprimido':
        return <MaterialCommunityIcons name={"pill" as any} size={size * 0.55} color={iconColor} />;
      case 'Cápsula':
        return <MaterialCommunityIcons name={"pill" as any} size={size * 0.55} color={iconColor} />;
      case 'Gotas':
        return <Ionicons name={"water" as any} size={size * 0.55} color={iconColor} />;
      case 'Xarope':
        return <MaterialCommunityIcons name={"bottle-tonic-plus" as any} size={size * 0.55} color={iconColor} />;
      case 'Injeção':
        return <MaterialCommunityIcons name={"needle" as any} size={size * 0.55} color={iconColor} />;
      case 'Pomada':
        return <MaterialCommunityIcons name={"lotion-outline" as any} size={size * 0.55} color={iconColor} />;
      default:
        return <MaterialCommunityIcons name={"medical-bag" as any} size={size * 0.55} color={iconColor} />;
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 3,
          backgroundColor: cor === '#FFFFFF' ? '#F8FAFC' : cor,
          borderWidth: cor === '#FFFFFF' ? 2 : 1.5,
          borderColor: cor === '#FFFFFF' ? '#CBD5E1' : 'rgba(0,0,0,0.1)',
        },
      ]}
    >
      {renderIcon()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  heroContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroPillShadow: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  heroPillBody: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  pillDivisionLine: {
    width: 24,
    height: 1.5,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
});
