import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/themeContext';
import { useFeedback } from '../components/FeedbackProvider';
import { TextScale } from '../theme/typography';
import { getPerfilUsuario, updatePerfilUsuario } from '../database/sqlite';
import { PerfilUsuario } from '../types';
import { CustomButton } from '../components/CustomButton';
import {
  registerUserAccount,
  loginUserAccount,
  logoutUserAccount,
  triggerAutoSync,
} from '../services/supabase';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  diagnosticarLembretes,
  enviarLembreteTeste,
  requestNotificationPermissions,
  DiagnosticoLembretes,
} from '../services/notifications';
import {
  abrirAjustesSomDosLembretes,
  abrirAjustesAlarmesExatos,
  abrirAjustesBateria,
} from '../services/ajustesAndroid';
import * as Haptics from 'expo-haptics';

interface ProfileScreenProps {
  navigation: any;
  onResetOnboarding: () => void;
}

const TAMANHOS_TEXTO: Array<{ scale: TextScale; label: string; previewSize: number }> = [
  { scale: 'padrao', label: 'Normal', previewSize: 18 },
  { scale: 'grande', label: 'Grande', previewSize: 23 },
  { scale: 'extra_grande', label: 'Maior', previewSize: 28 },
];

const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  if (Platform.OS !== 'web') Haptics.impactAsync(style);
};

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation, onResetOnboarding }) => {
  const { colors, typography, textScale, setTextScale, isHighContrast, setIsHighContrast } = useTheme();
  const { avisar, confirmar } = useFeedback();
  const [lembretes, setLembretes] = useState<DiagnosticoLembretes | null>(null);

  const atualizarDiagnostico = useCallback(async () => {
    setLembretes(await diagnosticarLembretes());
  }, []);

  // Visibility of system status: shows whether reminders can actually reach the user
  const handleTestarLembrete = async () => {
    let diag = await diagnosticarLembretes();
    if (!diag.suportado) {
      avisar({ mensagem: 'Os lembretes só funcionam no app instalado no celular.', tipo: 'info' });
      return;
    }
    if (!diag.permitido) {
      await requestNotificationPermissions();
      diag = await diagnosticarLembretes();
    }
    if (!diag.permitido) {
      const abrir = await confirmar({
        titulo: 'Os avisos estão desligados',
        mensagem:
          'Sem essa permissão, o celular não consegue avisar a hora do remédio. ' +
          'Abra os ajustes, toque em "Notificações" e ligue para o DoseCerta.',
        confirmarLabel: 'Abrir ajustes do celular',
        cancelarLabel: 'Agora não',
      });
      if (abrir) Linking.openSettings();
      setLembretes(diag);
      return;
    }
    const ok = await enviarLembreteTeste(10);
    setLembretes(await diagnosticarLembretes());
    avisar(
      ok
        ? { mensagem: 'Pronto! Em 10 segundos deve chegar um aviso de teste. Pode bloquear a tela.' }
        : { mensagem: 'Não foi possível agendar o teste. Tente de novo.', tipo: 'erro' }
    );
  };

  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [nome, setNome] = useState('');
  const [nomeSalvo, setNomeSalvo] = useState(false);

  // Account (optional cloud backup)
  const [mostrarFormConta, setMostrarFormConta] = useState(false);
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [authErro, setAuthErro] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const carregarPerfil = async () => {
    const p = await getPerfilUsuario();
    setPerfil(p);
    setNome(p?.nome || '');
  };

  useFocusEffect(
    useCallback(() => {
      carregarPerfil();
      atualizarDiagnostico();
    }, [atualizarDiagnostico])
  );

  const nomeAlterado = nome.trim() !== (perfil?.nome || '');
  const isContaConectada = Boolean(perfil?.email && perfil.email.trim().length > 0);

  const handleSalvarNome = async () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    await updatePerfilUsuario({ nome: nome.trim() });
    await carregarPerfil();
    setNomeSalvo(true);
    setTimeout(() => setNomeSalvo(false), 2500);
    triggerAutoSync();
  };

  // Accessibility preferences apply and save immediately (no separate "save" step to forget)
  const handleTamanhoTexto = (scale: TextScale) => {
    haptic();
    setTextScale(scale);
    updatePerfilUsuario({ tamanho_fonte: scale });
  };

  const handleAltoContraste = (val: boolean) => {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    setIsHighContrast(val);
    updatePerfilUsuario({ alto_contraste: val });
  };

  const trocarModoConta = (mode: 'register' | 'login') => {
    haptic();
    setAuthMode(mode);
    setAuthErro('');
  };

  const fecharFormConta = () => {
    setMostrarFormConta(false);
    setAuthEmail('');
    setAuthPassword('');
    setAuthErro('');
  };

  const handleAuthSubmit = async () => {
    const email = authEmail.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setAuthErro('Digite um e-mail válido, por exemplo: maria@email.com');
      return;
    }
    if (authPassword.length < 6) {
      setAuthErro('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    setAuthErro('');
    setAuthLoading(true);
    haptic(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const res =
        authMode === 'register'
          ? await registerUserAccount(email, authPassword, nome)
          : await loginUserAccount(email, authPassword);

      if (res.success) {
        fecharFormConta();
        await carregarPerfil();
        avisar({ mensagem: authMode === 'register' ? 'Conta criada! Seus dados agora têm cópia de segurança.' : 'Pronto, você entrou na sua conta.' });
      } else {
        setAuthErro(res.message);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    const ok = await confirmar({
      titulo: 'Sair da conta?',
      mensagem: 'Seus remédios e seu histórico continuam guardados neste celular.',
      confirmarLabel: 'Sim, sair',
      cancelarLabel: 'Continuar conectado',
      destrutivo: true,
    });
    if (!ok) return;
    await logoutUserAccount();
    await carregarPerfil();
    avisar({ mensagem: 'Você saiu da conta.', tipo: 'info' });
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.cardAltBg,
      borderColor: colors.border,
      color: colors.textPrimary,
      fontSize: typography.body.fontSize,
    },
  ];

  const renderSectionTitle = (icon: React.ReactNode, title: string) => (
    <View style={styles.sectionHeader}>
      {icon}
      <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontSize: typography.subtitle.fontSize }]}>
        {title}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontSize: typography.title.fontSize }]}>
          Meu Perfil
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Identity */}
        <View style={[styles.sectionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={styles.userHeader}>
            <View style={[styles.avatar, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
              <Feather name="user" size={30} color={colors.primary} />
            </View>
            <View style={styles.userHeaderText}>
              <Text
                style={[styles.userName, { color: colors.textPrimary, fontSize: typography.subtitle.fontSize }]}
                numberOfLines={2}
              >
                {perfil?.nome || 'Olá!'}
              </Text>
              <Text style={[styles.userRole, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                {isContaConectada ? perfil?.email : 'Usando sem conta'}
              </Text>
            </View>
          </View>

          <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: typography.caption.fontSize + 1 }]}>
            Como podemos te chamar?
          </Text>
          <TextInput
            style={inputStyle}
            value={nome}
            onChangeText={(t) => {
              setNome(t);
              setNomeSalvo(false);
            }}
            placeholder="Seu nome"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={() => nomeAlterado && handleSalvarNome()}
          />

          {nomeSalvo ? (
            <View style={styles.feedbackRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.statusTaken} />
              <Text style={[styles.feedbackText, { color: colors.statusTaken, fontSize: typography.caption.fontSize }]}>
                Nome salvo
              </Text>
            </View>
          ) : (
            nomeAlterado && (
              <CustomButton
                title="Salvar nome"
                onPress={handleSalvarNome}
                variant="primary"
                size="normal"
                style={{ marginTop: 12 }}
              />
            )
          )}
        </View>

        {/* Where data lives + optional account */}
        <View style={[styles.sectionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          {renderSectionTitle(
            <Feather name={isContaConectada ? 'cloud' : 'smartphone'} size={22} color={colors.primary} />,
            'Seus dados'
          )}

          <View
            style={[
              styles.statusBox,
              isContaConectada
                ? { backgroundColor: colors.primaryLight, borderColor: colors.primaryBorder }
                : { backgroundColor: colors.cardAltBg, borderColor: colors.border },
            ]}
          >
            <Ionicons
              name={isContaConectada ? 'cloud-done-outline' : 'phone-portrait-outline'}
              size={26}
              color={isContaConectada ? colors.primary : colors.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { color: colors.textPrimary, fontSize: typography.bodyBold.fontSize }]}>
                {isContaConectada ? 'Cópia de segurança ativa' : 'Guardados neste celular'}
              </Text>
              <Text style={[styles.statusText, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                {isContaConectada
                  ? 'Seus remédios também ficam salvos na sua conta.'
                  : 'Você não precisa de conta para usar o app.'}
              </Text>
            </View>
          </View>

          {isContaConectada ? (
            <TouchableOpacity
              onPress={handleLogout}
              style={[styles.linkRow, { borderColor: colors.border }]}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Feather name="log-out" size={20} color={colors.statusSkipped} />
              <Text style={[styles.linkRowText, { color: colors.statusSkipped, fontSize: typography.body.fontSize }]}>
                Sair da conta
              </Text>
            </TouchableOpacity>
          ) : !mostrarFormConta ? (
            <>
              <Text style={[styles.helperText, { color: colors.textSecondary, fontSize: typography.bodySmall.fontSize }]}>
                Quer guardar uma cópia para não perder nada se trocar de celular? Crie uma conta (opcional).
              </Text>
              <CustomButton
                title="Criar conta ou entrar"
                icon={<Feather name="cloud" size={20} color={colors.primary} />}
                onPress={() => {
                  haptic();
                  setMostrarFormConta(true);
                }}
                variant="outline"
                size="large"
              />
            </>
          ) : (
            <View>
              {/* Segmented control */}
              <View style={[styles.segment, { backgroundColor: colors.cardAltBg, borderColor: colors.border }]}>
                {(['register', 'login'] as const).map((mode) => {
                  const ativo = authMode === mode;
                  return (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.segmentBtn, ativo && { backgroundColor: colors.cardBackground, borderColor: colors.primary }]}
                      onPress={() => trocarModoConta(mode)}
                      activeOpacity={0.8}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: ativo }}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          { color: ativo ? colors.primaryDark : colors.textSecondary, fontSize: typography.caption.fontSize + 1 },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {mode === 'register' ? 'Criar conta' : 'Já tenho conta'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: typography.caption.fontSize + 1 }]}>
                E-mail
              </Text>
              <TextInput
                style={inputStyle}
                value={authEmail}
                onChangeText={(t) => {
                  setAuthEmail(t);
                  setAuthErro('');
                }}
                placeholder="maria@email.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />

              <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: typography.caption.fontSize + 1 }]}>
                Senha
              </Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={[inputStyle, { paddingRight: 52 }]}
                  value={authPassword}
                  onChangeText={(t) => {
                    setAuthPassword(t);
                    setAuthErro('');
                  }}
                  placeholder="Mínimo de 6 caracteres"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!mostrarSenha}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setMostrarSenha((v) => !v)}
                  accessibilityLabel={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}
                >
                  <Feather name={mostrarSenha ? 'eye-off' : 'eye'} size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {authErro ? (
                <View style={[styles.errorBox, { backgroundColor: colors.statusSkippedBg, borderColor: colors.statusSkippedBorder }]}>
                  <Ionicons name="alert-circle-outline" size={20} color={colors.statusSkipped} />
                  <Text style={[styles.errorText, { fontSize: typography.caption.fontSize }]}>{authErro}</Text>
                </View>
              ) : null}

              <CustomButton
                title={authMode === 'register' ? 'Criar conta' : 'Entrar'}
                onPress={handleAuthSubmit}
                loading={authLoading}
                variant="primary"
                size="large"
                style={{ marginTop: 16 }}
              />

              <TouchableOpacity onPress={fecharFormConta} style={styles.cancelLink} activeOpacity={0.7}>
                <Text style={[styles.cancelLinkText, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                  Agora não
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Reading / accessibility */}
        <View style={[styles.sectionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          {renderSectionTitle(
            <MaterialCommunityIcons name="format-size" size={22} color={colors.primary} />,
            'Leitura'
          )}
          <Text style={[styles.helperText, { color: colors.textSecondary, fontSize: typography.bodySmall.fontSize }]}>
            Tamanho das letras. A mudança vale na hora.
          </Text>

          <View style={styles.scaleRow}>
            {TAMANHOS_TEXTO.map((item) => {
              const isSelected = textScale === item.scale;
              return (
                <TouchableOpacity
                  key={item.scale}
                  style={[
                    styles.scaleOption,
                    {
                      backgroundColor: isSelected ? colors.primaryLight : colors.cardAltBg,
                      borderColor: isSelected ? colors.primary : colors.border,
                      borderWidth: isSelected ? 2.5 : 1,
                    },
                  ]}
                  onPress={() => handleTamanhoTexto(item.scale)}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`Letra ${item.label}`}
                >
                  <Text style={{ fontSize: item.previewSize, fontWeight: '800', color: isSelected ? colors.primaryDark : colors.textPrimary }}>
                    Aa
                  </Text>
                  <Text
                    style={[styles.scaleLabel, { color: isSelected ? colors.primaryDark : colors.textSecondary }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.switchRow, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.switchTitle, { color: colors.textPrimary, fontSize: typography.bodyBold.fontSize }]}>
                Alto contraste
              </Text>
              <Text style={[styles.switchSub, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                Cores mais fortes para enxergar melhor.
              </Text>
            </View>
            <Switch
              value={isHighContrast}
              onValueChange={handleAltoContraste}
              trackColor={{ false: '#CBD5E1', true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Reminders: make sure they really ring (status + direct shortcuts to phone settings) */}
        <View style={[styles.sectionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          {renderSectionTitle(<Ionicons name="notifications-outline" size={22} color={colors.primary} />, 'Avisos do remédio')}

          {lembretes?.suportado ? (
            <View
              style={[
                styles.statusBox,
                lembretes.permitido
                  ? { backgroundColor: colors.primaryLight, borderColor: colors.primaryBorder }
                  : { backgroundColor: colors.statusSkippedBg, borderColor: colors.statusSkippedBorder },
              ]}
            >
              <Ionicons
                name={lembretes.permitido ? 'checkmark-circle' : 'alert-circle'}
                size={26}
                color={lembretes.permitido ? colors.primary : colors.statusSkipped}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.statusTitle, { color: colors.textPrimary, fontSize: typography.bodyBold.fontSize }]}>
                  {lembretes.permitido ? 'Avisos ligados' : 'Avisos desligados'}
                </Text>
                <Text style={[styles.statusText, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                  {lembretes.permitido
                    ? `${lembretes.agendados} ${lembretes.agendados === 1 ? 'aviso programado' : 'avisos programados'} para os próximos dias`
                    : 'Toque em "Testar aviso agora" para resolver.'}
                </Text>
              </View>
            </View>
          ) : null}

          <CustomButton
            title="Testar aviso agora"
            icon={<Ionicons name="notifications" size={20} color="#FFFFFF" />}
            onPress={handleTestarLembrete}
            variant="primary"
            size="large"
            style={{ marginTop: 14 }}
          />

          {Platform.OS === 'android' && (
            <>
              <Text style={[styles.helperText, { color: colors.textSecondary, fontSize: typography.bodySmall.fontSize }]}>
                O aviso não tocou, atrasou ou veio sem som? Ajuste estes 3 itens no celular:
              </Text>
          <TouchableOpacity onPress={abrirAjustesSomDosLembretes} style={styles.ajusteRow} activeOpacity={0.7} accessibilityRole="button">
            <View style={[styles.ajusteIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="volume-high-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuRowText, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>Som e "Não perturbe"</Text>
              <Text style={{ color: colors.textSecondary, fontSize: typography.caption.fontSize, marginTop: 2 }}>
                Ligue o som e a opção "Ignorar Não perturbe".
              </Text>
            </View>
            <Feather name="external-link" size={20} color={colors.primary} />
          </TouchableOpacity>

              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity onPress={abrirAjustesAlarmesExatos} style={styles.ajusteRow} activeOpacity={0.7} accessibilityRole="button">
            <View style={[styles.ajusteIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="alarm-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuRowText, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>Tocar na hora certa</Text>
              <Text style={{ color: colors.textSecondary, fontSize: typography.caption.fontSize, marginTop: 2 }}>
                Permita "Alarmes e lembretes".
              </Text>
            </View>
            <Feather name="external-link" size={20} color={colors.primary} />
          </TouchableOpacity>

              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity onPress={abrirAjustesBateria} style={styles.ajusteRow} activeOpacity={0.7} accessibilityRole="button">
            <View style={[styles.ajusteIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="battery-charging-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuRowText, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>Bateria</Text>
              <Text style={{ color: colors.textSecondary, fontSize: typography.caption.fontSize, marginTop: 2 }}>
                Toque em "Bateria" e escolha "Sem restrições".
              </Text>
            </View>
            <Feather name="external-link" size={20} color={colors.primary} />
          </TouchableOpacity>

            </>
          )}
        </View>

        {/* Help */}
        <View style={[styles.sectionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          {renderSectionTitle(<Feather name="help-circle" size={22} color={colors.primary} />, 'Ajuda')}

          <TouchableOpacity
            onPress={() => navigation.navigate('Medications')}
            style={styles.menuRow}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="pill" size={22} color={colors.textSecondary} />
            <Text style={[styles.menuRowText, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
              Gerenciar medicamentos
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />

          <TouchableOpacity
            onPress={() => navigation.navigate('AIAssistant')}
            style={styles.menuRow}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="robot-outline" size={22} color={colors.textSecondary} />
            <Text style={[styles.menuRowText, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
              Tirar dúvidas com o assistente
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />

          <TouchableOpacity onPress={onResetOnboarding} style={styles.menuRow} activeOpacity={0.7}>
            <Feather name="play-circle" size={22} color={colors.textSecondary} />
            <Text style={[styles.menuRowText, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
              Ver a apresentação do app
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
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
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: '800',
    flexShrink: 1,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  userHeaderText: {
    marginLeft: 14,
    flex: 1,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    fontWeight: '800',
  },
  userRole: {
    marginTop: 2,
  },
  inputLabel: {
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 52,
    marginBottom: 8,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  feedbackText: {
    fontWeight: '700',
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusTitle: {
    fontWeight: '700',
  },
  statusText: {
    marginTop: 2,
  },
  helperText: {
    lineHeight: 24,
    marginTop: 12,
    marginBottom: 12,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 52,
  },
  linkRowText: {
    fontWeight: '700',
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    marginTop: 14,
    marginBottom: 12,
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
    textAlign: 'center',
  },
  passwordWrapper: {
    justifyContent: 'center',
  },
  eyeButton: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 8,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  errorText: {
    flex: 1,
    color: '#991B1B',
    fontWeight: '600',
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  cancelLinkText: {
    fontWeight: '600',
  },
  scaleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  scaleOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 16,
    minHeight: 86,
  },
  scaleLabel: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  switchTitle: {
    fontWeight: '700',
  },
  switchSub: {
    marginTop: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
  },
  menuRowText: {
    flex: 1,
    fontWeight: '600',
  },
  ajusteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 8,
  },
  ajusteIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowDivider: {
    height: 1,
    marginVertical: 4,
  },
});
