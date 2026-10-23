import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import { CANAL_LEMBRETES, CANAIS_ANTIGOS } from './ajustesAndroid';
import { getAgendaLembretes, aoAlterarDoses, ItemAgendaLembrete } from '../database/sqlite';

type NotificationsType = typeof import('expo-notifications');
let NotificationsModule: NotificationsType | null = null;

/**
 * Retorna o módulo de notificações de forma segura.
 * No Expo Go (a partir do SDK 53) ou na Web, expo-notifications não tem suporte nativo
 * e dispararia uma exceção fatal caso fosse importado estaticamente no Android.
 */
const getNotificationsModule = (): NotificationsType | null => {
  if (Platform.OS === 'web' || isRunningInExpoGo()) {
    return null;
  }

  if (!NotificationsModule) {
    try {
      NotificationsModule = require('expo-notifications');
    } catch (e) {
      console.warn('[DoseCerta] Não foi possível carregar expo-notifications:', e);
      return null;
    }
  }

  return NotificationsModule;
};

// ---------------------------------------------------------------------------
// Insistent reminders
//
// Each dose rings like an alarm: a 90 s alarm sound on Android's ALARM audio stream (loud,
// plays even on vibrate, unlike chat notifications). Answering stops it immediately, because
// the reminder is dismissed. While unanswered it rings again every INTERVALO_REPETICAO_MIN
// minutes up to REPETICOES times, so it is almost continuous (90 s ringing, 30 s pause).
// "Tomei" / "Adiar" buttons; can't be swiped away by accident.
//
// Reminders are one-shot notifications for the next few days (rebuilt by
// sincronizarLembretes) instead of repeating daily triggers. That way a dose already
// marked as taken never rings, and answering one dose cancels only that day's repeats.
// ---------------------------------------------------------------------------

export const INTERVALO_REPETICAO_MIN = 2;
export const REPETICOES = 6; // rings for ~14 min if never answered
// Sounds registered in app.json (expo-notifications "sounds"). iOS ignores custom sounds
// longer than 30 s, so Android (channel) gets a longer version of the same alarm.
const SOM_ALARME = 'alarme_remedio.wav'; // 30 s
const SOM_ALARME_ANDROID = 'alarme_remedio_longo.wav'; // 90 s
export const MINUTOS_ADIAR = 15;

const CATEGORIA_DOSE = 'lembrete-dose';
export const ACAO_TOMEI = 'TOMEI';
export const ACAO_ADIAR = 'ADIAR';

// iOS keeps at most 64 pending notifications; Android has no such small limit
const DIAS_AGENDADOS = Platform.OS === 'ios' ? 2 : 7;

export interface DadosLembreteDose {
  tipo: 'dose';
  doseId: string;
  medicamentoNome: string;
  repeticao: number; // 0 = first ring
}

const idLembrete = (doseId: string, repeticao: number) => `${doseId}|${repeticao}`;

