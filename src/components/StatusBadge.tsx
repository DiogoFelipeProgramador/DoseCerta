import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { StatusDose } from '../types';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/themeContext';

interface StatusBadgeProps {
  status: StatusDose;
  onPress?: () => void;
  size?: 'normal' | 'large';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  onPress,
  size = 'normal',
}) => {
  const { colors, typography } = useTheme();

  const getStatusConfig = () => {
    switch (status) {
      case 'TOMADO':
        return {
          label: 'Tomado',
          bg: colors.statusTakenBg,
          border: colors.statusTakenBorder,
          text: '#065F46',
          icon: <Ionicons name="checkmark-circle" size={size === 'large' ? 22 : 18} color="#059669" />,
        };
      case 'ATRASADO':
        return {
          label: 'Com atraso', // taken, but more than 30 min after the time
          bg: colors.statusDelayedBg,
          border: colors.statusDelayedBorder,
          text: '#92400E',
          icon: <Ionicons name="time" size={size === 'large' ? 22 : 18} color="#D97706" />,
        };
      case 'PULADO':
        return {
          label: 'Pulado',
          bg: colors.statusSkippedBg,
          border: colors.statusSkippedBorder,
          text: '#991B1B',
          icon: <Ionicons name="close-circle" size={size === 'large' ? 22 : 18} color="#DC2626" />,
        };
      case 'PENDENTE':
      default:
        return {
          label: 'Pendente',
          bg: colors.statusPendingBg,
          border: colors.statusPendingBorder,
          text: colors.textSecondary,
          icon: <MaterialCommunityIcons name="circle-outline" size={size === 'large' ? 22 : 18} color={colors.textSecondary} />,
        };
    }
  };

  const config = getStatusConfig();

  const content = (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: config.bg,
          borderColor: config.border,
          paddingVertical: size === 'large' ? 8 : 5,
          paddingHorizontal: size === 'large' ? 14 : 10,
        },
      ]}
    >
      {config.icon}
      <Text
        style={[
          styles.text,
          {
            color: config.text,
            fontSize: size === 'large' ? typography.body.fontSize : typography.caption.fontSize + 1,
            fontWeight: '600',
            marginLeft: 6,
          },
        ]}
      >
        {config.label}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1.5,
  },
  text: {
    textAlign: 'center',
  },
});
