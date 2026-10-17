import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/themeContext';
import { NomeRemedio } from '../components/NomeRemedio';
import { useFeedback } from '../components/FeedbackProvider';
import { DoseCompleta, StatusDose } from '../types';
import { getHistoricoMensal, updateDoseStatus } from '../database/sqlite';
import { Ionicons, Feather } from '@expo/vector-icons';
import { DoseActionModal } from '../components/DoseActionModal';
import * as Haptics from 'expo-haptics';

interface HistoryScreenProps {
  navigation: any;
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({ navigation }) => {
  const { colors, typography } = useTheme();
  const { avisar } = useFeedback();
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState({
    tomadas: 0,
    comAtraso: 0,
    puladas: 0,
    dosesPorDia: {} as Record<string, DoseCompleta[]>,
  });

  const hoje = new Date();
  const [mesAtual, setMesAtual] = useState<{ ano: number; mes: number }>({
    ano: hoje.getFullYear(),
    mes: hoje.getMonth(),
  });

  const mesesNomes = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const carregarHistorico = useCallback(async () => {
    try {
      const mesStr = `${mesAtual.ano}-${String(mesAtual.mes + 1).padStart(2, '0')}`;
      const data = await getHistoricoMensal(mesStr);
      setMetrics(data);
    } catch (e) {
      console.error('Erro ao carregar histórico:', e);
    }
  }, [mesAtual]);

  // Runs on focus and whenever the selected month changes
  useFocusEffect(
    useCallback(() => {
      carregarHistorico();
    }, [carregarHistorico])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await carregarHistorico();
    setRefreshing(false);
  };

  const handleMesAnterior = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMesAtual(prev => {
      if (prev.mes === 0) return { ano: prev.ano - 1, mes: 11 };
      return { ano: prev.ano, mes: prev.mes - 1 };
    });
  };

