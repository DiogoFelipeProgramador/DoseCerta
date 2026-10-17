import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, AppState } from 'react-native';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { BottomTabNavigator } from './BottomTabNavigator';
import { AIAssistantScreen } from '../screens/AIAssistantScreen';
import { MedicationsScreen } from '../screens/MedicationsScreen';
import { ReportScreen } from '../screens/ReportScreen';
import { DoseTimeScreen } from '../screens/DoseTimeScreen';
import {
  initDatabase,
  getHasCompletedOnboarding,
  setHasCompletedOnboarding,
  getPerfilUsuario,
  getDosePorId,
  updateDoseStatus,
  snoozeDose,
} from '../database/sqlite';
import {
  requestNotificationPermissions,
  sincronizarLembretes,
  ouvirRespostasLembretes,
  ouvirLembretesComAppAberto,
  fecharAvisosDaDose,
  RespostaLembrete,
  MINUTOS_ADIAR,
} from '../services/notifications';
import { useFeedback } from '../components/FeedbackProvider';
import { useTheme } from '../theme/themeContext';

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef<any>();

export const AppNavigator: React.FC = () => {
  const { colors, setTextScale, setIsHighContrast } = useTheme();
  const [loading, setLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboardingState] = useState(false);
  const { avisar } = useFeedback();

  // Reminder answers can arrive before navigation is ready (app launched from a reminder)
  const navPronta = useRef(false);
  const respostasPendentes = useRef<RespostaLembrete[]>([]);

  const abrirHoraDoRemedio = useCallback((doseId: string) => {
    if (!navigationRef.isReady()) return;
    const atual = navigationRef.getCurrentRoute();
    if (atual?.name === 'DoseTime' && (atual.params as { doseId?: string } | undefined)?.doseId === doseId) return;
    navigationRef.navigate('DoseTime', { doseId });
  }, []);

  const tratarResposta = useCallback(
    async (r: RespostaLembrete) => {
      if (!navPronta.current) {
        respostasPendentes.current.push(r);
        return;
      }
      if (r.acao === 'abrir') {
        abrirHoraDoRemedio(r.doseId);
        return;
      }
      try {
        const dose = await getDosePorId(r.doseId); // also creates that day's doses if needed
        if (!dose) return;
        if (r.acao === 'tomei') {
          await updateDoseStatus(dose.id, 'TOMADO');
          avisar({ mensagem: `${dose.medicamento_nome} registrado como tomado. Muito bem!` });
        } else {
          await snoozeDose(dose.id, MINUTOS_ADIAR);
          avisar({ mensagem: `Vamos lembrar de ${dose.medicamento_nome} de novo em ${MINUTOS_ADIAR} minutos.`, tipo: 'info' });
        }
        await fecharAvisosDaDose(dose.id);
      } catch (e) {
        console.warn('Erro ao registrar resposta do lembrete:', e);
      }
    },
    [abrirHoraDoRemedio, avisar]
  );

  const aoNavegacaoPronta = useCallback(() => {
    navPronta.current = true;
    const pendentes = respostasPendentes.current;
    respostasPendentes.current = [];
    pendentes.forEach(tratarResposta);
  }, [tratarResposta]);

  useEffect(() => {
    if (loading || !hasCompletedOnboarding) return;
    const pararRespostas = ouvirRespostasLembretes(tratarResposta);
    // With the app open, a reminder brings up the full "Hora do remédio" screen
    const pararChegada = ouvirLembretesComAppAberto(abrirHoraDoRemedio);
    // Keep the next days of reminders scheduled whenever the user comes back to the app
    const subApp = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') sincronizarLembretes();
    });
    return () => {
      pararRespostas();
      pararChegada();
      subApp.remove();
    };
  }, [loading, hasCompletedOnboarding, tratarResposta, abrirHoraDoRemedio]);

  useEffect(() => {
    const initialize = async () => {
      try {
        await initDatabase();
        const perfil = await getPerfilUsuario();
        if (perfil?.tamanho_fonte) setTextScale(perfil.tamanho_fonte);
        if (perfil?.alto_contraste) setIsHighContrast(Boolean(perfil.alto_contraste));
        await requestNotificationPermissions();
        sincronizarLembretes();
        const completed = await getHasCompletedOnboarding();
        setHasCompletedOnboardingState(completed);
      } catch (err) {
        console.warn('Erro ao inicializar app:', err);
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, []);

  const handleFinishOnboarding = async () => {
    await setHasCompletedOnboarding(true);
    setHasCompletedOnboardingState(true);
  };

  const handleResetOnboarding = async () => {
    await setHasCompletedOnboarding(false);
    setHasCompletedOnboardingState(false);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} onReady={aoNavegacaoPronta}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!hasCompletedOnboarding ? (
          <Stack.Screen name="Onboarding">
            {(props) => (
              <OnboardingScreen
                {...props}
                onFinish={handleFinishOnboarding}
              />
            )}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Main">
              {() => (
                <BottomTabNavigator
                  onResetOnboarding={handleResetOnboarding}
                />
              )}
            </Stack.Screen>
            <Stack.Screen
              name="AIAssistant"
              component={AIAssistantScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="Medications"
              component={MedicationsScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Report"
              component={ReportScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="DoseTime"
              component={DoseTimeScreen}
              options={{ animation: 'slide_from_bottom', presentation: 'fullScreenModal', gestureEnabled: false }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
