import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, User } from '@supabase/supabase-js';
import { HistoricoDose, HorarioMedicamento, Medicamento, PerfilUsuario } from '../types';
import {
  getPerfilUsuario,
  getMedicamentos,
  updatePerfilUsuario,
  getAgendaLembretes,
  aoAlterarDoses,
  getHorariosParaNuvem,
  getDosesParaNuvem,
  marcarDosesSincronizadas,
  getFotosParaNuvem,
  marcarFotoSincronizada,
  definirFotoRestaurada,
  restaurarDadosDaNuvem,
  lerCarimbo,
} from '../database/sqlite';
import { baixarFoto, lerFoto } from './fotos';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const isConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes('xyzcompany')
);

// Required config: stop right away in development so a missing .env is never mistaken for a
// bug. A release build must not crash over it (reminders work offline), so only the account
// stays unavailable there.
if (!isConfigured) {
  const aviso =
    'Supabase não configurado: crie o arquivo .env a partir do .env.example ' +
    '(EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY) e reinicie com "npx expo start -c".';
  if (__DEV__) throw new Error(aviso);
  console.error(aviso);
}

const CONTA_INDISPONIVEL = {
  success: false,
  message: 'Não foi possível acessar sua conta agora. Tente novamente mais tarde.',
};

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // React Native has no localStorage: without this the login is lost when the app closes
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Only refresh the session token while the app is in the foreground (Supabase's RN recommendation)
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (estado) => {
    if (estado === 'active') {
      supabase.auth.startAutoRefresh();
      sincronizarDosesNuvem();
      // Changes saved while offline go up now
      enviarRotinaNuvem();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

export interface AuthUserState {
  email: string | null;
  id: string | null;
  isLoggedIn: boolean;
}

/**
 * Criação de conta do usuário
 */
export const registerUserAccount = async (
  email: string,
  pass: string,
  nome?: string
): Promise<{ success: boolean; message: string; user?: any }> => {
  try {
    if (!email || !pass) {
      return { success: false, message: 'Por favor, preencha email e senha.' };
    }
    if (pass.length < 6) {
      return { success: false, message: 'A senha deve conter pelo menos 6 caracteres.' };
    }

    if (!supabase) return CONTA_INDISPONIVEL;

    const { data, error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: {
        data: { nome: nome || '' },
      },
    });

    if (error) {
      return { success: false, message: error.message };
    }

    await updatePerfilUsuario({ email, nome: nome || undefined });
    await triggerAutoSync();

    return {
      success: true,
      message: 'Conta criada com sucesso! Seus dados foram salvos na nuvem.',
      user: data.user,
    };
  } catch (err: any) {
    console.warn('Erro ao registrar conta:', err);
    return { success: false, message: err?.message || 'Erro inesperado ao criar conta.' };
  }
};

/**
 * Login de usuário já cadastrado
 */
export const loginUserAccount = async (
  email: string,
  pass: string
): Promise<{ success: boolean; message: string; user?: any }> => {
  try {
    if (!email || !pass) {
      return { success: false, message: 'Por favor, informe email e senha.' };
    }

    if (!supabase) return CONTA_INDISPONIVEL;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });

    if (error) {
      return { success: false, message: error.message };
    }

    // Bring the saved profile first: the sync below uploads the local one and would
    // otherwise erase the name and caregiver data saved from another device
    await updatePerfilUsuario({ email, ...(await buscarPerfilNuvem(data.user)) });
    // Same for the medications, schedules and history (e.g. logging in on a new phone)
    let recuperados = 0;
    try {
      recuperados = await restaurarRotinaNuvem(data.user.id);
    } catch (err) {
      console.log('[Conta] Não foi possível recuperar a cópia de segurança:', err);
    }
    await triggerAutoSync();

    return {
      success: true,
      message:
        recuperados > 0
          ? `Login realizado! ${recuperados} ${recuperados === 1 ? 'remédio foi recuperado' : 'remédios foram recuperados'} com o histórico.`
          : 'Login realizado com sucesso! Seus dados foram sincronizados.',
      user: data.user,
    };
  } catch (err: any) {
    console.warn('Erro no login:', err);
    return { success: false, message: err?.message || 'Erro inesperado ao realizar login.' };
  }
};

/**
 * Profile fields saved in the cloud that are still empty on this device. What the user
 * already filled in here wins. The name falls back to the one given when creating the account.
 */