  const handleProximoMes = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMesAtual(prev => {
      if (prev.mes === 11) return { ano: prev.ano + 1, mes: 0 };
      return { ano: prev.ano, mes: prev.mes + 1 };
    });
  };

  const [doseSelecionada, setDoseSelecionada] = useState<DoseCompleta | null>(null);

  const handleAlterarStatus = async (dose: DoseCompleta, status: StatusDose) => {
    setDoseSelecionada(null);
    await updateDoseStatus(dose.id, status);
    await carregarHistorico();
    const textos: Record<StatusDose, string> = {
      TOMADO: 'registrado como tomado',
      PULADO: 'registrado como pulado',
      PENDENTE: 'voltou para pendente',
      ATRASADO: 'marcado como atrasado',
    };
    avisar({
      mensagem: `${dose.medicamento_nome} ${textos[status]}.`,
      tipo: status === 'TOMADO' ? 'sucesso' : 'info',
      acao: {
        label: 'Desfazer',
        onPress: async () => {
          await updateDoseStatus(dose.id, dose.status);
          await carregarHistorico();
        },
      },
    });
  };

  const formatDiaHeader = (dateKey: string) => {
    try {
      const [ano, mes, dia] = dateKey.split('-').map(Number);
      const d = new Date(ano, mes - 1, dia);
      const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      return `${diasSemana[d.getDay()]}, ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
    } catch {
      return dateKey;
    }
  };

  const renderStatusIcon = (status: StatusDose) => {
    switch (status) {
      case 'TOMADO':
        return <Ionicons name="checkmark-circle-outline" size={24} color="#10B981" />;
      case 'ATRASADO':
        return <Ionicons name="time-outline" size={24} color="#F59E0B" />;
      case 'PULADO':
        return <Ionicons name="close-circle-outline" size={24} color="#EF4444" />;
      case 'PENDENTE':
      default:
        return <Ionicons name="ellipse-outline" size={24} color="#94A3B8" />;
    }
  };

  const sortedDays = Object.keys(metrics.dosesPorDia).sort((a, b) => b.localeCompare(a));

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontSize: typography.title.fontSize }]}>
          Histórico de Doses
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {/* Month Selector Bar */}
        <View style={styles.monthSelectorRow}>
          <TouchableOpacity onPress={handleMesAnterior} style={styles.monthArrow} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
          </TouchableOpacity>

          <Text style={[styles.monthText, { color: colors.textPrimary, fontSize: typography.subtitle.fontSize }]}>
            {mesesNomes[mesAtual.mes]} de {mesAtual.ano}
          </Text>

          <TouchableOpacity onPress={handleProximoMes} style={styles.monthArrow} activeOpacity={0.7}>
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* 3 Metric Cards: Tomadas, Com atraso, Puladas */}
        <View style={styles.metricsRow}>
          {[
            { label: 'Tomadas', value: metrics.tomadas, bg: '#E8FDF3', border: '#86EFAC', dot: '#10B981', text: '#065F46' },
            { label: 'Atrasadas', value: metrics.comAtraso, bg: '#FEF9C3', border: '#FDE047', dot: '#F59E0B', text: '#92400E' },
            { label: 'Puladas', value: metrics.puladas, bg: '#FEE2E2', border: '#FCA5A5', dot: '#EF4444', text: '#991B1B' },
          ].map((m) => (
            <View
              key={m.label}
              style={[styles.metricCard, { backgroundColor: m.bg, borderColor: m.border }]}
              accessible
              accessibilityLabel={`${m.value} ${m.label}`}
            >
              <Text style={[styles.metricValue, { color: m.text, fontSize: typography.titleLarge.fontSize }]}>
                {m.value}
              </Text>
              <View style={styles.metricHeader}>
                <View style={[styles.metricDot, { backgroundColor: m.dot }]} />
                <Text
                  style={[styles.metricLabel, { color: m.text, fontSize: typography.caption.fontSize }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {m.label}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Timeline by Day */}
        <View style={styles.timelineContainer}>
          {sortedDays.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Feather name="calendar" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                Nenhum registro de dose encontrado para este mês.
              </Text>
            </View>
          ) : (
            sortedDays.map((diaKey) => {
              const dosesDoDia = metrics.dosesPorDia[diaKey] || [];
              return (
                <View key={diaKey} style={styles.dayGroup}>
                  <Text style={[styles.dayHeaderTitle, { color: colors.textPrimary, fontSize: typography.bodyBold.fontSize }]}>
                    {formatDiaHeader(diaKey)}
                  </Text>

                  <View style={[styles.dayCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    {dosesDoDia.map((dose, idx) => (
                      <React.Fragment key={dose.id}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => setDoseSelecionada(dose)}
                          style={styles.doseRow}
                        >
                          <View style={styles.doseLeft}>
                            <View
                              style={[
                                styles.medColorDot,
                                {
                                  backgroundColor: dose.cor || '#2563EB',
                                  borderColor: dose.cor === '#FFFFFF' ? '#94A3B8' : 'transparent',
                                  borderWidth: dose.cor === '#FFFFFF' ? 1.5 : 0,
                                },
                              ]}
                            />
                            <NomeRemedio
                              nome={dose.medicamento_nome}
                              style={[
                                styles.medNameText,
                                { color: colors.textPrimary, fontSize: typography.body.fontSize },
                              ]}
                            />
                          </View>

                          <View style={styles.doseRight}>
                            <Text
                              style={[
                                styles.doseTimeText,
                                { color: colors.textSecondary, fontSize: typography.body.fontSize },
                              ]}
                            >
                              {dose.hora_programada}
                            </Text>
                            <View style={{ marginLeft: 12 }}>
                              {renderStatusIcon(dose.status)}
                            </View>
                          </View>
                        </TouchableOpacity>

                        {idx < dosesDoDia.length - 1 && (
                          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
                        )}
                      </React.Fragment>
                    ))}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <DoseActionModal
        dose={doseSelecionada}
        onClose={() => setDoseSelecionada(null)}
        onSelect={handleAlterarStatus}
      />
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
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 100,
  },
  monthSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 16,
  },
  monthArrow: {
    padding: 6,
  },
  monthText: {
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    gap: 6,
    maxWidth: '100%',
  },
  metricDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  metricLabel: {
    fontWeight: '700',
    flexShrink: 1,
  },
  metricValue: {
    fontWeight: '800',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  timelineContainer: {
    gap: 18,
  },
  dayGroup: {
    marginBottom: 6,
  },
  dayHeaderTitle: {
    fontWeight: '700',
    marginBottom: 8,
    marginLeft: 4,
  },
  dayCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    paddingVertical: 6,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  doseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  doseLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  medColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  medNameText: {
    fontWeight: '600',
    flex: 1,
  },
  doseRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  doseTimeText: {
    fontWeight: '500',
  },
  rowDivider: {
    height: 1,
  },
  emptyCard: {
    padding: 32,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 12,
  },
  emptyText: {
    textAlign: 'center',
  },
});
