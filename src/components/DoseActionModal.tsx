import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/themeContext';
import { NomeRemedio } from './NomeRemedio';
import { DoseCompleta, StatusDose } from '../types';
import { PillGraphic } from './PillGraphic';
import { StatusBadge } from './StatusBadge';

interface DoseActionModalProps {
  dose: DoseCompleta | null;
  onClose: () => void;
  onSelect: (dose: DoseCompleta, status: StatusDose) => void;
}

/**
 * Explicit confirmation before changing a dose status. Replaces "tap the card to toggle",
 * which was easy to trigger by accident (Nielsen #5 error prevention, #3 user control).
 */
export const DoseActionModal: React.FC<DoseActionModalProps> = ({ dose, onClose, onSelect }) => {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();

  if (!dose) return null;

  const jaRegistrada = dose.status !== 'PENDENTE';
  const jaTomada = dose.status === 'TOMADO' || dose.status === 'ATRASADO';

  const escolher = (status: StatusDose) => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(
        status === 'TOMADO' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
      );
    }
    onSelect(dose, status);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />

      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.cardBackground, paddingBottom: Math.max(insets.bottom, 16) + 8 },
        ]}
        accessibilityViewIsModal
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Which dose is this? */}
        <View style={styles.doseInfo}>
          <PillGraphic forma={dose.forma_farmaceutica} cor={dose.cor} size={56} />
          <View style={styles.doseText}>
            <NomeRemedio
              nome={dose.medicamento_nome}
              style={[styles.doseName, { color: colors.textPrimary, fontSize: typography.subtitle.fontSize }]}
            />
            <Text style={[styles.doseDetails, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
              {dose.dosagem} • {dose.hora_programada}
            </Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <Text style={[styles.statusLabel, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}>
            Situação atual:
          </Text>
          <StatusBadge status={dose.status} />
        </View>

        <Text style={[styles.question, { color: colors.textPrimary, fontSize: typography.title.fontSize }]}>
          {jaRegistrada ? 'Deseja corrigir?' : 'Você tomou este remédio?'}
        </Text>

        {/* Actions */}
        {!jaTomada && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.primary }]}
            onPress={() => escolher('TOMADO')}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Ionicons name="checkmark-circle" size={28} color="#FFFFFF" />
            <Text style={[styles.actionText, { color: '#FFFFFF', fontSize: typography.bodyBold.fontSize }]}>
              Sim, tomei
            </Text>
          </TouchableOpacity>
        )}

        {dose.status !== 'PULADO' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.actionOutline, { borderColor: colors.statusSkippedBorder, backgroundColor: colors.statusSkippedBg }]}
            onPress={() => escolher('PULADO')}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Ionicons name="close-circle-outline" size={26} color={colors.statusSkipped} />
            <Text style={[styles.actionText, { color: '#991B1B', fontSize: typography.bodyBold.fontSize }]}>
              Não vou tomar (pular)
            </Text>
          </TouchableOpacity>
        )}

        {jaRegistrada && (
          <TouchableOpacity
            style={[styles.actionButton, styles.actionOutline, { borderColor: colors.border, backgroundColor: colors.cardAltBg }]}
            onPress={() => escolher('PENDENTE')}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Feather name="rotate-ccw" size={24} color={colors.textPrimary} />
            <Text style={[styles.actionText, { color: colors.textPrimary, fontSize: typography.bodyBold.fontSize }]}>
              Desfazer (ainda não tomei)
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.cancelButton} onPress={onClose} activeOpacity={0.7} accessibilityRole="button">
          <Text style={[styles.cancelText, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
            Cancelar
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    marginBottom: 16,
  },
  doseInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  doseText: {
    flex: 1,
    marginLeft: 14,
  },
  doseName: {
    fontWeight: '800',
  },
  doseDetails: {
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  statusLabel: {
    fontWeight: '600',
  },
  question: {
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 14,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 64,
    borderRadius: 18,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  actionOutline: {
    borderWidth: 1.5,
  },
  actionText: {
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'center',
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  cancelText: {
    fontWeight: '700',
  },
});
