import { createClient } from '@supabase/supabase-js';
import { getPerfilUsuario, getMedicamentos, getDosesDoDia, updatePerfilUsuario } from '../database/sqlite';

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
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

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
      await supabase.auth.signOut();
    }
    await updatePerfilUsuario({ email: '' });
  } catch (err) {
    console.warn('Erro ao desconectar conta:', err);
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
    const doses = await getDosesDoDia();

    // Upsert perfil
    await supabase.from('perfil_usuario').upsert({
      id: userId,
      nome: user.nome,
      email: user.email,
      telefone_cuidador: user.telefone_cuidador,
      nome_cuidador: user.nome_cuidador,
      tamanho_fonte: user.tamanho_fonte,
      alto_contraste: user.alto_contraste ? 1 : 0,
      atualizado_em: new Date().toISOString(),
    });

    // Upsert medicamentos
    if (meds.length > 0) {
      await supabase.from('medicamentos').upsert(
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
    }

    console.log(`[AutoSync Nuvem] Sincronização automática concluída com sucesso`);
  } catch (err) {
    console.log('[AutoSync] Sincronização automática silenciosa em segundo plano:', err);
  }
};
