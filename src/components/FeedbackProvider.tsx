import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/themeContext';

/**
 * App-wide feedback, replacing the native Alert boxes:
 * - Aviso (toast): non-blocking message at the top, large text, stays long enough to read
 *   (older users read slower) and can carry an action such as "Desfazer" (Nielsen #1, #3).
 * - Confirmação: bottom sheet with big buttons for destructive actions only (Nielsen #5).
 */

type TipoAviso = 'sucesso' | 'info' | 'erro';

interface AvisoOptions {
  mensagem: string;
  tipo?: TipoAviso;
  acao?: { label: string; onPress: () => void };
}

interface ConfirmarOptions {
  titulo: string;
  mensagem?: string;
  confirmarLabel: string;
  cancelarLabel?: string;
  destrutivo?: boolean;
}

interface FeedbackContextType {
  avisar: (opts: AvisoOptions) => void;
  confirmar: (opts: ConfirmarOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextType>({
  avisar: () => {},
  confirmar: async () => false,
});

export const useFeedback = () => useContext(FeedbackContext);

const DURACAO_MS = 6000;
const DURACAO_COM_ACAO_MS = 9000;

export const FeedbackProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();

  const [aviso, setAviso] = useState<(AvisoOptions & { id: number }) | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [confirmacao, setConfirmacao] = useState<ConfirmarOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const fecharAviso = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => {
      // A new aviso interrupts this fade-out; only clear when it really finished
      if (finished) setAviso(null);
    });
  }, [opacity]);

  const avisar = useCallback(
    (opts: AvisoOptions) => {
      if (timer.current) clearTimeout(timer.current);
      setAviso({ ...opts, id: Date.now() });
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start();
      AccessibilityInfo.announceForAccessibility(opts.mensagem);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(
          opts.tipo === 'erro' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success
        );
      }
      timer.current = setTimeout(fecharAviso, opts.acao ? DURACAO_COM_ACAO_MS : DURACAO_MS);
    },
    [opacity, fecharAviso]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const confirmar = useCallback((opts: ConfirmarOptions) => {
    setConfirmacao(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const responder = (valor: boolean) => {
    resolver.current?.(valor);
    resolver.current = null;
    setConfirmacao(null);
  };

  const estiloAviso = {
    sucesso: { bg: '#065F46', icon: 'checkmark-circle' as const },
    info: { bg: '#1E293B', icon: 'information-circle' as const },
    erro: { bg: '#991B1B', icon: 'alert-circle' as const },
  }[aviso?.tipo || 'sucesso'];

  return (
    <FeedbackContext.Provider value={{ avisar, confirmar }}>
      {children}

      {aviso && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.avisoContainer, { top: insets.top + 8, opacity }]}
        >
          <Pressable
            onPress={fecharAviso}
            style={[styles.aviso, { backgroundColor: estiloAviso.bg }]}
            accessibilityRole="alert"
            accessibilityHint="Toque para fechar"
          >
            <Ionicons name={estiloAviso.icon} size={28} color="#FFFFFF" />
            <Text style={[styles.avisoTexto, { fontSize: typography.body.fontSize }]}>{aviso.mensagem}</Text>
            {aviso.acao && (
              <TouchableOpacity
                onPress={() => {
                  aviso.acao?.onPress();
                  fecharAviso();
                }}
                style={styles.avisoAcao}
                accessibilityRole="button"
              >
                <Text style={[styles.avisoAcaoTexto, { fontSize: typography.body.fontSize }]}>{aviso.acao.label}</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Animated.View>
      )}

      <Modal visible={!!confirmacao} transparent animationType="slide" onRequestClose={() => responder(false)} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => responder(false)} accessibilityLabel="Fechar" />
        {confirmacao && (
          <View
            style={[styles.sheet, { backgroundColor: colors.cardBackground, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
            accessibilityViewIsModal
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitulo, { color: colors.textPrimary, fontSize: typography.title.fontSize }]}>
              {confirmacao.titulo}
            </Text>
            {confirmacao.mensagem ? (
              <Text style={[styles.sheetMensagem, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                {confirmacao.mensagem}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.sheetBotao,
                { backgroundColor: confirmacao.destrutivo ? colors.statusSkipped : colors.primary },
              ]}
              onPress={() => responder(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={[styles.sheetBotaoTexto, { color: '#FFFFFF', fontSize: typography.bodyBold.fontSize }]}>
                {confirmacao.confirmarLabel}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sheetBotao, styles.sheetBotaoSecundario, { borderColor: colors.border, backgroundColor: colors.cardAltBg }]}
              onPress={() => responder(false)}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={[styles.sheetBotaoTexto, { color: colors.textPrimary, fontSize: typography.bodyBold.fontSize }]}>
                {confirmacao.cancelarLabel || 'Cancelar'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </FeedbackContext.Provider>
  );
};

const styles = StyleSheet.create({
  avisoContainer: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1000,
    elevation: 1000,
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    minHeight: 64,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  avisoTexto: {
    flex: 1,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  avisoAcao: {
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  avisoAcaoTexto: {
    color: '#FFFFFF',
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
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
    marginBottom: 18,
  },
  sheetTitulo: {
    fontWeight: '800',
  },
  sheetMensagem: {
    marginTop: 8,
    lineHeight: 26,
  },
  sheetBotao: {
    minHeight: 60,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sheetBotaoSecundario: {
    borderWidth: 1.5,
    marginTop: 12,
  },
  sheetBotaoTexto: {
    fontWeight: '800',
    textAlign: 'center',
  },
});