// Show reminders even when the app is open
const initialNotif = getNotificationsModule();
if (initialNotif) {
  try {
    initialNotif.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (e) {
    console.log('[DoseCerta] Configuração do handler de notificação:', e);
  }
}

export const requestNotificationPermissions = async (): Promise<boolean> => {
  const notif = getNotificationsModule();
  if (!notif) {
    if (isRunningInExpoGo()) {
      console.log('ℹ️ [Expo Go] expo-notifications foi descontinuado no Expo Go no SDK 53+. Modo simulado ativo com sucesso.');
    }
    return true;
  }

  try {
    // Android 13+: the permission prompt only appears after a channel exists, so create it first
    if (Platform.OS === 'android') {
      await notif.setNotificationChannelAsync(CANAL_LEMBRETES, {
        name: 'Alarme dos remédios',
        description: 'Toca um alarme na hora de tomar cada remédio, até você responder',
        importance: notif.AndroidImportance.MAX,
        sound: SOM_ALARME_ANDROID,
        // Alarm stream: loud and distinct from chat apps, and plays even with the phone on vibrate
        audioAttributes: {
          usage: notif.AndroidAudioUsage.ALARM,
          contentType: notif.AndroidAudioContentType.SONIFICATION,
        },
        // Only honored if the user allows it ("Ignorar Não perturbe" shortcut in the Profile)
        bypassDnd: true,
        // Long, strong vibration: easier to notice for older users
        vibrationPattern: [0, 800, 400, 800, 400, 800],
        enableVibrate: true,
        lightColor: '#0D6B58',
        lockscreenVisibility: notif.AndroidNotificationVisibility.PUBLIC,
      }).catch(() => null);
      for (const antigo of CANAIS_ANTIGOS) {
        await notif.deleteNotificationChannelAsync(antigo).catch(() => null);
      }
    }

    // Buttons shown on every dose reminder. They open the app so the answer is always
    // recorded (and the user sees the confirmation).
    await notif
      .setNotificationCategoryAsync(CATEGORIA_DOSE, [
        { identifier: ACAO_TOMEI, buttonTitle: '✅ Tomei', options: { opensAppToForeground: true } },
        { identifier: ACAO_ADIAR, buttonTitle: `⏰ Adiar ${MINUTOS_ADIAR} min`, options: { opensAppToForeground: true } },
      ])
      .catch(() => null);

    const { status: existingStatus } = await notif.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await notif.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (error) {
    console.log('Verificação de permissão de notificação:', error);
    return false;
  }
};

const conteudoLembrete = (notif: NotificationsType, item: ItemAgendaLembrete, repeticao: number) => {
  const ultima = repeticao === REPETICOES;
  const corpoBase = repeticao === 0 ? `Hora de tomar ${item.dosagem}.` : `Tome ${item.dosagem} e toque em "Tomei".`;
  const dica = repeticao === 0 && item.orientacoes ? ` Dica: ${item.orientacoes}` : '';
  const data: DadosLembreteDose = {
    tipo: 'dose',
    doseId: item.doseId,
    medicamentoNome: item.nome,
    repeticao,
  };
  return {
    title: ultima
      ? `❗ Você ainda não confirmou: ${item.nome}`
      : repeticao === 0
        ? `⏰ Hora do remédio: ${item.nome}`
        : `⏰ Lembrete: ${item.nome}`,
    body: corpoBase + dica,
    sound: SOM_ALARME,
    priority: notif.AndroidNotificationPriority.MAX,
    categoryIdentifier: CATEGORIA_DOSE,
    sticky: true, // can't be swiped away by accident; leaves when answered
    autoDismiss: false,
    data: data as unknown as Record<string, unknown>,
  };
};

let sincronizando: Promise<void> | null = null;
let sincronizarDeNovo = false;

/**
 * Rebuilds every dose reminder for the next days from the database. Safe to call often:
 * concurrent calls are coalesced.
 */
export const sincronizarLembretes = async (): Promise<void> => {
  const notif = getNotificationsModule();
  if (!notif) return;

  if (sincronizando) {
    sincronizarDeNovo = true;
    return sincronizando;
  }

  sincronizando = (async () => {
    try {
      const { status } = await notif.getPermissionsAsync();
      if (status !== 'granted') return;

      // Cancel previous dose reminders (and old-style daily ones without "tipo"); keep tests
      const agendadas = await notif.getAllScheduledNotificationsAsync();
      for (const n of agendadas) {
        const tipo = (n.content.data as { tipo?: string } | null)?.tipo;
        if (tipo !== 'teste') await notif.cancelScheduledNotificationAsync(n.identifier);
      }

      const agora = Date.now();
      const agenda = await getAgendaLembretes(DIAS_AGENDADOS);
      for (const item of agenda) {
        for (let r = 0; r <= REPETICOES; r++) {
          const quando = item.instante.getTime() + r * INTERVALO_REPETICAO_MIN * 60_000;
          if (quando <= agora + 5_000) continue;
          await notif.scheduleNotificationAsync({
            identifier: idLembrete(item.doseId, r),
            content: conteudoLembrete(notif, item, r),
            trigger: { type: notif.SchedulableTriggerInputTypes.DATE, date: quando, channelId: CANAL_LEMBRETES },
          });
        }
      }

      // Reminders can't be swiped away, so close the ones that no longer need an answer:
      // dose marked in the app, snoozed to later, from another day or of a removed medication
      const aindaDevidas = new Set(agenda.filter((i) => i.instante.getTime() <= agora).map((i) => i.doseId));
      const exibidas = await notif.getPresentedNotificationsAsync();
      for (const n of exibidas) {
        const data = n.request.content.data as Partial<DadosLembreteDose> | null;
        if (data?.tipo === 'dose' && data.doseId && !aindaDevidas.has(data.doseId)) {
          await notif.dismissNotificationAsync(n.request.identifier);
        }
      }
    } catch (error) {
      console.log('Sincronização de lembretes:', error);
    }
  })();

  await sincronizando;
  sincronizando = null;
  if (sincronizarDeNovo) {
    sincronizarDeNovo = false;
    await sincronizarLembretes();
  }
};

// Any change to doses/schedules (taken, skipped, snoozed, new or removed medication)
// rebuilds the reminders shortly after
let timerSincronizacao: ReturnType<typeof setTimeout> | null = null;
aoAlterarDoses(() => {
  if (timerSincronizacao) clearTimeout(timerSincronizacao);
  timerSincronizacao = setTimeout(() => {
    sincronizarLembretes();
  }, 600);
});

/** Removes this dose's reminders that are already showing on the phone */
export const fecharAvisosDaDose = async (doseId: string): Promise<void> => {
  const notif = getNotificationsModule();
  if (!notif) return;
  try {
    const exibidas = await notif.getPresentedNotificationsAsync();
    for (const n of exibidas) {
      const data = n.request.content.data as Partial<DadosLembreteDose> | null;
      if (data?.doseId === doseId) await notif.dismissNotificationAsync(n.request.identifier);
    }
  } catch (error) {
    console.log('Fechar avisos da dose:', error);
  }
};

export interface RespostaLembrete {
  acao: 'tomei' | 'adiar' | 'abrir';
  doseId: string;
  medicamentoNome: string;
}

/**
 * Listens for answers to dose reminders (button taps or tapping the reminder itself),
 * including the one that launched the app.
 */
export const ouvirRespostasLembretes = (aoResponder: (r: RespostaLembrete) => void): (() => void) => {
  const notif = getNotificationsModule();
  if (!notif) return () => {};

  const tratadas = new Set<string>();
  const tratar = (resposta: import('expo-notifications').NotificationResponse | null) => {
    if (!resposta) return;
    const chave = `${resposta.notification.request.identifier}|${resposta.actionIdentifier}|${resposta.notification.date}`;
    if (tratadas.has(chave)) return;
    tratadas.add(chave);

    const data = resposta.notification.request.content.data as Partial<DadosLembreteDose> | null;
    if (data?.tipo !== 'dose' || !data.doseId) return;
    const acao =
      resposta.actionIdentifier === ACAO_TOMEI ? 'tomei' : resposta.actionIdentifier === ACAO_ADIAR ? 'adiar' : 'abrir';
    aoResponder({ acao, doseId: data.doseId, medicamentoNome: data.medicamentoNome || 'Remédio' });
    notif.clearLastNotificationResponseAsync?.().catch(() => null);
  };

  notif.getLastNotificationResponseAsync().then(tratar).catch(() => null);
  const sub = notif.addNotificationResponseReceivedListener(tratar);
  return () => sub.remove();
};

/** Called when a dose reminder arrives while the app is open */
export const ouvirLembretesComAppAberto = (aoChegar: (doseId: string) => void): (() => void) => {
  const notif = getNotificationsModule();
  if (!notif) return () => {};
  const sub = notif.addNotificationReceivedListener((n) => {
    const data = n.request.content.data as Partial<DadosLembreteDose> | null;
    if (data?.tipo === 'dose' && data.doseId) aoChegar(data.doseId);
  });
  return () => sub.remove();
};

export interface DiagnosticoLembretes {
  suportado: boolean; // false on web / Expo Go
  permitido: boolean;
  agendados: number; // dose reminders (first ring only), not counting repeats
}

/** Current state of reminders, so the user (and we) can see why one did not arrive */
export const diagnosticarLembretes = async (): Promise<DiagnosticoLembretes> => {
  const notif = getNotificationsModule();
  if (!notif) return { suportado: false, permitido: false, agendados: 0 };
  try {
    const { status } = await notif.getPermissionsAsync();
    const agendadas = await notif.getAllScheduledNotificationsAsync();
    const agendados = agendadas.filter((n) => {
      const data = n.content.data as Partial<DadosLembreteDose> | null;
      return data?.tipo === 'dose' && data.repeticao === 0;
    }).length;
    return { suportado: true, permitido: status === 'granted', agendados };
  } catch (error) {
    console.log('Diagnóstico de lembretes:', error);
    return { suportado: true, permitido: false, agendados: 0 };
  }
};

/** Sends a sample reminder in a few seconds through the same channel as real ones */
export const enviarLembreteTeste = async (segundos: number = 10): Promise<boolean> => {
  const notif = getNotificationsModule();
  if (!notif) return false;
  try {
    await notif.scheduleNotificationAsync({
      content: {
        title: '⏰ Teste do DoseCerta',
        body: 'Este é o alarme do remédio. Ele para quando você toca no aviso.',
        sound: SOM_ALARME,
        priority: notif.AndroidNotificationPriority.MAX,
        data: { tipo: 'teste' },
      },
      trigger: {
        type: notif.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: segundos,
        channelId: CANAL_LEMBRETES,
      },
    });
    return true;
  } catch (error) {
    console.log('Lembrete de teste:', error);
    return false;
  }
};
