import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../theme/themeContext';
import { NomeRemedio } from '../components/NomeRemedio';
import { useFeedback } from '../components/FeedbackProvider';
import {
  getRelatorioAdesao,
  getPerfilUsuario,
  prepararDoses,
  RelatorioAdesao,
  RegistroDose,
  MINUTOS_TOLERANCIA_ATRASO,
} from '../database/sqlite';
import { CustomButton } from '../components/CustomButton';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface ReportScreenProps {
  navigation: any;
}

const PERIODOS = [
  { dias: 7, label: '7 dias' },
  { dias: 30, label: '30 dias' },
  { dias: 90, label: '3 meses' },
];

const formatarData = (iso: string) => {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
};

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const pad2 = (n: number) => String(n).padStart(2, '0');

// "Ter, 14/10"
const formatarDiaCurto = (prevista: string) => {
  const [ano, mes, dia] = prevista.substring(0, 10).split('-').map(Number);
  const d = new Date(ano, mes - 1, dia);
  return `${DIAS_SEMANA[d.getDay()]}, ${pad2(dia)}/${pad2(mes)}`;
};

// realizada is an ISO (UTC) instant; shown in the phone's local time
const formatarHoraRealizada = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const diaLocalDe = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const mesmoDia = (prevista: string, iso: string) => prevista.substring(0, 10) === diaLocalDe(iso);

/** Plain-language description of one dose, e.g. "tomou às 08:12" */
const descreverRegistro = (r: RegistroDose) => {
  switch (r.status) {
    case 'TOMADO':
    case 'ATRASADO': {
      const tomou = r.status === 'ATRASADO' ? 'tomou com atraso' : 'tomou';
      if (!r.realizada) return tomou;
      return mesmoDia(r.prevista, r.realizada)
        ? `${tomou} às ${formatarHoraRealizada(r.realizada)}`
        : `${tomou} em ${formatarDiaCurto(diaLocalDe(r.realizada))} às ${formatarHoraRealizada(r.realizada)}`;
    }
    case 'PULADO':
      // Marked by the app when the day ended without a confirmation
      return r.observacao === 'Não confirmada' ? 'não confirmou' : 'pulou';
    default:
      return 'sem registro';
  }
};

const montarTextoRelatorio = (r: RelatorioAdesao, nomePaciente: string) => {
  const linhas: string[] = [];
  linhas.push('RELATÓRIO DE MEDICAMENTOS — DoseCerta');
  if (nomePaciente) linhas.push(`Paciente: ${nomePaciente}`);
  linhas.push(`Período: ${formatarData(r.inicio)} a ${formatarData(r.fim)}`);
  linhas.push('');
  linhas.push(
    r.adesaoPercentual !== null
      ? `Doses tomadas: ${r.tomadas + r.atrasadas} de ${r.totalPrevistas} (${r.adesaoPercentual}%)`
      : 'Nenhuma dose registrada no período.'
  );
  if (r.atrasadas) linhas.push(`Tomadas com atraso (mais de ${MINUTOS_TOLERANCIA_ATRASO} min): ${r.atrasadas}`);
  if (r.puladas) linhas.push(`Puladas ou não confirmadas: ${r.puladas}`);
  if (r.semRegistro) linhas.push(`Sem registro: ${r.semRegistro}`);

  for (const m of r.medicamentos) {
    const total = m.tomadas + m.atrasadas + m.puladas + m.semRegistro;
    linhas.push('');
    linhas.push(`• ${m.nome} — ${m.dosagem} às ${m.horarios.join(', ')}`);
    linhas.push(`  Tomadas ${m.tomadas + m.atrasadas}/${total}` +
      (m.atrasadas ? ` · Com atraso ${m.atrasadas}` : '') +
      (m.puladas ? ` · Puladas ${m.puladas}` : '') +
      (m.semRegistro ? ` · Sem registro ${m.semRegistro}` : ''));
    for (const reg of m.registros) {
      linhas.push(`  - ${formatarDiaCurto(reg.prevista)}, ${reg.prevista.substring(11, 16)}: ${descreverRegistro(reg)}`);
    }
  }

  linhas.push('');
  linhas.push('Registro feito pelo próprio paciente/cuidador. Não substitui avaliação médica.');
  return linhas.join('\n');
};

