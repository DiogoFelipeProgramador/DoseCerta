import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '../theme/themeContext';
import { useFeedback } from '../components/FeedbackProvider';
import { NomeRemedio } from '../components/NomeRemedio';
import { PillGraphic } from '../components/PillGraphic';
import { getDosePorId, updateDoseStatus, confirmarDose, snoozeDose } from '../database/sqlite';
import { fecharAvisosDaDose, MINUTOS_ADIAR } from '../services/notifications';
import { DoseCompleta } from '../types';

interface DoseTimeScreenProps {
  navigation: any;
  route: any; // params: { doseId: string }
}

/**
 * Full-screen "time to take your medicine" view, opened from a reminder.
 * One question, three big answers — nothing else competes for attention (Nielsen #8).
 */
export const DoseTimeScreen: React.FC<DoseTimeScreenProps> = ({ navigation, route }) => {
  const { colors, typography } = useTheme();
  const { avisar } = useFeedback();
  const doseId = route.params?.doseId;
  const [dose, setDose] = useState<DoseCompleta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      (async () => {
        const d = doseId ? await getDosePorId(doseId) : null;
        if (ativo) {
          setDose(d);
          setCarregando(false);
        }
      })();
      return () => {
        ativo = false;
      };
    }, [doseId])
  );

  const fechar = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'));

  const responder = async (acao: 'tomei' | 'adiar' | 'pular') => {
    if (!dose || salvando) return;
    setSalvando(true);
    try {
      let comAtraso = false;
      if (acao === 'adiar') {
        await snoozeDose(dose.id, MINUTOS_ADIAR);
      } else if (acao === 'tomei') {
        comAtraso = (await confirmarDose(dose.id)) === 'ATRASADO';
      } else {
        await updateDoseStatus(dose.id, 'PULADO');
      }
      await fecharAvisosDaDose(dose.id);
      avisar({
        mensagem:
          acao === 'tomei'
            ? comAtraso
              ? `${dose.medicamento_nome} registrado como tomado com atraso.`
              : `${dose.medicamento_nome} registrado como tomado. Muito bem!`
            : acao === 'adiar'
              ? `Vamos lembrar de ${dose.medicamento_nome} de novo em ${MINUTOS_ADIAR} minutos.`
              : `${dose.medicamento_nome} registrado como pulado.`,
        tipo: acao === 'tomei' ? 'sucesso' : 'info',
      });
      fechar();
    } finally {
      setSalvando(false);
    }
  };

  const jaRespondida = dose && dose.status !== 'PENDENTE';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.primaryLight }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={fechar} style={styles.closeButton} accessibilityLabel="Fechar" accessibilityRole="button">
          <Ionicons name="close" size={30} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {carregando ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
      ) : !dose ? (
        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.textPrimary, fontSize: typography.title.fontSize }]}>
            Este lembrete não está mais ativo
          </Text>
          <TouchableOpacity onPress={fechar} style={[styles.bigButton, { backgroundColor: colors.primary }]}>
            <Text style={[styles.bigButtonText, { fontSize: typography.bodyBold.fontSize }]}>Voltar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.badge, { backgroundColor: colors.cardBackground }]}>
            <Ionicons name="alarm" size={22} color={colors.primary} />
            <Text style={[styles.badgeText, { color: colors.primaryDark, fontSize: typography.body.fontSize }]}>
              {jaRespondida ? 'Já registrado' : `Hora do remédio · ${dose.hora_programada}`}
            </Text>
          </View>

          {dose.foto_url ? (
            <Image source={{ uri: dose.foto_url }} style={styles.photo} />
          ) : (
            <View style={styles.pill}>
              <PillGraphic forma={dose.forma_farmaceutica} cor={dose.cor} size={110} />
            </View>
          )}

          <NomeRemedio
            nome={dose.medicamento_nome}
            style={[styles.medName, { color: colors.textPrimary, fontSize: typography.titleLarge.fontSize }]}
          />
          <Text style={[styles.dosage, { color: colors.textPrimary, fontSize: typography.title.fontSize }]}>{dose.dosagem}</Text>

          {dose.orientacoes_extras ? (
            <View style={[styles.tip, { backgroundColor: colors.cardBackground, borderColor: colors.primaryBorder }]}>
              <Feather name="info" size={20} color={colors.primary} />
              <Text style={[styles.tipText, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                {dose.orientacoes_extras}
              </Text>
            </View>
          ) : null}

          {jaRespondida ? (
            <>
              <Text style={[styles.question, { color: colors.textPrimary, fontSize: typography.title.fontSize }]}>
                {dose.status === 'TOMADO' || dose.status === 'ATRASADO' ? 'Você já marcou este remédio como tomado ✓' : 'Você marcou que não vai tomar este remédio.'}
              </Text>
              <TouchableOpacity onPress={fechar} style={[styles.bigButton, { backgroundColor: colors.primary }]} accessibilityRole="button">
                <Text style={[styles.bigButtonText, { fontSize: typography.bodyBold.fontSize }]}>Voltar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.question, { color: colors.textPrimary, fontSize: typography.title.fontSize }]}>
                Você tomou o remédio?
              </Text>

              <TouchableOpacity
                onPress={() => responder('tomei')}
                disabled={salvando}
                style={[styles.bigButton, { backgroundColor: colors.primary }]}
                accessibilityRole="button"
              >
                <Ionicons name="checkmark-circle" size={32} color="#FFFFFF" />
                <Text style={[styles.bigButtonText, { fontSize: typography.title.fontSize }]}>Tomei</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => responder('adiar')}
                disabled={salvando}
                style={[styles.bigButton, styles.outlineButton, { backgroundColor: colors.cardBackground, borderColor: colors.primary }]}
                accessibilityRole="button"
              >
                <Ionicons name="time-outline" size={28} color={colors.primary} />
                <Text style={[styles.bigButtonText, { color: colors.primaryDark, fontSize: typography.bodyBold.fontSize }]}>
                  Adiar {MINUTOS_ADIAR} minutos
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => responder('pular')} disabled={salvando} style={styles.skipButton} accessibilityRole="button">
                <Text style={[styles.skipText, { color: colors.statusSkipped, fontSize: typography.body.fontSize }]}>
                  Não vou tomar agora (pular)
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  closeButton: {
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: 'stretch',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  badgeText: {
    fontWeight: '800',
  },
  photo: {
    width: 140,
    height: 140,
    borderRadius: 28,
    alignSelf: 'center',
    marginTop: 20,
  },
  pill: {
    alignItems: 'center',
    marginTop: 20,
  },
  medName: {
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 16,
  },
  dosage: {
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    marginTop: 16,
  },
  tipText: {
    flex: 1,
    fontWeight: '600',
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 20,
  },
  question: {
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 28,
    marginBottom: 16,
  },
  bigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 76,
    borderRadius: 22,
    marginBottom: 14,
    paddingHorizontal: 16,
  },
  outlineButton: {
    borderWidth: 2.5,
    minHeight: 64,
  },
  bigButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  skipButton: {
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipText: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
