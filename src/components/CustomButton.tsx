import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/themeContext';

interface CustomButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'secondary' | 'danger' | 'snooze';
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  size?: 'normal' | 'large' | 'giant';
}

export const CustomButton: React.FC<CustomButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  style,
  textStyle,
  size = 'large',
}) => {
  const { colors, typography } = useTheme();

  const handlePress = () => {
    if (disabled || loading) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onPress();
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'outline':
        return {
          container: {
            // Solid background: on Android, elevation over a transparent
            // background renders a grey shadow fill inside the button.
            backgroundColor: colors.cardBackground,
            borderWidth: 2,
            borderColor: colors.primary,
            elevation: 0,
            shadowOpacity: 0,
          },
          text: {
            color: colors.primary,
          },
        };
      case 'snooze':
        return {
          container: {
            backgroundColor: colors.cardBackground,
            borderWidth: 2,
            borderColor: colors.primaryBorder,
          },
          text: {
            color: colors.primaryDark,
          },
        };
      case 'secondary':
        return {
          container: {
            backgroundColor: colors.cardAltBg,
            borderWidth: 1.5,
            borderColor: colors.border,
          },
          text: {
            color: colors.textPrimary,
          },
        };
      case 'danger':
        return {
          container: {
            backgroundColor: colors.statusSkipped,
            borderWidth: 0,
            borderColor: 'transparent',
          },
          text: {
            color: '#FFFFFF',
          },
        };
      case 'primary':
      default:
        return {
          container: {
            backgroundColor: colors.primary,
            borderWidth: 0,
            borderColor: 'transparent',
          },
          text: {
            color: colors.textOnPrimary,
          },
        };
    }
  };

  const vStyles = getVariantStyles();

  const minHeight = size === 'giant' ? 68 : size === 'large' ? 56 : 48;
  const paddingVertical = size === 'giant' ? 18 : size === 'large' ? 14 : 10;
  const fontSize = size === 'giant' 
    ? typography.title.fontSize - 2 
    : size === 'large' 
      ? typography.button.fontSize 
      : typography.body.fontSize;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
      disabled={disabled || loading}
      style={[
        styles.baseButton,
        {
          minHeight,
          paddingVertical,
          opacity: disabled ? 0.6 : 1,
        },
        vStyles.container,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={vStyles.text.color} size="small" />
      ) : (
        <>
          {icon && <>{icon}</>}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={[
              styles.baseText,
              {
                color: vStyles.text.color,
                fontSize,
                marginLeft: icon ? 8 : 0,
              },
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  baseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30, // friendly rounded pill buttons matching mockup
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  baseText: {
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
});