export const ReportScreen: React.FC<ReportScreenProps> = ({ navigation }) => {
  const { colors, typography } = useTheme();
  const { avisar } = useFeedback();
  const [dias, setDias] = useState(30);
  const [relatorio, setRelatorio] = useState<RelatorioAdesao | null>(null);
  const [nomePaciente, setNomePaciente] = useState('');
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  const alternarDatas = (medId: string) => setAbertos((prev) => ({ ...prev, [medId]: !prev[medId] }));

  const iconeStatus = (status: RegistroDose['status']) => {
    switch (status) {
      case 'TOMADO':
        return <Ionicons name="checkmark-circle" size={22} color={colors.statusTaken} />;
      case 'PULADO':
        return <Ionicons name="close-circle" size={22} color={colors.statusSkipped} />;
      case 'ATRASADO':
        return <Ionicons name="time" size={22} color={colors.statusDelayed} />;
      default:
        return <Ionicons name="ellipse-outline" size={22} color={colors.textMuted} />;
    }
  };

  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      (async () => {
        try {
          await prepararDoses();
          const [r, perfil] = await Promise.all([getRelatorioAdesao(dias), getPerfilUsuario()]);
          if (!ativo) return;
          setRelatorio(r);
          setNomePaciente(perfil?.nome || '');
        } catch (e) {
          console.error('Erro ao gerar relatório:', e);
        }
      })();
      return () => {
        ativo = false;
      };
    }, [dias])
  );

  const handleCompartilhar = async () => {
    if (!relatorio) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const mensagem = montarTextoRelatorio(relatorio, nomePaciente);
    try {
      await Share.share({ title: 'Relatório de medicamentos', message: mensagem });
    } catch (e) {
      // Some desktop browsers have no share sheet
      avisar({ mensagem: 'Não foi possível compartilhar por aqui. Tente pelo celular.', tipo: 'erro' });
    }
  };

  const resumo = relatorio
    ? [
        { label: 'No horário', value: relatorio.tomadas, bg: colors.statusTakenBg, border: colors.statusTakenBorder, text: '#065F46' },
        { label: 'Com atraso', value: relatorio.atrasadas, bg: colors.statusDelayedBg, border: colors.statusDelayedBorder, text: '#92400E' },
        { label: 'Puladas', value: relatorio.puladas, bg: colors.statusSkippedBg, border: colors.statusSkippedBorder, text: '#991B1B' },
        { label: 'Sem registro', value: relatorio.semRegistro, bg: colors.statusPendingBg, border: colors.statusPendingBorder, text: colors.textSecondary },
      ]
    : [];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7} accessibilityLabel="Voltar">
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontSize: typography.title.fontSize }]} numberOfLines={1}>
          Relatório para o médico
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Period selector */}
        <Text style={[styles.label, { color: colors.textPrimary, fontSize: typography.bodyBold.fontSize }]}>Período</Text>
        <View style={[styles.segment, { backgroundColor: colors.cardAltBg, borderColor: colors.border }]}>
          {PERIODOS.map((p) => {
            const ativo = dias === p.dias;
            return (
              <TouchableOpacity
                key={p.dias}
                style={[styles.segmentBtn, ativo && { backgroundColor: colors.cardBackground, borderColor: colors.primary }]}
                onPress={() => setDias(p.dias)}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: ativo }}
              >
                <Text
                  style={[styles.segmentText, { color: ativo ? colors.primaryDark : colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!relatorio ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Text style={[styles.periodText, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}>
              {formatarData(relatorio.inicio)} a {formatarData(relatorio.fim)}
            </Text>

            {/* Headline */}
            <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.primaryBorder }]}>
              {relatorio.adesaoPercentual !== null ? (
                <>
                  <Text style={[styles.bigNumber, { color: colors.primary }]}>{relatorio.adesaoPercentual}%</Text>
                  <Text style={[styles.headline, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                    das doses foram tomadas ({relatorio.tomadas + relatorio.atrasadas} de {relatorio.totalPrevistas})
                  </Text>
                </>
              ) : (
                <Text style={[styles.headline, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                  Nenhuma dose registrada neste período.
                </Text>
              )}
            </View>

            {/* Summary chips */}
            {relatorio.totalPrevistas > 0 && (
              <View style={styles.summaryGrid}>
                {resumo.map((r) => (
                  <View key={r.label} style={[styles.summaryItem, { backgroundColor: r.bg, borderColor: r.border }]}>
                    <Text style={[styles.summaryValue, { color: r.text, fontSize: typography.title.fontSize }]}>{r.value}</Text>
                    <Text style={[styles.summaryLabel, { color: r.text, fontSize: typography.caption.fontSize }]} numberOfLines={1} adjustsFontSizeToFit>
                      {r.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Per medication */}
            {relatorio.medicamentos.map((m) => {
              const total = m.tomadas + m.atrasadas + m.puladas + m.semRegistro;
              const pct = total > 0 ? Math.round(((m.tomadas + m.atrasadas) / total) * 100) : 0;
              return (
                <View key={m.medicamento_id} style={[styles.card, styles.medCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                  <NomeRemedio nome={m.nome} style={[styles.medName, { color: colors.textPrimary, fontSize: typography.bodyBold.fontSize }]} />
                  <Text style={[styles.medDetails, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}>
                    {m.dosagem} • {m.horarios.join(', ')}
                  </Text>
                  <View style={[styles.progressTrack, { backgroundColor: colors.cardAltBg }]}>
                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.statusTaken }]} />
                  </View>
                  <Text style={[styles.medStats, { color: colors.textPrimary, fontSize: typography.caption.fontSize + 1 }]}>
                    Tomou {m.tomadas + m.atrasadas} de {total}
                    {m.atrasadas ? ` · ${m.atrasadas} com atraso` : ''}
                    {m.puladas ? ` · pulou ${m.puladas}` : ''}
                    {m.semRegistro ? ` · ${m.semRegistro} sem registro` : ''}
                  </Text>

                  {/* Dates are collapsed by default: long periods would make the screen endless */}
                  <TouchableOpacity
                    onPress={() => alternarDatas(m.medicamento_id)}
                    style={[styles.toggleDatas, { borderColor: colors.border }]}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !!abertos[m.medicamento_id] }}
                  >
                    <Feather name="calendar" size={18} color={colors.primary} />
                    <Text style={[styles.toggleDatasText, { color: colors.primary, fontSize: typography.body.fontSize }]}>
                      {abertos[m.medicamento_id] ? 'Esconder datas' : 'Ver datas'}
                    </Text>
                    <Ionicons name={abertos[m.medicamento_id] ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} />
                  </TouchableOpacity>

                  {abertos[m.medicamento_id] &&
                    m.registros.map((reg, idx) => (
                      <View
                        key={`${reg.prevista}-${idx}`}
                        style={[styles.registroRow, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                      >
                        {iconeStatus(reg.status)}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.registroDia, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                            {formatarDiaCurto(reg.prevista)} · {reg.prevista.substring(11, 16)}
                          </Text>
                          <Text style={[styles.registroDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}>
                            {descreverRegistro(reg).replace(/^./, (c) => c.toUpperCase())}
                          </Text>
                        </View>
                      </View>
                    ))}
                </View>
              );
            })}

            <CustomButton
              title="Compartilhar relatório"
              icon={<Feather name="share-2" size={20} color="#FFFFFF" />}
              onPress={handleCompartilhar}
              variant="primary"
              size="large"
              disabled={relatorio.totalPrevistas === 0}
              style={{ marginTop: 8 }}
            />
            <Text style={[styles.hint, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
              Envie por WhatsApp, e-mail ou outro app para mostrar na consulta.
            </Text>
          </>
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
  },
  label: {
    fontWeight: '700',
    marginBottom: 8,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  segmentText: {
    fontWeight: '700',
  },
  periodText: {
    marginTop: 10,
    marginBottom: 14,
    textAlign: 'center',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 18,
    alignItems: 'center',
    marginBottom: 14,
  },
  bigNumber: {
    fontSize: 48,
    fontWeight: '900',
  },
  headline: {
    textAlign: 'center',
    fontWeight: '600',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  summaryItem: {
    flexGrow: 1,
    flexBasis: '45%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  summaryValue: {
    fontWeight: '800',
  },
  summaryLabel: {
    fontWeight: '700',
    marginTop: 2,
  },
  medCard: {
    alignItems: 'stretch',
  },
  medName: {
    fontWeight: '800',
  },
  medDetails: {
    marginTop: 2,
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  medStats: {
    marginTop: 8,
    fontWeight: '600',
  },
  toggleDatas: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  toggleDatasText: {
    fontWeight: '700',
  },
  registroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  registroDia: {
    fontWeight: '700',
  },
  registroDesc: {
    marginTop: 1,
  },
  hint: {
    textAlign: 'center',
    marginTop: 10,
  },
});
