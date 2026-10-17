import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  TextInput,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/themeContext';
import { useFeedback } from '../components/FeedbackProvider';
import { getPerfilUsuario, updatePerfilUsuario } from '../database/sqlite';
import { PerfilUsuario } from '../types';
import { CustomButton } from '../components/CustomButton';
import { Ionicons, Feather, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface CaregiverScreenProps {
  navigation: any;
}

export const CaregiverScreen: React.FC<CaregiverScreenProps> = ({ navigation }) => {
  const { colors, typography } = useTheme();
  const { avisar } = useFeedback();
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [nomeCuidador, setNomeCuidador] = useState('');
  const [telefoneCuidador, setTelefoneCuidador] = useState('');
  const [notificarAtraso, setNotificarAtraso] = useState(true);

  const carregarPerfil = useCallback(async () => {
    const p = await getPerfilUsuario();
    if (p) {
      setPerfil(p);
      setNomeCuidador(p.nome_cuidador || '');
      setTelefoneCuidador(p.telefone_cuidador || '');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregarPerfil();
    }, [carregarPerfil])
  );

  // The card and the shortcuts reflect what is SAVED, not what is being typed in the form
  const nomeSalvo = perfil?.nome_cuidador?.trim() || '';
  const rawNumber = (perfil?.telefone_cuidador || '').replace(/\D/g, '');
  const temTelefone = rawNumber.length >= 10;
  const temCuidador = Boolean(nomeSalvo || temTelefone);

  const formatarTelefone = (digits: string) => {
    const d = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return digits;
  };

  const avisarSemTelefone = () => {
    avisar({ mensagem: 'Cadastre o telefone do cuidador abaixo para usar este atalho.', tipo: 'info' });
  };

  const handleLigar = () => {
    if (!temTelefone) return avisarSemTelefone();
    Linking.openURL(`tel:${rawNumber}`);
  };

  const handleWhatsApp = () => {
    if (!temTelefone) return avisarSemTelefone();
    const numeroComDDI = rawNumber.startsWith('55') && rawNumber.length > 11 ? rawNumber : `55${rawNumber}`;
    const msg = encodeURIComponent(
      `Olá! Estou usando o DoseCerta para gerenciar meus remédios hoje.`
    );
    Linking.openURL(`https://wa.me/${numeroComDDI}?text=${msg}`);
  };

  const handleSalvarCuidador = async () => {
    const digitos = telefoneCuidador.replace(/\D/g, '');
    if (digitos.length > 0 && digitos.length < 10) {
      avisar({ mensagem: 'Telefone incompleto. Digite com DDD, por exemplo: (11) 98765-4321', tipo: 'erro' });
      return;
    }
    await updatePerfilUsuario({
      nome_cuidador: nomeCuidador.trim(),
      telefone_cuidador: digitos ? formatarTelefone(digitos) : '',
    });
    await carregarPerfil();
    avisar({ mensagem: 'Dados do cuidador salvos.' });
  };

  const handleGerarRelatorioMedico = () => {
    navigation.navigate('Report');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontSize: typography.title.fontSize }]}>
          Cuidador & Contatos
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Main Caregiver Card */}
        <View style={[styles.caregiverHeroCard, { backgroundColor: colors.cardBackground, borderColor: colors.primaryBorder }]}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
            <FontAwesome5 name="user-nurse" size={32} color={colors.primary} />
          </View>

          <Text style={[styles.caregiverName, { color: colors.textPrimary, fontSize: typography.subtitle.fontSize }]}>
            {nomeSalvo || (temCuidador ? 'Seu cuidador' : 'Nenhum cuidador cadastrado')}
          </Text>
          <Text style={[styles.caregiverPhone, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
            {temTelefone ? formatarTelefone(rawNumber) : 'Cadastre o telefone abaixo para ligar ou mandar mensagem'}
          </Text>

          {/* Quick Call & WhatsApp Buttons */}
          <View style={[styles.actionButtonsRow, !temTelefone && { opacity: 0.5 }]}>
            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: colors.primaryLight, borderColor: colors.primaryBorder }]}
              onPress={handleLigar}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Ligar para o cuidador"
            >
              <View style={[styles.quickActionIcon, { backgroundColor: colors.primary }]}>
                <Feather name="phone" size={20} color="#FFFFFF" />
              </View>
              <Text style={[styles.quickActionText, { color: colors.primaryDark, fontSize: typography.body.fontSize }]}>
                Ligar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: '#E8FAF0', borderColor: '#A7EBC4' }]}
              onPress={handleWhatsApp}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Enviar mensagem no WhatsApp"
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#25D366' }]}>
                <FontAwesome5 name="whatsapp" size={22} color="#FFFFFF" />
              </View>
              <Text style={[styles.quickActionText, { color: '#128C4B', fontSize: typography.body.fontSize }]}>
                WhatsApp
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Caregiver Settings Form */}
        <View style={[styles.sectionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontSize: typography.subtitle.fontSize }]}>
            Configurar Cuidador Responsável
          </Text>

          <Text style={[styles.inputLabel, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}>
            Nome do Cuidador / Familiar
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.cardAltBg, borderColor: colors.border, color: colors.textPrimary, fontSize: typography.body.fontSize }]}
            value={nomeCuidador}
            onChangeText={setNomeCuidador}
            placeholder="Nome da pessoa"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[styles.inputLabel, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1, marginTop: 12 }]}>
            Telefone com DDD
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.cardAltBg, borderColor: colors.border, color: colors.textPrimary, fontSize: typography.body.fontSize }]}
            value={telefoneCuidador}
            onChangeText={setTelefoneCuidador}
            placeholder="(00) 00000-0000"
            keyboardType="phone-pad"
            placeholderTextColor={colors.textMuted}
          />

          {/* Automatic Alert Switch */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={[styles.switchTitle, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                Avisar cuidador em atrasos
              </Text>
              <Text style={[styles.switchSub, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                Envia notificação se uma dose estiver atrasada há mais de 30 minutos.
              </Text>
            </View>
            <Switch
              value={notificarAtraso}
              onValueChange={setNotificarAtraso}
              trackColor={{ false: '#CBD5E1', true: colors.primaryBorder }}
              thumbColor={notificarAtraso ? colors.primary : '#F1F5F9'}
            />
          </View>

          <CustomButton
            title="Salvar Alterações"
            onPress={handleSalvarCuidador}
            variant="primary"
            size="normal"
            style={{ marginTop: 16 }}
          />
        </View>

        {/* Doctor Summary Report */}
        <View style={[styles.sectionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontSize: typography.subtitle.fontSize }]}>
            Relatório para o Médico
          </Text>
          <Text style={[styles.reportDesc, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
            Gere um resumo impresso ou digital com as doses tomadas e atrasos para levar à sua consulta médica.
          </Text>

          <CustomButton
            title="Gerar Resumo da Consulta"
            icon={<Feather name="file-text" size={20} color={colors.primary} />}
            onPress={handleGerarRelatorioMedico}
            variant="outline"
            size="large"
            style={{ marginTop: 12 }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontWeight: '800',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 100,
    gap: 16,
  },
  caregiverHeroCard: {
    borderRadius: 24,
    borderWidth: 2,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  caregiverName: {
    fontWeight: '800',
    marginBottom: 4,
  },
  caregiverPhone: {
    fontWeight: '500',
    marginBottom: 16,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  quickActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    gap: 8,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionText: {
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 18,
  },
  sectionTitle: {
    fontWeight: '800',
    marginBottom: 12,
  },
  inputLabel: {
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 50,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  switchTitle: {
    fontWeight: '700',
  },
  switchSub: {
    marginTop: 2,
  },
  reportDesc: {
    lineHeight: 24,
  },
});
