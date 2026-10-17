import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/themeContext';
import { MensagemChat } from '../types';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { consultarAssistenteIA } from '../services/ai';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface AIAssistantScreenProps {
  navigation: any;
}

const SUGESTOES_RAPIDAS = [
  'Como tomar meus remédios com segurança?',
  'O que fazer se esquecer uma dose?',
  'Posso tomar remédio com leite ou suco?',
  'O que é posologia?',
];

export const AIAssistantScreen: React.FC<AIAssistantScreenProps> = ({ navigation }) => {
  const { colors, typography } = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);

  const [mensagens, setMensagens] = useState<MensagemChat[]>([
    {
      id: 'msg-welcome',
      remetente: 'ia',
      texto:
        'Olá! Sou o assistente virtual do DoseCerta. Posso tirar dúvidas gerais sobre uso e cuidados com remédios. Lembre-se: sempre consulte seu médico ou farmacêutico!',
      data_hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputTexto, setInputTexto] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [mensagens]);

  const formatHoraAtual = () => {
    const agora = new Date();
    return `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  };

  const handleEnviar = async (textoCustom?: string) => {
    const textoParaEnviar = (textoCustom || inputTexto).trim();
    if (!textoParaEnviar || carregando) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const novaMensagemUsuario: MensagemChat = {
      id: `msg-${Date.now()}`,
      remetente: 'usuario',
      texto: textoParaEnviar,
      data_hora: formatHoraAtual(),
    };

    setMensagens(prev => [...prev, novaMensagemUsuario]);
    setInputTexto('');
    setCarregando(true);

    try {
      const historicoFormatado = mensagens.map(m => ({
        remetente: m.remetente as 'usuario' | 'ia',
        texto: m.texto,
      }));

      const respostaTexto = await consultarAssistenteIA(textoParaEnviar, historicoFormatado);

      const novaMensagemIA: MensagemChat = {
        id: `msg-${Date.now() + 1}`,
        remetente: 'ia',
        texto: respostaTexto,
        data_hora: formatHoraAtual(),
      };

      setMensagens(prev => [...prev, novaMensagemIA]);
    } catch (e) {
      console.error('Erro na resposta da IA:', e);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <View style={[styles.botIconBadge, { backgroundColor: colors.primaryLight }]}>
            <MaterialCommunityIcons name="robot-outline" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.textPrimary, fontSize: typography.title.fontSize }]}>
            Assistente de IA
          </Text>
        </View>

        {/* Spacer keeps the title centered (same width as the back button) */}
        <View style={styles.headerButton} />
      </View>

      {/* Heuristic 5: Error Prevention & Disclaimer Banner */}
      <DisclaimerBanner />

      {/* Chat Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.chatScroll}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {mensagens.map((msg) => {
            const isUser = msg.remetente === 'usuario';
            return (
              <View
                key={msg.id}
                style={[
                  styles.messageWrapper,
                  isUser ? styles.userMessageWrapper : styles.iaMessageWrapper,
                ]}
              >
                {!isUser && (
                  <View style={[styles.iaAvatar, { backgroundColor: colors.primaryLight }]}>
                    <MaterialCommunityIcons name="robot-outline" size={16} color={colors.primary} />
                  </View>
                )}

                <View
                  style={[
                    styles.bubble,
                    isUser
                      ? [styles.userBubble, { backgroundColor: colors.primary }]
                      : [styles.iaBubble, { backgroundColor: colors.cardBackground, borderColor: colors.border }],
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      {
                        color: isUser ? '#FFFFFF' : colors.textPrimary,
                        fontSize: typography.body.fontSize,
                      },
                    ]}
                  >
                    {msg.texto}
                  </Text>
                  <Text
                    style={[
                      styles.messageTime,
                      {
                        color: isUser ? 'rgba(255,255,255,0.7)' : colors.textMuted,
                        fontSize: typography.caption.fontSize - 2,
                      },
                    ]}
                  >
                    {msg.data_hora}
                  </Text>
                </View>
              </View>
            );
          })}

          {carregando && (
            <View style={styles.loadingBubbleRow}>
              <View style={[styles.iaAvatar, { backgroundColor: colors.primaryLight }]}>
                <MaterialCommunityIcons name="robot-outline" size={16} color={colors.primary} />
              </View>
              <View style={[styles.loadingBubble, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ marginLeft: 8, color: colors.textSecondary, fontSize: typography.caption.fontSize }}>
                  Consultando bula e orientações seguras...
                </Text>
              </View>
            </View>
          )}

          {/* Quick Suggestions Chips */}
          <View style={styles.suggestionsContainer}>
            <Text style={[styles.suggestionsTitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
              Perguntas frequentes:
            </Text>
            <View style={styles.chipsRow}>
              {SUGESTOES_RAPIDAS.map((sug) => (
                <TouchableOpacity
                  key={sug}
                  style={[styles.chip, { backgroundColor: colors.cardBackground, borderColor: colors.primaryBorder }]}
                  onPress={() => handleEnviar(sug)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, { color: colors.primaryDark, fontSize: typography.caption.fontSize }]}>
                    {sug}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Input Bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.cardBackground, borderTopColor: colors.border }]}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.cardAltBg,
                color: colors.textPrimary,
                fontSize: typography.body.fontSize,
              },
            ]}
            placeholder="Pergunte sobre seus medicamentos..."
            placeholderTextColor={colors.textMuted}
            value={inputTexto}
            onChangeText={setInputTexto}
            onSubmitEditing={() => handleEnviar()}
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: colors.primary }]}
            onPress={() => handleEnviar()}
            activeOpacity={0.8}
            disabled={carregando}
          >
            <Ionicons name="send" size={20} color="#FFFFFF" style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  botIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontWeight: '800',
  },
  chatScroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  messageWrapper: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  userMessageWrapper: {
    justifyContent: 'flex-end',
  },
  iaMessageWrapper: {
    justifyContent: 'flex-start',
  },
  iaAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  bubble: {
    maxWidth: '82%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  iaBubble: {
    borderBottomLeftRadius: 4,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  messageText: {
    lineHeight: 24,
  },
  messageTime: {
    textAlign: 'right',
    marginTop: 4,
  },
  loadingBubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  suggestionsContainer: {
    marginTop: 16,
    marginBottom: 8,
  },
  suggestionsTitle: {
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  chipText: {
    fontWeight: '600',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 50,
    borderRadius: 25,
    paddingHorizontal: 20,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
});
