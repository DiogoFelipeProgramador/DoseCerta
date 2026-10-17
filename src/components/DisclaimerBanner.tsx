import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/themeContext';

export const DisclaimerBanner: React.FC = () => {
  const { colors, typography } = useTheme();

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: colors.safetyBannerBg,
          borderColor: colors.safetyBannerBorder,
        },
      ]}
    >
      <Ionicons name="warning" size={24} color="#D97706" style={styles.icon} />
      <Text
        style={[
          styles.text,
          {
            color: colors.safetyBannerText,
            fontSize: typography.caption.fontSize,
          },
        ]}
      >
        <Text style={{ fontWeight: '700' }}>Esta orientação não substitui a consulta médica.</Text>{' '}
        Em caso de sintomas graves, procure um pronto-socorro ou seu médico responsável.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1.5,
  },
  icon: {
    marginRight: 10,
  },
  text: {
    flex: 1,
    lineHeight: 20,
  },
});
