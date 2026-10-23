import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Shortcuts to the exact Android settings screens that decide whether a reminder rings on
 * time. These live deep in the phone's menus (especially on Samsung), so asking older users
 * to find them alone isn't realistic.
 */

const PACOTE = Constants.expoConfig?.android?.package ?? 'com.dosecerta.app';
// Android channel used by every medication reminder (channel settings are fixed once created;
// to change sound/vibration later, use a new channel id and delete the old one)
export const CANAL_LEMBRETES = 'alarme-remedios-v2';
export const CANAIS_ANTIGOS = ['lembretes-remedios', 'alarme-remedios'];

const abrir = async (acao: string, params: { data?: string; extra?: Record<string, any> } = {}) => {
  if (Platform.OS !== 'android') {
    Linking.openSettings();
    return;
  }
  try {
    const IntentLauncher = require('expo-intent-launcher');
    await IntentLauncher.startActivityAsync(acao, params);
  } catch (e) {
    // Older Android or a manufacturer without this screen: fall back to the app's info page
    console.log('Ajuste não disponível, abrindo informações do app:', e);
    Linking.openSettings();
  }
};

/** Sound, pop-up and "ignore Do Not Disturb" for the medication reminders category */
export const abrirAjustesSomDosLembretes = () =>
  abrir('android.settings.CHANNEL_NOTIFICATION_SETTINGS', {
    extra: {
      'android.provider.extra.APP_PACKAGE': PACOTE,
      'android.provider.extra.CHANNEL_ID': CANAL_LEMBRETES,
    },
  });

/** "Alarmes e lembretes": lets reminders ring at the exact minute (Android 12+) */
export const abrirAjustesAlarmesExatos = () =>
  Number(Platform.Version) >= 31
    ? abrir('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', { data: `package:${PACOTE}` })
    : abrir('android.settings.APPLICATION_DETAILS_SETTINGS', { data: `package:${PACOTE}` });

/** App info page, where Samsung shows "Bateria" → "Sem restrições" */
export const abrirAjustesBateria = () =>
  abrir('android.settings.APPLICATION_DETAILS_SETTINGS', { data: `package:${PACOTE}` });
