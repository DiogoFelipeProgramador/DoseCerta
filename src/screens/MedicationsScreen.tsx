import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../theme/themeContext';
import { NomeRemedio } from '../components/NomeRemedio';
import { useFeedback } from '../components/FeedbackProvider';
import { getMedicamentosAtivos, excluirMedicamento, MedicamentoComHorarios } from '../database/sqlite';
import { triggerAutoSync } from '../services/supabase';
import { PillGraphic } from '../components/PillGraphic';
import { CustomButton } from '../components/CustomButton';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const NOMES_DIAS: Record<string, string> = {
  DOM: 'Dom', SEG: 'Seg', TER: 'Ter', QUA: 'Qua', QUI: 'Qui', SEX: 'Sex', SAB: 'Sáb',
};

const formatarDias = (dias: string) =>
  !dias || dias === 'TODOS' ? 'Todos os dias' : dias.split(',').map((d) => NOMES_DIAS[d] || d).join(', ');

interface MedicationsScreenProps {
  navigation: any;
}

export const MedicationsScreen: React.FC<MedicationsScreenProps> = ({ navigation }) => {
  const { colors, typography } = useTheme();
  const { avisar, confirmar } = useFeedback();
  const [medicamentos, setMedicamentos] = useState<MedicamentoComHorarios[]>([]);

  const carregar = useCallback(async () => {
    try {
      setMedicamentos(await getMedicamentosAtivos());
    } catch (e) {
      console.error('Erro ao carregar medicamentos:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  const remover = async (med: MedicamentoComHorarios) => {
    await excluirMedicamento(med.id);
    triggerAutoSync();
    await carregar();
    avisar({ mensagem: `${med.nome} foi excluído. Os lembretes foram desligados.` });
  };

  // Heuristic 5: error prevention — destructive action always asks for confirmation
  const handleExcluir = async (med: MedicamentoComHorarios) => {
    const ok = await confirmar({
      titulo: `Excluir ${med.nome}?`,
      mensagem:
        'Os lembretes deste remédio serão desligados e ele sai da sua lista de hoje. ' +
        'As doses que você já tomou continuam no histórico.',
      confirmarLabel: 'Sim, excluir',
      cancelarLabel: 'Não, manter',
      destrutivo: true,
    });
    if (ok) remover(med);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
          accessibilityLabel="Voltar"
        >
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: colors.textPrimary, fontSize: typography.title.fontSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          Gerenciar medicamentos
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {medicamentos.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="pill-off" size={44} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary, fontSize: typography.bodyBold.fontSize }]}>
              Nenhum remédio cadastrado
            </Text>
            <CustomButton
              title="Cadastrar remédio"
              onPress={() => navigation.navigate('Main', { screen: 'CadastrarTab' })}
              variant="primary"
              size="large"
              style={{ marginTop: 12, alignSelf: 'stretch' }}
            />
          </View>
        ) : (
          medicamentos.map((med) => (
            <View
              key={med.id}
              style={[styles.medCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
            >
              <View style={styles.medInfoRow}>
                <PillGraphic forma={med.forma_farmaceutica} cor={med.cor} size={50} />
                <View style={styles.medText}>
                  <NomeRemedio
                    nome={med.nome}
                    style={[styles.medName, { color: colors.textPrimary, fontSize: typography.bodyBold.fontSize }]}
                  />
                  <Text style={[styles.medDetails, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}>
                    {med.forma_farmaceutica} • {med.horarios[0].dosagem}
                  </Text>
                  <View style={styles.timesRow}>
                    <Feather name="clock" size={16} color={colors.primary} />
                    <Text style={[styles.timesText, { color: colors.primary, fontSize: typography.caption.fontSize + 1 }]}>
                      {med.horarios.map((h) => h.hora_programada).join('  •  ')}
                    </Text>
                  </View>
                  <View style={styles.timesRow}>
                    <Feather name="calendar" size={16} color={colors.textSecondary} />
                    <Text style={[styles.timesText, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}>
                      {formatarDias(med.horarios[0].dias_da_semana)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('EditMedication', { medicamentoId: med.id })}
                  style={[styles.actionButton, { borderColor: colors.primaryBorder, backgroundColor: colors.primaryLight }]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar ${med.nome}`}
                >
                  <Feather name="edit-2" size={18} color={colors.primaryDark} />
                  <Text style={[styles.actionText, { color: colors.primaryDark, fontSize: typography.body.fontSize }]}>
                    Editar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleExcluir(med)}
                  style={[styles.actionButton, { borderColor: colors.statusSkippedBorder, backgroundColor: colors.statusSkippedBg }]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Excluir ${med.nome}`}
                >
                  <Feather name="trash-2" size={18} color={colors.statusSkipped} />
                  <Text style={[styles.actionText, { color: colors.statusSkipped, fontSize: typography.body.fontSize }]}>
                    Excluir
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontWeight: '800',
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 14,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 8,
  },
  emptyTitle: {
    fontWeight: '700',
    textAlign: 'center',
  },
  medCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
  },
  medInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  medText: {
    flex: 1,
    marginLeft: 14,
  },
  medName: {
    fontWeight: '800',
  },
  medDetails: {
    marginTop: 2,
  },
  timesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  timesText: {
    fontWeight: '700',
    flexShrink: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionText: {
    fontWeight: '700',
  },
});