const buscarPerfilNuvem = async (user: User): Promise<Partial<PerfilUsuario>> => {
  if (!supabase) return {};
  const local = await getPerfilUsuario();
  const { data: nuvem, error } = await supabase
    .from('perfil_usuario')
    .select('nome, telefone_cuidador, nome_cuidador, email_cuidador, avisar_cuidador')
    .eq('id', user.id)
    .maybeSingle();
  if (error) console.log('[Conta] Não foi possível buscar o perfil salvo:', error.message);

  const campos: Partial<PerfilUsuario> = {};
  const nome = nuvem?.nome || user.user_metadata?.nome;
  if (!local?.nome?.trim() && nome) campos.nome = nome;
  if (nuvem) {
    if (!local?.telefone_cuidador && nuvem.telefone_cuidador) campos.telefone_cuidador = nuvem.telefone_cuidador;
    if (!local?.nome_cuidador && nuvem.nome_cuidador) campos.nome_cuidador = nuvem.nome_cuidador;
    if (!local?.email_cuidador && nuvem.email_cuidador) {
      campos.email_cuidador = nuvem.email_cuidador;
      campos.avisar_cuidador = nuvem.avisar_cuidador ?? true;
    }
  }
  return campos;
};

/**
 * Desconectar conta do usuário
 */
export const logoutUserAccount = async (): Promise<void> => {
  try {
    if (supabase) {
      // Without the account the caregiver would get alerts for doses this phone can no longer confirm
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await supabase.from('doses_pendentes').delete().eq('usuario_id', data.session.user.id);
      }
      await supabase.auth.signOut();
    }
    await updatePerfilUsuario({ email: '' });
  } catch (err) {
    console.warn('Erro ao desconectar conta:', err);
  }
};

/**
 * The app treats "email saved in the local profile" as logged in. If the Supabase session is
 * gone (e.g. logged in before sessions were persisted), clear it so the app stops showing a
 * connected account that syncs nothing. Network errors keep the account (could be offline).
 */
export const verificarSessaoConta = async (): Promise<void> => {
  if (!supabase) return;
  try {
    const perfil = await getPerfilUsuario();
    if (!perfil?.email) return;
    const { data, error } = await supabase.auth.getSession();
    if (!error && !data.session) {
      await updatePerfilUsuario({ email: '' });
    }
  } catch (err) {
    console.log('[Conta] Não foi possível verificar a sessão:', err);
  }
};

/**
 * Sincronização automática em segundo plano (chamada silenciosa)
 */
export const triggerAutoSync = async (): Promise<void> => {
  try {
    const user = await getPerfilUsuario();
    if (!user || !user.email) {
      // Usuário sem conta: dados continuam 100% seguros no SQLite local
      return;
    }

    if (!supabase) {
      console.log(`[AutoSync Local] Dados salvos com segurança no SQLite`);
      return;
    }

    const session = await supabase.auth.getSession();
    if (!session.data.session) {
      return;
    }

    const userId = session.data.session.user.id;
    const meds = await getMedicamentos();

    // Upsert perfil
    const { error: erroPerfil } = await supabase.from('perfil_usuario').upsert({
      id: userId,
      nome: user.nome,
      email: user.email,
      telefone_cuidador: user.telefone_cuidador,
      nome_cuidador: user.nome_cuidador,
      email_cuidador: user.email_cuidador,
      avisar_cuidador: user.avisar_cuidador ?? true,
      tamanho_fonte: user.tamanho_fonte,
      alto_contraste: user.alto_contraste ? 1 : 0,
      atualizado_em: new Date().toISOString(),
    });
    if (erroPerfil) console.log('[AutoSync] Supabase recusou o perfil:', erroPerfil.message);

    // Upsert medicamentos. foto_caminho is only sent with a photo: a photo still being
    // downloaded on a new phone must not erase the one in the backup.
    const linhaMed = (m: Medicamento) => ({
      id: m.id,
      usuario_id: userId,
      nome: m.nome,
      forma_farmaceutica: m.forma_farmaceutica,
      cor: m.cor,
      foto_url: m.foto_url,
      orientacoes_extras: m.orientacoes_extras,
      criado_em: lerCarimbo(m.criado_em)?.toISOString() ?? null,
    });
    const comFoto = meds.filter(m => m.foto_url).map(m => ({ ...linhaMed(m), foto_caminho: caminhoFoto(userId, m.id) }));
    const semFoto = meds.filter(m => !m.foto_url).map(linhaMed);
    for (const lote of [comFoto, semFoto]) {
      if (lote.length === 0) continue;
      const { error: erroMeds } = await supabase.from('medicamentos').upsert(lote);
      if (erroMeds) console.log('[AutoSync] Supabase recusou os medicamentos:', erroMeds.message);
    }

    await enviarRotinaNuvem();
    await sincronizarDosesNuvem();
  } catch (err) {
    console.log('[AutoSync] Sincronização automática silenciosa em segundo plano:', err);
  }
};

