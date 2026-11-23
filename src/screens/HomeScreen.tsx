import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppState,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { useTheme } from '../theme/themeContext';
import { NomeRemedio } from '../components/NomeRemedio';
import { DoseCompleta, PerfilUsuario, StatusDose } from '../types';
import {
  getPerfilUsuario,
  getDosesDoDia,
  updateDoseStatus,
  snoozeDose,
} from '../database/sqlite';
import { PillGraphic } from '../components/PillGraphic';
import { StatusBadge } from '../components/StatusBadge';
import { DoseActionModal } from '../components/DoseActionModal';
import { useFeedback } from '../components/FeedbackProvider';
import { CustomButton } from '../components/CustomButton';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface HomeScreenProps {
  navigation: any;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { colors, typography, textScale } = useTheme();
  // With larger text the two buttons no longer fit side by side, so they stack
  const empilharAcoes = textScale !== 'padrao';
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [dosesHoje, setDosesHoje] = useState<DoseCompleta[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [proximaDose, setProximaDose] = useState<DoseCompleta | null>(null);
  const [doseSelecionada, setDoseSelecionada] = useState<DoseCompleta | null>(null);
  const { avisar } = useFeedback();

  const carregarDados = useCallback(async () => {
    try {
      const user = await getPerfilUsuario();
      setPerfil(user);

      const doses = await getDosesDoDia();
      setDosesHoje(doses);

      // Next dose = earliest one still waiting (pending or late). Taken/skipped doses never show here.
      const pending = doses.find(d => d.status === 'PENDENTE' || d.status === 'ATRASADO');
      setProximaDose(pending || null);
    } catch (error) {
      console.error('Erro ao carregar dados da Home:', error);
    }
  }, []);

  // Reload whenever the tab gains focus (e.g. after adding a medication or editing the profile)
  useFocusEffect(
    useCallback(() => {
      carregarDados();
    }, [carregarDados])
  );

  // Reload when the app returns from background, so a new day's doses show up on their own
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') carregarDados();
    });
    return () => sub.remove();
  }, [carregarDados]);

  const onRefresh = async () => {
    setRefreshing(true);
    await carregarDados();
    setRefreshing(false);
  };

  // Heuristic 1 & 3: Visibility of system status + user freedom (take dose)
  const handleConfirmarDose = async (dose: DoseCompleta) => {
    await updateDoseStatus(dose.id, 'TOMADO');
    await carregarDados();
    avisar({
      mensagem: `${dose.medicamento_nome} registrado como tomado. Muito bem!`,
      acao: { label: 'Desfazer', onPress: () => desfazerStatus(dose) },
    });
  };

  // Restores the status the dose had before the last change
  const desfazerStatus = async (dose: DoseCompleta) => {
    await updateDoseStatus(dose.id, dose.status);
    await carregarDados();
    avisar({ mensagem: 'Pronto, desfeito.', tipo: 'info' });
  };

  // Heuristic 3: User control & freedom (snooze 15 minutes)
  const handleSoneca = async (dose: DoseCompleta) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await snoozeDose(dose.id, 15);
    await carregarDados();

    avisar({ mensagem: `Vamos lembrar de ${dose.medicamento_nome} de novo em 15 minutos.`, tipo: 'info' });
  };

  // Heuristic 3 & 5: tapping a dose opens an explicit confirmation instead of changing it directly
  const handleAlterarStatus = async (dose: DoseCompleta, status: StatusDose) => {
    setDoseSelecionada(null);
    await updateDoseStatus(dose.id, status);
    await carregarDados();
    const mensagens: Record<StatusDose, string> = {
      TOMADO: `${dose.medicamento_nome} registrado como tomado.`,
      PULADO: `${dose.medicamento_nome} registrado como pulado.`,
      PENDENTE: `${dose.medicamento_nome} voltou para pendente.`,
      ATRASADO: `${dose.medicamento_nome} marcado como atrasado.`,
    };
    avisar({
      mensagem: mensagens[status],
      tipo: status === 'TOMADO' ? 'sucesso' : 'info',
      acao: { label: 'Desfazer', onPress: () => desfazerStatus(dose) },
    });
  };

  // Format today's date header (e.g. "Seg, 6 de Set")
  const formatTodayHeader = () => {
    const hoje = new Date();
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${dias[hoje.getDay()]}, ${hoje.getDate()} de ${meses[hoje.getMonth()]}`;
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
    >
      {/* Top Greeting Header */}
      <View style={styles.greetingHeader}>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.greetingTitle,
              { color: colors.textPrimary, fontSize: typography.titleLarge.fontSize, lineHeight: typography.titleLarge.lineHeight },
            ]}
          >
            {perfil?.nome ? `Olá, ${perfil.nome}!` : 'Olá! Seja bem-vindo(a)'}
          </Text>
          <Text style={[styles.greetingSubtitle, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
            Vamos cuidar de sua saúde hoje.
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.profileButton,
            {
              backgroundColor: colors.primaryLight,
              borderColor: colors.primaryBorder,
              marginTop: (typography.titleLarge.lineHeight - PROFILE_BUTTON_SIZE) / 2,
            },
          ]}
          onPress={() => navigation.navigate('PerfilTab')}
          accessibilityRole="button"
          accessibilityLabel="Abrir meu perfil"
          activeOpacity={0.7}
        >
          <Feather name="user" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Hero Card: "Próximo medicamento" */}
      {proximaDose && (
        <View style={[styles.heroCard, { backgroundColor: colors.cardBackground, borderColor: colors.primaryBorder }]}>
          {/* Card Header Tag */}
          <View style={styles.heroTagRow}>
            <View style={[styles.heroTag, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="notifications" size={16} color={colors.primary} />
              <Text style={[styles.heroTagText, { color: colors.primary, fontSize: typography.caption.fontSize }]}>
                Próximo medicamento
              </Text>
            </View>
          </View>

          {/* Med Info & Visual Pill */}
          <View style={styles.heroBody}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <NomeRemedio
                nome={proximaDose.medicamento_nome}
                style={[styles.heroMedName, { color: colors.textPrimary, fontSize: typography.title.fontSize }]}
              />
              <Text style={[styles.heroDosage, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                {proximaDose.dosagem}
              </Text>

              <View style={styles.timeRow}>
                <Feather name="clock" size={18} color={colors.primary} />
                <Text style={[styles.timeText, { color: colors.primary, fontSize: typography.bodyBold.fontSize }]}>
                  {proximaDose.hora_programada}
                </Text>
              </View>
            </View>

            {/* Pill 3D representation */}
            <PillGraphic
              forma={proximaDose.forma_farmaceutica}
              cor={proximaDose.cor}
              highlightCard
            />
          </View>

          {/* Action Buttons: Confirmar dose & Soneca */}
          <View style={[styles.heroActions, empilharAcoes && styles.heroActionsStacked]}>
            <View style={empilharAcoes ? undefined : { flex: 1.4 }}>
              <CustomButton
                title="Confirmar dose"
                onPress={() => handleConfirmarDose(proximaDose)}
                variant="primary"
                size="large"
                style={styles.heroActionButton}
              />
            </View>

            <View style={empilharAcoes ? undefined : { flex: 1 }}>
              <CustomButton
                title="Soneca"
                icon={<Feather name="clock" size={18} color={colors.primary} />}
                onPress={() => handleSoneca(proximaDose)}
                variant="snooze"
                size="large"
                style={styles.heroActionButton}
              />
            </View>
          </View>
        </View>
      )}

      {/* All of today's doses handled */}
      {!proximaDose && dosesHoje.length > 0 && (
        <View style={[styles.allDoneCard, { backgroundColor: colors.statusTakenBg, borderColor: colors.statusTakenBorder }]}>
          <Ionicons name="checkmark-circle" size={36} color={colors.statusTaken} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.allDoneTitle, { color: colors.textPrimary, fontSize: typography.bodyBold.fontSize }]}>
              Tudo certo por hoje!
            </Text>
            <Text style={[styles.allDoneText, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}>
              Você não tem mais remédios para tomar hoje.
            </Text>
          </View>
        </View>
      )}

      {/* "Hoje" Medication List Section */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontSize: typography.title.fontSize }]}>
          Hoje
        </Text>
        <Text style={[styles.sectionDateTag, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}>
          {formatTodayHeader()}
        </Text>
      </View>

      {dosesHoje.length > 0 && (
        <Text style={[styles.listHint, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}>
          Toque em um remédio para marcar se tomou ou pulou.
        </Text>
      )}

      <View style={styles.medicationsList}>
        {dosesHoje.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="pill-off" size={44} color={colors.textMuted} style={{ marginBottom: 10 }} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary, fontSize: typography.bodyBold.fontSize }]}>
              Nenhum medicamento agendado
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}>
              Você ainda não tem doses para hoje. Cadastre seu primeiro remédio no botão abaixo!
            </Text>
          </View>
        ) : (
          dosesHoje.map((dose) => {
            return (
              <TouchableOpacity
                key={dose.id}
                activeOpacity={0.8}
                onPress={() => setDoseSelecionada(dose)}
                style={[
                  styles.medCard,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: dose.status === 'TOMADO' ? colors.statusTakenBorder : colors.border,
                  },
                ]}
              >
                <View style={styles.medCardLeft}>
                  <PillGraphic
                    forma={dose.forma_farmaceutica}
                    cor={dose.cor}
                    size={50}
                  />

                  <View style={styles.medCardText}>
                    <NomeRemedio
                      nome={dose.medicamento_nome}
                      style={[styles.medName, { color: colors.textPrimary, fontSize: typography.bodyBold.fontSize }]}
                    />
                    <Text style={[styles.medDetails, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}>
                      {dose.dosagem} • {dose.hora_programada}
                    </Text>
                  </View>
                </View>

                <StatusBadge
                  status={dose.status}
                  onPress={() => setDoseSelecionada(dose)}
                />
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {dosesHoje.length > 0 && (
        <TouchableOpacity
          style={[styles.manageLink, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
          onPress={() => navigation.navigate('Medications')}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Feather name="list" size={20} color={colors.primary} />
          <Text style={[styles.manageLinkText, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
            Gerenciar medicamentos
          </Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Quick Add Button */}
      <View style={styles.quickAddRow}>
        <TouchableOpacity
          style={[styles.addMedBanner, { backgroundColor: colors.primaryLight, borderColor: colors.primaryBorder }]}
          onPress={() => navigation.navigate('CadastrarTab')}
          activeOpacity={0.8}
        >
          <View style={[styles.addIconCircle, { backgroundColor: colors.primary }]}>
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={[styles.addMedTitle, { color: colors.primaryDark, fontSize: typography.bodyBold.fontSize }]}>
              Cadastrar Novo Medicamento
            </Text>
            <Text style={[styles.addMedSub, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
              Configure horários e lembretes em 4 passos simples
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <DoseActionModal
        dose={doseSelecionada}
        onClose={() => setDoseSelecionada(null)}
        onSelect={handleAlterarStatus}
      />
    </ScrollView>
    </SafeAreaView>
  );
};

const PROFILE_BUTTON_SIZE = 48;

const styles = StyleSheet.create({
  listHint: {
    marginTop: -6,
    marginBottom: 12,
  },
  manageLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  manageLinkText: {
    flex: 1,
    fontWeight: '700',
  },
  allDoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1.5,
    marginBottom: 24,
  },
  allDoneTitle: {
    fontWeight: '800',
  },
  allDoneText: {
    marginTop: 2,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  greetingHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  greetingTitle: {
    fontWeight: '800',
    marginBottom: 4,
  },
  greetingSubtitle: {
    fontWeight: '500',
  },
  profileButton: {
    width: PROFILE_BUTTON_SIZE,
    height: PROFILE_BUTTON_SIZE,
    borderRadius: PROFILE_BUTTON_SIZE / 2,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 2,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  heroTagRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  heroTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
  },
  heroTagText: {
    fontWeight: '700',
  },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  heroMedName: {
    fontWeight: '800',
    marginBottom: 4,
  },
  heroDosage: {
    marginBottom: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    fontWeight: '700',
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroActionsStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  heroActionButton: {
    paddingHorizontal: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 4,
  },
  sectionTitle: {
    fontWeight: '800',
  },
  sectionDateTag: {
    fontWeight: '600',
  },
  medicationsList: {
    gap: 12,
    marginBottom: 20,
  },
  medCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  medCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  medCardText: {
    marginLeft: 14,
    flex: 1,
  },
  medName: {
    marginBottom: 4,
  },
  medDetails: {
    fontWeight: '500',
  },
  quickAddRow: {
    marginTop: 6,
  },
  addMedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  addIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMedTitle: {
    fontWeight: '700',
  },
  addMedSub: {
    marginTop: 2,
  },
  emptyCard: {
    padding: 28,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    lineHeight: 20,
  },
});
