import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/themeContext';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps?: number;
  stepLabels?: string[];
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  currentStep,
  totalSteps = 4,
  stepLabels = ['Medicamento', 'Horários', 'Detalhes', 'Revisão'],
}) => {
  const { colors, typography } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.stepsRow}>
        {Array.from({ length: totalSteps }).map((_, index) => {
          const stepNum = index + 1;
          const isActive = stepNum === currentStep;
          const isCompleted = stepNum < currentStep;

          return (
            <React.Fragment key={stepNum}>
              <View style={styles.stepColumn}>
                <View
                  style={[
                    styles.circle,
                    {
                      backgroundColor: isActive
                        ? colors.primary
                        : isCompleted
                        ? colors.primaryDark
                        : colors.cardAltBg,
                      borderColor: isActive || isCompleted ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.circleText,
                      {
                        color: isActive || isCompleted ? '#FFFFFF' : colors.textSecondary,
                        fontSize: typography.caption.fontSize,
                      },
                    ]}
                  >
                    {stepNum}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.label,
                    {
                      color: isActive ? colors.primaryDark : colors.textSecondary,
                      fontWeight: isActive ? '700' : '500',
                      fontSize: typography.caption.fontSize - 1,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {stepLabels[index]}
                </Text>
              </View>

              {index < totalSteps - 1 && (
                <View
                  style={[
                    styles.line,
                    {
                      backgroundColor: stepNum < currentStep ? colors.primary : colors.border,
                    },
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepColumn: {
    alignItems: 'center',
    width: 72,
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    marginBottom: 4,
  },
  circleText: {
    fontWeight: '700',
  },
  label: {
    textAlign: 'center',
  },
  line: {
    flex: 1,
    height: 2,
    marginTop: -18,
  },
});