// ---------------------------------------------------------------------------
// Backup of the routine: schedules, dose history and photos
//
// Sent whenever something changes, so logging in on another phone brings everything back
// (restaurarRotinaNuvem). Photos go to the private Storage bucket, one folder per user.
// ---------------------------------------------------------------------------

const BUCKET_FOTOS = 'fotos-medicamentos';
const caminhoFoto = (userId: string, medicamentoId: string) => `${userId}/${medicamentoId}.jpg`;
const TAMANHO_LOTE = 100;

const emLotes = <T,>(itens: T[]) =>
  Array.from({ length: Math.ceil(itens.length / TAMANHO_LOTE) }, (_, i) =>
    itens.slice(i * TAMANHO_LOTE, (i + 1) * TAMANHO_LOTE)
  );

let enviandoRotina: Promise<void> | null = null;
let enviarRotinaDeNovo = false;

export const enviarRotinaNuvem = async (): Promise<void> => {
  if (!supabase) return;

  if (enviandoRotina) {
    enviarRotinaDeNovo = true;
    return enviandoRotina;
  }

  enviandoRotina = (async () => {
    try {
      const perfil = await getPerfilUsuario();
      if (!perfil?.email) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const userId = data.session.user.id;

      if (Platform.OS !== 'web') {
        for (const foto of await getFotosParaNuvem()) {
          try {
            const { error } = await supabase.storage
              .from(BUCKET_FOTOS)
              .upload(caminhoFoto(userId, foto.id), await lerFoto(foto.foto_url), { contentType: 'image/jpeg', upsert: true });
            if (error) throw error;
            await marcarFotoSincronizada(foto.id, foto.foto_url);
          } catch (err) {
            console.log('[Cópia de segurança] Não foi possível enviar uma foto:', err);
          }
        }
      }

      const horarios = await getHorariosParaNuvem();
      for (const lote of emLotes(horarios)) {
        const { error } = await supabase.from('horarios_medicamento').upsert(
          lote.map((h) => ({
            usuario_id: userId,
            id: h.id,
            medicamento_id: h.medicamento_id,
            dosagem: h.dosagem,
            hora_programada: h.hora_programada,
            dias_da_semana: h.dias_da_semana || 'TODOS',
            ativo: h.ativo,
            criado_em: lerCarimbo(h.criado_em)?.toISOString() ?? null,
          }))
        );
        if (error) throw error;
      }

      const doses = await getDosesParaNuvem();
      const registradas = doses.filter((d) => d.status !== 'PENDENTE');
      const pendentes = doses.filter((d) => d.status === 'PENDENTE');
      for (const lote of emLotes(registradas)) {
        const { error } = await supabase.from('historico_doses').upsert(
          lote.map((d) => ({
            usuario_id: userId,
            id: d.id,
            medicamento_id: d.medicamento_id,
            horario_id: d.horario_id ?? null,
            data_hora_prevista: d.data_hora_prevista,
            data_hora_realizada: d.data_hora_realizada ?? null,
            status: d.status,
            observacao: d.observacao ?? null,
            atualizado_em: lerCarimbo(d.atualizado_em)?.toISOString() ?? new Date().toISOString(),
          }))
        );
        if (error) throw error;
      }
      // Back to pending ("Desfazer"): the backup must not keep the old record
      for (const lote of emLotes(pendentes)) {
        const { error } = await supabase
          .from('historico_doses')
          .delete()
          .eq('usuario_id', userId)
          .in('id', lote.map((d) => d.id));
        if (error) throw error;
      }
      await marcarDosesSincronizadas(doses);
    } catch (err) {
      console.log('[Cópia de segurança] Não foi possível enviar a rotina:', err);
    }
  })();

  await enviandoRotina;
  enviandoRotina = null;
  if (enviarRotinaDeNovo) {
    enviarRotinaDeNovo = false;
    await enviarRotinaNuvem();
  }
};

/**
 * Downloads the backup of this account into the phone: medications, schedules, dose history
 * and photos. Returns how many medications were added here.
 */
