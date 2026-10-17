import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import {
  getPerfilUsuario,
  getMedicamentos,
  updatePerfilUsuario,
  getAgendaLembretes,
  aoAlterarDoses,
} from '../database/sqlite';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const isConfigured = Boolean(
  SUPABASE_URL && 
  SUPABASE_ANON_KEY && 
  !SUPABASE_URL.includes('xyzcompany')
);

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

    if (supabase) {
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

      const userId = data.user?.id || `usr-${Date.now()}`;
      await updatePerfilUsuario({ email, nome: nome || undefined });
      await triggerAutoSync();

      return {
        success: true,
        message: 'Conta criada com sucesso! Seus dados foram salvos na nuvem.',
        user: data.user,
      };
    } else {
      // Modo local com conta vinculada (quando Supabase URL não foi definida no .env)
      const userId = `usr-${Date.now()}`;
      await updatePerfilUsuario({ email, nome: nome || undefined });

      return {
        success: true,
        message: 'Conta registrada localmente! Seus dados estão salvos e vinculados a este email.',
        user: { id: userId, email },
      };
    }
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

    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
      });

      if (error) {
        return { success: false, message: error.message };
      }

      await updatePerfilUsuario({ email });
      await triggerAutoSync();

      return {
        success: true,
        message: 'Login realizado com sucesso! Seus dados foram sincronizados.',
        user: data.user,
      };
    } else {
      await updatePerfilUsuario({ email });
      return {
        success: true,
        message: 'Login realizado com sucesso!',
        user: { email },
      };
    }
  } catch (err: any) {
    console.warn('Erro no login:', err);
    return { success: false, message: err?.message || 'Erro inesperado ao realizar login.' };
  }
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

    // Upsert medicamentos
    if (meds.length > 0) {
      const { error: erroMeds } = await supabase.from('medicamentos').upsert(
        meds.map(m => ({
          id: m.id,
          usuario_id: userId,
          nome: m.nome,
          forma_farmaceutica: m.forma_farmaceutica,
          cor: m.cor,
          foto_url: m.foto_url,
          orientacoes_extras: m.orientacoes_extras,
        }))
      );
      if (erroMeds) console.log('[AutoSync] Supabase recusou os medicamentos:', erroMeds.message);
    }

    await sincronizarDosesNuvem();
  } catch (err) {
    console.log('[AutoSync] Sincronização automática silenciosa em segundo plano:', err);
  }
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
  }, 1000);
});
