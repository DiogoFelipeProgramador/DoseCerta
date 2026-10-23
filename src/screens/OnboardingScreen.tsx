import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/themeContext';
import { CustomButton } from '../components/CustomButton';
import { MaterialCommunityIcons, Feather, Ionicons } from '@expo/vector-icons';

interface OnboardingScreenProps {
  onFinish: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onFinish }) => {
  const { colors, typography } = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.container} bounces={false}>
        {/* Brand Logo with the two colored circles */}
        <View style={styles.brandRow}>
          <Text style={[styles.brandText, { color: colors.primary }]}>DoseCerta</Text>
          <View style={styles.dotsRow}>
            <View style={[styles.dot, { backgroundColor: colors.brandOrange }]} />
            <View style={[styles.dot, { backgroundColor: colors.brandGreen }]} />
          </View>
        </View>

        <Text style={[styles.tagline, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
          Seu tratamento na hora certa, com mais segurança.
        </Text>

        {/* 3 Pillars: Pontualidade, Segurança, Clareza */}
        <View style={styles.pillarsContainer}>
          <View style={styles.pillarItem}>
            <View style={[styles.pillarIconCircle, { borderColor: colors.primaryBorder, backgroundColor: colors.primaryLight }]}>
              <Feather name="clock" size={24} color={colors.primary} />
            </View>
            <Text style={[styles.pillarLabel, { color: colors.textPrimary, fontSize: typography.caption.fontSize }]}>
              Pontualidade
            </Text>
          </View>

          <View style={styles.pillarItem}>
            <View style={[styles.pillarIconCircle, { borderColor: colors.primaryBorder, backgroundColor: colors.primaryLight }]}>
              <Feather name="shield" size={24} color={colors.primary} />
            </View>
            <Text style={[styles.pillarLabel, { color: colors.textPrimary, fontSize: typography.caption.fontSize }]}>
              Segurança
            </Text>
          </View>

          <View style={styles.pillarItem}>
            <View style={[styles.pillarIconCircle, { borderColor: colors.primaryBorder, backgroundColor: colors.primaryLight }]}>
              <Ionicons name="heart-outline" size={24} color={colors.primary} />
            </View>
            <Text style={[styles.pillarLabel, { color: colors.textPrimary, fontSize: typography.caption.fontSize }]}>
              Clareza
            </Text>
          </View>
        </View>

        {/* Hero image illustration */}
        <View style={styles.imageCard}>
          <Image
            source={{
              uri: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&auto=format&fit=crop&q=80',
            }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        </View>

        {/* Action Button */}
        <View style={styles.buttonContainer}>
          <CustomButton
            title="Começar  ➔"
            onPress={onFinish}
            size="giant"
            variant="primary"
          />

          <Text style={[styles.footerQuote, { color: colors.textMuted, fontSize: typography.caption.fontSize }]}>
            Cuidar de você também é tecnologia.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 28,
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  brandText: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  dotsRow: {
    flexDirection: 'row',
    marginLeft: 8,
    gap: 5,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  tagline: {
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '500',
    paddingHorizontal: 12,
  },
  pillarsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  pillarItem: {
    alignItems: 'center',
    flex: 1,
  },
  pillarIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  pillarLabel: {
    fontWeight: '600',
    textAlign: 'center',
  },
  imageCard: {
    width: '100%',
    height: 250,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 24,
    backgroundColor: '#E2E8F0',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  buttonContainer: {
    width: '100%',
    marginTop: 4,
  },
  footerQuote: {
    textAlign: 'center',
    marginTop: 16,
    fontStyle: 'italic',
  },
});