const restaurarRotinaNuvem = async (userId: string): Promise<number> => {
  if (!supabase) return 0;
  const cliente = supabase;

  const buscarTudo = async <T,>(tabela: string): Promise<T[]> => {
    const PAGINA = 1000; // Supabase's limit per request
    const linhas: T[] = [];
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await cliente
        .from(tabela)
        .select('*')
        .eq('usuario_id', userId)
        .order('id')
        .range(de, de + PAGINA - 1);
      if (error) throw error;
      linhas.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGINA) return linhas;
    }
  };

  const [medicamentos, horarios, doses] = await Promise.all([
    buscarTudo<Medicamento & { foto_caminho?: string | null }>('medicamentos'),
    buscarTudo<HorarioMedicamento>('horarios_medicamento'),
    buscarTudo<HistoricoDose>('historico_doses'),
  ]);
  if (medicamentos.length === 0) return 0;

  const novos = await restaurarDadosDaNuvem({ medicamentos, horarios, doses });

  if (Platform.OS !== 'web') {
    for (const med of medicamentos) {
      if (!med.foto_caminho || !novos.includes(med.id)) continue;
      try {
        const { data, error } = await cliente.storage.from(BUCKET_FOTOS).createSignedUrl(med.foto_caminho, 600);
        if (error || !data) throw error;
        await definirFotoRestaurada(med.id, await baixarFoto(data.signedUrl, med.id));
      } catch (err) {
        console.log('[Cópia de segurança] Não foi possível baixar uma foto:', err);
      }
    }
  }
  return novos.length;
};

// ---------------------------------------------------------------------------
// Caregiver alert
//
// The email is sent by the server (Edge Function "avisar-cuidador"), because the app may be
// closed when a dose is missed. So the server needs to know which doses are still waiting:
// this keeps the "doses_pendentes" table equal to the reminder agenda of the next days.
// Taken, skipped or removed doses leave the agenda and are deleted there, so no alert is sent.
// Nothing is stored while the alert is off or there is no caregiver email.
// ---------------------------------------------------------------------------

// Same window as the reminders: the server keeps alerting even if the app isn't opened for days
const DIAS_DOSES_NUVEM = 7;

let sincronizandoDoses: Promise<void> | null = null;
let sincronizarDosesDeNovo = false;

export const sincronizarDosesNuvem = async (): Promise<void> => {
  if (!supabase) return;

  if (sincronizandoDoses) {
    sincronizarDosesDeNovo = true;
    return sincronizandoDoses;
  }

  sincronizandoDoses = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const userId = data.session.user.id;

      const perfil = await getPerfilUsuario();
      if (!perfil?.avisar_cuidador || !perfil.email_cuidador) {
        await supabase.from('doses_pendentes').delete().eq('usuario_id', userId);
        return;
      }

      const agenda = await getAgendaLembretes(DIAS_DOSES_NUVEM);
      // Every dose still in the agenda gets this stamp; rows left with an older one are stale
      const carimbo = new Date().toISOString();
      if (agenda.length > 0) {
        // aviso_enviado_em is left out, so an alert already sent is not repeated
        const { error } = await supabase.from('doses_pendentes').upsert(
          agenda.map((item) => ({
            usuario_id: userId,
            dose_id: item.doseId,
            medicamento_nome: item.nome,
            dosagem: item.dosagem,
            previsto_para: item.instante.toISOString(),
            atualizado_em: carimbo,
          }))
        );
        if (error) throw error;
      }

      // Doses from today on that left the agenda were taken, skipped or removed
      const inicioDeHoje = new Date();
      inicioDeHoje.setHours(0, 0, 0, 0);
      const { error } = await supabase
        .from('doses_pendentes')
        .delete()
        .eq('usuario_id', userId)
        .gte('previsto_para', inicioDeHoje.toISOString())
        .lt('atualizado_em', carimbo);
      if (error) throw error;
    } catch (err) {
      console.log('[Aviso ao cuidador] Não foi possível sincronizar as doses:', err);
    }
  })();

  await sincronizandoDoses;
  sincronizandoDoses = null;
  if (sincronizarDosesDeNovo) {
    sincronizarDosesDeNovo = false;
    await sincronizarDosesNuvem();
  }
};

// Taken, snoozed, new or removed medication: update the server shortly after
let timerDosesNuvem: ReturnType<typeof setTimeout> | null = null;
aoAlterarDoses(() => {
  if (timerDosesNuvem) clearTimeout(timerDosesNuvem);
  timerDosesNuvem = setTimeout(() => {
    sincronizarDosesNuvem();
    enviarRotinaNuvem();
  }, 1000);
});
