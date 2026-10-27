import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import {
  PerfilUsuario,
  Medicamento,
  HorarioMedicamento,
  HistoricoDose,
  DoseCompleta,
  StatusDose,
} from '../types';

let dbInstance: SQLite.SQLiteDatabase | null = null;

// Dates are stored as LOCAL "YYYY-MM-DD[THH:mm:ss]". Never use toISOString() for this:
// it is UTC, so in Brazil after 21h "today" would already be tomorrow.
const pad2 = (n: number) => String(n).padStart(2, '0');
export const dataLocal = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// Day codes stored in horarios_medicamento.dias_da_semana ("TODOS" or e.g. "SEG,QUA,SEX")
export const CODIGOS_DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'] as const;

/** Whether a schedule with `dias` applies on the local date "YYYY-MM-DD" */
export const horarioValeNoDia = (dias: string | null | undefined, data: string) => {
  if (!dias || dias === 'TODOS') return true;
  const [ano, mes, dia] = data.split('-').map(Number);
  const codigo = CODIGOS_DIAS[new Date(ano, mes - 1, dia).getDay()];
  return dias.split(',').includes(codigo);
};

// Listeners notified whenever doses or schedules change (used to keep reminders in sync)
const ouvintesAlteracao = new Set<() => void>();
export const aoAlterarDoses = (cb: () => void) => {
  ouvintesAlteracao.add(cb);
  return () => {
    ouvintesAlteracao.delete(cb);
  };
};
const notificarAlteracao = () => ouvintesAlteracao.forEach((cb) => cb());

const dataHoraLocal = (d: Date = new Date()) =>
  `${dataLocal(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

/** Local "YYYY-MM-DD[THH:mm]" → Date in the phone's timezone */
const paraDate = (local: string) => {
  const [dia, hora = '00:00'] = local.split('T');
  const [a, m, d] = dia.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  return new Date(a, m - 1, d, hh, mm);
};

/** Timestamps come as ISO (app/Supabase) or "YYYY-MM-DD HH:MM:SS" in UTC (SQLite CURRENT_TIMESTAMP) */
export const lerCarimbo = (valor: string | null | undefined): Date | null => {
  if (!valor) return null;
  const d = new Date(valor.includes('T') ? valor : `${valor.replace(' ', 'T')}Z`);
  return isNaN(d.getTime()) ? null : d;
};

// Taken more than this after the scheduled time counts as "taken late" (same window as the caregiver alert)
export const MINUTOS_TOLERANCIA_ATRASO = 30;
// "Tomei" more than this after the scheduled time is a correction of the record, not the moment it was taken
const HORAS_CORRECAO_SEM_HORARIO = 12;
// A dose still unconfirmed when its day is over (and at least this long after its time) counts as skipped
const HORAS_ANTES_DE_PULAR = 2;
// How far back the doses of days the app wasn't opened are filled in
const DIAS_MAX_PREENCHIMENTO = 90;
// A new schedule only gets today's dose if it isn't more than this in the past
const MINUTOS_ANTES_DO_CADASTRO = 60;

/** Date of a dose: taken from its id, because a snooze can move the time past midnight */
const dataDaDose = (dose: { id: string; data_hora_prevista: string }) =>
  /^dose-(\d{4}-\d{2}-\d{2})-/.exec(dose.id)?.[1] ?? dose.data_hora_prevista.substring(0, 10);

/** Whether a schedule created at `criacao` should have the dose of `prevista` */
const doseDepoisDoCadastro = (prevista: string, criacao: Date | null) =>
  !criacao || paraDate(prevista).getTime() >= criacao.getTime() - MINUTOS_ANTES_DO_CADASTRO * 60_000;

// Fallback store for web (no native SQLite). Persisted to the browser's localStorage so
// data survives reloads, keeping the "works without an account" promise on every platform.
const memoryStore = {
  perfil: null as PerfilUsuario | null,
  medicamentos: [] as Medicamento[],
  horarios: [] as HorarioMedicamento[],
  historico: [] as HistoricoDose[],
  ajustes: {} as Record<string, string>,
  onboardingCompleted: false,
};

const WEB_STORAGE_KEY = 'dosecerta:data';

const getWebStorage = (): Storage | null => {
  try {
    return typeof globalThis !== 'undefined' && (globalThis as any).localStorage
      ? (globalThis as any).localStorage
      : null;
  } catch {
    return null;
  }
};

const loadMemoryStore = () => {
  const storage = getWebStorage();
  if (!storage) return;
  try {
    const raw = storage.getItem(WEB_STORAGE_KEY);
    if (raw) Object.assign(memoryStore, JSON.parse(raw));
  } catch (e) {
    console.warn('Não foi possível ler os dados salvos no navegador:', e);
  }
};

const persistMemoryStore = () => {
  const storage = getWebStorage();
  if (!storage) return;
  try {
    storage.setItem(WEB_STORAGE_KEY, JSON.stringify(memoryStore));
  } catch (e) {
    console.warn('Não foi possível salvar os dados no navegador:', e);
  }
};

let dbOpenPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;

const openDatabase = async (): Promise<SQLite.SQLiteDatabase | null> => {
  try {
    dbInstance = await SQLite.openDatabaseAsync('dosecerta.db');
    return dbInstance;
  } catch (e) {
    console.warn('Could not open SQLite DB, falling back to memory/async adapter:', e);
    dbInstance = null;
    return null;
  } finally {
    dbOpenPromise = null;
  }
};

export const getDatabase = async () => {
  if (Platform.OS === 'web') {
    return null;
  }

  if (dbInstance) {
    // The native handle can be released (e.g. after a reload / Fast Refresh) while the
    // JS reference survives; any query on it fails with "NativeDatabase.prepareAsync has
    // been rejected". Validate it and reopen when stale.
    try {
      await dbInstance.getFirstAsync('SELECT 1');
      return dbInstance;
    } catch (e) {
      console.warn('SQLite connection is stale, reopening:', e);
      dbInstance = null;
    }
  }

  // Share a single in-flight open between concurrent callers so we never create
  // (and later lose) duplicate connections to the same file.
  if (!dbOpenPromise) {
    dbOpenPromise = openDatabase();
  }
  return dbOpenPromise;
};

export const initDatabase = async (): Promise<void> => {
  const db = await getDatabase();

  if (db) {
    // Create tables matching schema
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS perfil_usuario (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT,
        telefone_cuidador TEXT,
        nome_cuidador TEXT,
        tamanho_fonte TEXT DEFAULT 'padrao',
        alto_contraste INTEGER DEFAULT 0,
        is_synced INTEGER DEFAULT 0,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS medicamentos (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        nome TEXT NOT NULL,
        forma_farmaceutica TEXT,
        cor TEXT,
        foto_url TEXT,
        orientacoes_extras TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES perfil_usuario(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS horarios_medicamento (
        id TEXT PRIMARY KEY,
        medicamento_id TEXT NOT NULL,
        dosagem TEXT NOT NULL,
        hora_programada TEXT NOT NULL,
        dias_da_semana TEXT DEFAULT 'TODOS',
        ativo INTEGER DEFAULT 1,
        FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS historico_doses (
        id TEXT PRIMARY KEY,
        medicamento_id TEXT NOT NULL,
        horario_id TEXT,
        data_hora_prevista TEXT NOT NULL,
        data_hora_realizada TEXT,
        status TEXT NOT NULL CHECK (status IN ('PENDENTE', 'TOMADO', 'ATRASADO', 'PULADO')),
        observacao TEXT,
        atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id) ON DELETE CASCADE,
        FOREIGN KEY (horario_id) REFERENCES horarios_medicamento(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );
    `);

    // Columns added after the first release: CREATE TABLE IF NOT EXISTS doesn't touch existing installs
    const colunasPerfil = await db.getAllAsync<{ name: string }>('PRAGMA table_info(perfil_usuario)');
    const temColuna = (nome: string) => colunasPerfil.some((c) => c.name === nome);
    if (!temColuna('email_cuidador')) {
      await db.execAsync('ALTER TABLE perfil_usuario ADD COLUMN email_cuidador TEXT');
    }
    if (!temColuna('avisar_cuidador')) {
      await db.execAsync('ALTER TABLE perfil_usuario ADD COLUMN avisar_cuidador INTEGER DEFAULT 1');
    }
    // Cloud backup: which photos were uploaded, when each schedule started and which doses changed
    const adicionarColuna = async (tabela: string, coluna: string, definicao: string) => {
      const colunas = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tabela})`);
      if (!colunas.some((c) => c.name === coluna)) {
        await db.execAsync(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
      }
    };
    await adicionarColuna('medicamentos', 'foto_sincronizada', 'INTEGER DEFAULT 0');
    await adicionarColuna('horarios_medicamento', 'criado_em', 'TEXT');
    await adicionarColuna('historico_doses', 'sincronizado', 'INTEGER DEFAULT 0');

    // Clean up any mock/demo data from previous runs if present
    try {
      await db.runAsync(`DELETE FROM historico_doses WHERE id LIKE 'dose-today-%' OR id LIKE 'dose-d1-%'`);
      await db.runAsync(`DELETE FROM medicamentos WHERE id IN ('med-losartana', 'med-metformina', 'med-omeprazol')`);
      await db.runAsync(`DELETE FROM horarios_medicamento WHERE id IN ('hor-losartana-08', 'hor-metformina-12', 'hor-omeprazol-20', 'hor-1', 'hor-2', 'hor-3')`);
      await db.runAsync(`DELETE FROM perfil_usuario WHERE id = 'usr-joao-01'`);

      // Ensure a clean default local profile exists if table is empty
      const existing = await db.getAllAsync('SELECT * FROM perfil_usuario LIMIT 1');
      if (!existing || existing.length === 0) {
        await db.runAsync(
          `INSERT INTO perfil_usuario (id, nome, email, telefone_cuidador, nome_cuidador) 
           VALUES (?, ?, ?, ?, ?)`,
          ['usuario-local', '', null, null, null]
        );
      }
    } catch (cleanupErr) {
      console.log('DB cleanup check:', cleanupErr);
    }
  } else {
    loadMemoryStore();
    if (!memoryStore.perfil) {
      memoryStore.perfil = { id: 'usuario-local', nome: '', email: null, telefone_cuidador: null, nome_cuidador: null };
      persistMemoryStore();
    }
  }
};

export const getHasCompletedOnboarding = async (): Promise<boolean> => {
  const db = await getDatabase();
  if (db) {
    try {
      const rows = await db.getAllAsync<{ valor: string }>(
        `SELECT valor FROM app_settings WHERE chave = 'has_completed_onboarding' LIMIT 1`
      );
      if (rows && rows.length > 0) {
        return rows[0].valor === 'true';
      }
    } catch (e) {
      console.warn('Erro ao ler status de onboarding:', e);
    }
  }
  return memoryStore.onboardingCompleted;
};

export const setHasCompletedOnboarding = async (completed: boolean): Promise<void> => {
  memoryStore.onboardingCompleted = completed;
  persistMemoryStore();
  const db = await getDatabase();
  if (db) {
    try {
      await db.runAsync(
        `INSERT INTO app_settings (chave, valor) VALUES ('has_completed_onboarding', ?)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
        [completed ? 'true' : 'false']
      );
    } catch (e) {
      console.warn('Erro ao salvar status de onboarding:', e);
    }
  }
};

const lerAjuste = async (chave: string): Promise<string | null> => {
  const db = await getDatabase();
  if (db) {
    const row = await db.getFirstAsync<{ valor: string }>('SELECT valor FROM app_settings WHERE chave = ?', [chave]);
    return row?.valor ?? null;
  }
  return memoryStore.ajustes?.[chave] ?? null;
};

const salvarAjuste = async (chave: string, valor: string | null): Promise<void> => {
  const db = await getDatabase();
  if (db) {
    if (valor === null) {
      await db.runAsync('DELETE FROM app_settings WHERE chave = ?', [chave]);
    } else {
      await db.runAsync(
        `INSERT INTO app_settings (chave, valor) VALUES (?, ?)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
        [chave, valor]
      );
    }
    return;
  }
  memoryStore.ajustes = memoryStore.ajustes || {};
  if (valor === null) delete memoryStore.ajustes[chave];
  else memoryStore.ajustes[chave] = valor;
  persistMemoryStore();
};

// Data access operations
export const getPerfilUsuario = async (): Promise<PerfilUsuario | null> => {
  const db = await getDatabase();
  if (db) {
    const rows = await db.getAllAsync<Omit<PerfilUsuario, 'avisar_cuidador'> & { avisar_cuidador: number | null }>(
      'SELECT * FROM perfil_usuario LIMIT 1'
    );
    if (!rows || rows.length === 0) return null;
    // SQLite stores booleans as 0/1
    return { ...rows[0], avisar_cuidador: rows[0].avisar_cuidador !== 0 };
  }
  return memoryStore.perfil;
};

export const updatePerfilUsuario = async (perfil: Partial<PerfilUsuario>): Promise<void> => {
  const db = await getDatabase();
  if (db) {
    const current = await getPerfilUsuario();
    if (current) {
      await db.runAsync(
        `UPDATE perfil_usuario SET nome = ?, email = ?, telefone_cuidador = ?, nome_cuidador = ?, email_cuidador = ?, avisar_cuidador = ?, tamanho_fonte = ?, alto_contraste = ? WHERE id = ?`,
        [
          (perfil.nome ?? current.nome) || '',
          (perfil.email !== undefined ? perfil.email : current.email) ?? null,
          (perfil.telefone_cuidador !== undefined ? perfil.telefone_cuidador : current.telefone_cuidador) ?? null,
          (perfil.nome_cuidador !== undefined ? perfil.nome_cuidador : current.nome_cuidador) ?? null,
          (perfil.email_cuidador !== undefined ? perfil.email_cuidador : current.email_cuidador) ?? null,
          (perfil.avisar_cuidador ?? current.avisar_cuidador ?? true) ? 1 : 0,
          (perfil.tamanho_fonte ?? current.tamanho_fonte) || 'padrao',
          perfil.alto_contraste !== undefined ? (perfil.alto_contraste ? 1 : 0) : (current.alto_contraste ? 1 : 0),
          current.id,
        ]
      );
    }
  } else if (memoryStore.perfil) {
    memoryStore.perfil = { ...memoryStore.perfil, ...perfil };
    persistMemoryStore();
  }
};

export const getMedicamentos = async (): Promise<Medicamento[]> => {
  const db = await getDatabase();
  if (db) {
    return await db.getAllAsync<Medicamento>('SELECT * FROM medicamentos ORDER BY criado_em DESC');
  }
  return [...memoryStore.medicamentos];
};

export interface MedicamentoComHorarios extends Medicamento {
  horarios: Array<{ dosagem: string; hora_programada: string; dias_da_semana: string }>;
}

/**
 * Medications currently in the user's routine (at least one active schedule).
 * Removed medications stay in the table so the dose history remains intact.
 */
export interface ItemAgendaLembrete {
  doseId: string; // same id the dose gets in historico_doses ("dose-YYYY-MM-DD-<horarioId>")
  data: string; // YYYY-MM-DD
  horarioId: string;
  medicamentoId: string;
  nome: string;
  dosagem: string;
  orientacoes?: string | null;
  instante: Date; // when it should ring (accounts for snooze)
}

/**
 * Every dose that should ring in the next `dias` days: active schedules on their weekdays,
 * minus doses already marked as taken/skipped. Snoozed doses use their new time.
 */
export const getAgendaLembretes = async (dias: number): Promise<ItemAgendaLembrete[]> => {
  const db = await getDatabase();
  const hoje = new Date();
  const datas = Array.from({ length: dias }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i);
    return dataLocal(d);
  });

  type HorarioComMed = HorarioMedicamento & { nome: string; orientacoes_extras?: string | null };
  let horarios: HorarioComMed[];
  let doses: HistoricoDose[];

  if (db) {
    horarios = await db.getAllAsync<HorarioComMed>(
      `SELECT hm.*, m.nome, m.orientacoes_extras
       FROM horarios_medicamento hm
       JOIN medicamentos m ON hm.medicamento_id = m.id
       WHERE hm.ativo = 1`
    );
    doses = await db.getAllAsync<HistoricoDose>(
      'SELECT * FROM historico_doses WHERE data_hora_prevista >= ? AND data_hora_prevista <= ?',
      [datas[0], `${datas[datas.length - 1]}T23:59:59`]
    );
  } else {
    horarios = memoryStore.horarios
      .filter((h) => h.ativo !== false)
      .map((h) => {
        const med = memoryStore.medicamentos.find((m) => m.id === h.medicamento_id);
        return { ...h, nome: med?.nome || 'Remédio', orientacoes_extras: med?.orientacoes_extras };
      });
    doses = memoryStore.historico.filter((d) => d.data_hora_prevista >= datas[0]);
  }

  const dosePorId = new Map(doses.map((d) => [d.id, d]));

  const agenda: ItemAgendaLembrete[] = [];
  for (const data of datas) {
    for (const h of horarios) {
      if (!horarioValeNoDia(h.dias_da_semana, data)) continue;
      const doseId = `dose-${data}-${h.id}`;
      const dose = dosePorId.get(doseId);
      if (dose && dose.status !== 'PENDENTE') continue;
      agenda.push({
        doseId,
        data,
        horarioId: h.id,
        medicamentoId: h.medicamento_id,
        nome: h.nome,
        dosagem: h.dosagem,
        orientacoes: h.orientacoes_extras,
        instante: paraDate(dose ? dose.data_hora_prevista : `${data}T${h.hora_programada}`),
      });
    }
  }
  return agenda;
};

/** Finds one dose (creating that day's doses if the app wasn't opened yet that day) */
export const getDosePorId = async (doseId: string): Promise<DoseCompleta | null> => {
  const data = doseId.substring(5, 15); // "dose-YYYY-MM-DD-..."
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const doses = await getDosesDoDia(data);
  return doses.find((d) => d.id === doseId) ?? null;
};

export const getMedicamentosAtivos = async (): Promise<MedicamentoComHorarios[]> => {
  const db = await getDatabase();
  let meds: Medicamento[];
  let horarios: HorarioMedicamento[];

  if (db) {
    meds = await db.getAllAsync<Medicamento>('SELECT * FROM medicamentos ORDER BY nome COLLATE NOCASE');
    horarios = await db.getAllAsync<HorarioMedicamento>(
      'SELECT * FROM horarios_medicamento WHERE ativo = 1 ORDER BY hora_programada'
    );
  } else {
    meds = [...memoryStore.medicamentos].sort((a, b) => a.nome.localeCompare(b.nome));
    horarios = memoryStore.horarios
      .filter(h => h.ativo !== false)
      .sort((a, b) => a.hora_programada.localeCompare(b.hora_programada));
  }

  return meds
    .map(m => ({
      ...m,
      horarios: horarios
        .filter(h => h.medicamento_id === m.id)
        .map(h => ({ dosagem: h.dosagem, hora_programada: h.hora_programada, dias_da_semana: h.dias_da_semana || 'TODOS' })),
    }))
    .filter(m => m.horarios.length > 0);
};

/**
 * Removes a medication from the routine: deactivates its schedules and deletes the
 * doses still waiting from today on. Doses already taken/skipped are kept for the history.
 */
export const excluirMedicamento = async (medicamentoId: string): Promise<void> => {
  const hoje = dataLocal();
  const db = await getDatabase();

  if (db) {
    await db.runAsync('UPDATE horarios_medicamento SET ativo = 0 WHERE medicamento_id = ?', [medicamentoId]);
    await db.runAsync(
      `DELETE FROM historico_doses
       WHERE medicamento_id = ? AND status = 'PENDENTE' AND data_hora_prevista >= ?`,
      [medicamentoId, hoje]
    );
  } else {
    memoryStore.horarios.forEach(h => {
      if (h.medicamento_id === medicamentoId) h.ativo = false;
    });
    memoryStore.historico = memoryStore.historico.filter(
      d =>
        !(
          d.medicamento_id === medicamentoId &&
          d.status === 'PENDENTE' &&
          d.data_hora_prevista >= hoje
        )
    );
    persistMemoryStore();
  }
  notificarAlteracao();
};

/** One medication with its active schedules, to fill the edit form */
export const getMedicamentoParaEdicao = async (medicamentoId: string): Promise<MedicamentoComHorarios | null> => {
  const meds = await getMedicamentosAtivos();
  return meds.find(m => m.id === medicamentoId) ?? null;
};

/**
 * Saves the edited medication. A time that stays keeps its schedule (and today's dose, even if
 * already taken); a removed time is turned off like a removed medication; a new time starts
 * today. Doses already taken/skipped are never touched, so the history stays as it was.
 */
export const atualizarMedicamentoCompleto = async (
  medicamentoId: string,
  medData: Omit<Medicamento, 'id' | 'criado_em'>,
  horariosData: Array<{ dosagem: string; hora_programada: string; dias_da_semana: string }>
): Promise<void> => {
  const db = await getDatabase();
  const hoje = dataLocal();
  const agora = new Date();
  const agoraIso = agora.toISOString();

  if (db) {
    const existentes = await db.getAllAsync<HorarioMedicamento>(
      'SELECT * FROM horarios_medicamento WHERE medicamento_id = ? AND ativo = 1',
      [medicamentoId]
    );

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE medicamentos
         SET nome = ?, forma_farmaceutica = ?, cor = ?, orientacoes_extras = ?,
             foto_sincronizada = CASE WHEN foto_url IS ? THEN foto_sincronizada ELSE 0 END, foto_url = ?
         WHERE id = ?`,
        [
          medData.nome,
          medData.forma_farmaceutica,
          medData.cor,
          medData.orientacoes_extras || null,
          medData.foto_url || null,
          medData.foto_url || null,
          medicamentoId,
        ]
      );

      for (const ex of existentes) {
        const novo = horariosData.find(h => h.hora_programada === ex.hora_programada);
        if (!novo) {
          await db.runAsync('UPDATE horarios_medicamento SET ativo = 0 WHERE id = ?', [ex.id]);
          await db.runAsync(
            `DELETE FROM historico_doses WHERE horario_id = ? AND status = 'PENDENTE' AND data_hora_prevista >= ?`,
            [ex.id, hoje]
          );
          continue;
        }
        await db.runAsync('UPDATE horarios_medicamento SET dosagem = ?, dias_da_semana = ? WHERE id = ?', [
          novo.dosagem,
          novo.dias_da_semana || 'TODOS',
          ex.id,
        ]);
        // Waiting doses on days that left the schedule
        const pendentes = await db.getAllAsync<{ id: string; data_hora_prevista: string }>(
          `SELECT id, data_hora_prevista FROM historico_doses
           WHERE horario_id = ? AND status = 'PENDENTE' AND data_hora_prevista >= ?`,
          [ex.id, hoje]
        );
        for (const p of pendentes) {
          if (!horarioValeNoDia(novo.dias_da_semana, dataDaDose(p))) {
            await db.runAsync('DELETE FROM historico_doses WHERE id = ?', [p.id]);
          }
        }
        // A day just added to the schedule may be today
        const prevista = `${hoje}T${ex.hora_programada}:00`;
        if (horarioValeNoDia(novo.dias_da_semana, hoje) && doseDepoisDoCadastro(prevista, agora)) {
          await db.runAsync(
            `INSERT OR IGNORE INTO historico_doses (id, medicamento_id, horario_id, data_hora_prevista, status)
             VALUES (?, ?, ?, ?, 'PENDENTE')`,
            [`dose-${hoje}-${ex.id}`, medicamentoId, ex.id, prevista]
          );
        }
      }

      for (const h of horariosData) {
        if (existentes.some(ex => ex.hora_programada === h.hora_programada)) continue;
        const horId = `hor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        await db.runAsync(
          `INSERT INTO horarios_medicamento (id, medicamento_id, dosagem, hora_programada, dias_da_semana, criado_em)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [horId, medicamentoId, h.dosagem, h.hora_programada, h.dias_da_semana || 'TODOS', agoraIso]
        );
        const prevista = `${hoje}T${h.hora_programada}:00`;
        if (horarioValeNoDia(h.dias_da_semana, hoje) && doseDepoisDoCadastro(prevista, agora)) {
          await db.runAsync(
            `INSERT OR IGNORE INTO historico_doses (id, medicamento_id, horario_id, data_hora_prevista, status)
             VALUES (?, ?, ?, ?, 'PENDENTE')`,
            [`dose-${hoje}-${horId}`, medicamentoId, horId, prevista]
          );
        }
      }
    });
  } else {
    const med = memoryStore.medicamentos.find(m => m.id === medicamentoId);
    if (med) {
      if (med.foto_url !== medData.foto_url) med.foto_sincronizada = false;
      Object.assign(med, {
        nome: medData.nome,
        forma_farmaceutica: medData.forma_farmaceutica,
        cor: medData.cor,
        foto_url: medData.foto_url || null,
        orientacoes_extras: medData.orientacoes_extras || null,
      });
    }
    const existentes = memoryStore.horarios.filter(h => h.medicamento_id === medicamentoId && h.ativo !== false);
    const pendenteDesde = (d: HistoricoDose, horarioId: string) =>
      d.horario_id === horarioId && d.status === 'PENDENTE' && d.data_hora_prevista >= hoje;

    for (const ex of existentes) {
      const novo = horariosData.find(h => h.hora_programada === ex.hora_programada);
      if (!novo) {
        ex.ativo = false;
        memoryStore.historico = memoryStore.historico.filter(d => !pendenteDesde(d, ex.id));
        continue;
      }
      ex.dosagem = novo.dosagem;
      ex.dias_da_semana = novo.dias_da_semana || 'TODOS';
      memoryStore.historico = memoryStore.historico.filter(
        d => !(pendenteDesde(d, ex.id) && !horarioValeNoDia(ex.dias_da_semana, dataDaDose(d)))
      );
      const doseId = `dose-${hoje}-${ex.id}`;
      const prevista = `${hoje}T${ex.hora_programada}:00`;
      if (
        horarioValeNoDia(ex.dias_da_semana, hoje) &&
        doseDepoisDoCadastro(prevista, agora) &&
        !memoryStore.historico.some(d => d.id === doseId)
      ) {
        memoryStore.historico.push({ id: doseId, medicamento_id: medicamentoId, horario_id: ex.id, data_hora_prevista: prevista, status: 'PENDENTE' });
      }
    }

    for (const h of horariosData) {
      if (existentes.some(ex => ex.hora_programada === h.hora_programada)) continue;
      const horId = `hor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      memoryStore.horarios.push({
        id: horId,
        medicamento_id: medicamentoId,
        dosagem: h.dosagem,
        hora_programada: h.hora_programada,
        dias_da_semana: h.dias_da_semana || 'TODOS',
        ativo: true,
        criado_em: agoraIso,
      });
      const prevista = `${hoje}T${h.hora_programada}:00`;
      if (horarioValeNoDia(h.dias_da_semana, hoje) && doseDepoisDoCadastro(prevista, agora)) {
        memoryStore.historico.push({ id: `dose-${hoje}-${horId}`, medicamento_id: medicamentoId, horario_id: horId, data_hora_prevista: prevista, status: 'PENDENTE' });
      }
    }
    persistMemoryStore();
  }
  notificarAlteracao();
};

export const getDosesDoDia = async (dataStr?: string): Promise<DoseCompleta[]> => {
  const targetDate = dataStr || dataLocal();
  const db = await getDatabase();

  if (db) {
    const query = `
      SELECT 
        hd.id,
        hd.medicamento_id,
        hd.horario_id,
        hd.data_hora_prevista,
        hd.data_hora_realizada,
        hd.status,
        hd.observacao,
        m.nome AS medicamento_nome,
        m.forma_farmaceutica,
        m.cor,
        m.foto_url,
        m.orientacoes_extras,
        COALESCE(hm.dosagem, '1 dose') AS dosagem,
        COALESCE(hm.hora_programada, SUBSTR(hd.data_hora_prevista, 12, 5)) AS hora_programada
      FROM historico_doses hd
      JOIN medicamentos m ON hd.medicamento_id = m.id
      LEFT JOIN horarios_medicamento hm ON hd.horario_id = hm.id
      WHERE hd.data_hora_prevista LIKE ?
        AND (hm.id IS NULL OR hm.ativo = 1 OR hd.status <> 'PENDENTE')
      ORDER BY hd.data_hora_prevista ASC
    `;
    const rows = await db.getAllAsync<DoseCompleta>(query, [`${targetDate}%`]);
    
    // If no doses exist for today, automatically populate from active medication schedules
    if (rows.length === 0) {
      const schedules = await db.getAllAsync<any>(`
        SELECT hm.*, m.nome as medicamento_nome, m.forma_farmaceutica, m.cor, m.foto_url, m.orientacoes_extras 
        FROM horarios_medicamento hm
        JOIN medicamentos m ON hm.medicamento_id = m.id
        WHERE hm.ativo = 1
      `);
      
      for (const sc of schedules) {
        if (!horarioValeNoDia(sc.dias_da_semana, targetDate)) continue;
        const doseId = `dose-${targetDate}-${sc.id}`;
        const scheduledDateTime = `${targetDate}T${sc.hora_programada}:00`;
        await db.runAsync(
          `INSERT OR IGNORE INTO historico_doses (id, medicamento_id, horario_id, data_hora_prevista, status)
           VALUES (?, ?, ?, ?, 'PENDENTE')`,
          [doseId, sc.medicamento_id, sc.id, scheduledDateTime]
        );
      }
      return await db.getAllAsync<DoseCompleta>(query, [`${targetDate}%`]);
    }

    return rows;
  }

  // Memory fallback
  if (!memoryStore.historico.some(h => h.data_hora_prevista.startsWith(targetDate))) {
    const ativos = memoryStore.horarios.filter(
      hm => hm.ativo !== false && horarioValeNoDia(hm.dias_da_semana, targetDate)
    );
    for (const hor of ativos) {
      memoryStore.historico.push({
        id: `dose-${targetDate}-${hor.id}`,
        medicamento_id: hor.medicamento_id,
        horario_id: hor.id,
        data_hora_prevista: `${targetDate}T${hor.hora_programada}:00`,
        status: 'PENDENTE',
      });
    }
    if (ativos.length > 0) persistMemoryStore();
  }

  const horariosRemovidos = new Set(memoryStore.horarios.filter(hm => hm.ativo === false).map(hm => hm.id));
  const doses = memoryStore.historico
    .filter(h => h.data_hora_prevista.startsWith(targetDate) && !(h.status === 'PENDENTE' && h.horario_id && horariosRemovidos.has(h.horario_id)))
    .map(h => {
      const med = memoryStore.medicamentos.find(m => m.id === h.medicamento_id);
      const hor = memoryStore.horarios.find(hm => hm.id === h.horario_id);
      return {
        ...h,
        medicamento_nome: med?.nome || 'Medicamento',
        forma_farmaceutica: med?.forma_farmaceutica || 'Comprimido',
        cor: med?.cor || '#FFFFFF',
        foto_url: med?.foto_url,
        orientacoes_extras: med?.orientacoes_extras,
        dosagem: hor?.dosagem || '1 dose',
        hora_programada: hor?.hora_programada || h.data_hora_prevista.substring(11, 16),
      } as DoseCompleta;
    })
    .sort((a, b) => a.data_hora_prevista.localeCompare(b.data_hora_prevista));

  return doses;
};

/** Writes a dose record as given; every change is marked to be sent to the cloud backup */
const gravarDose = async (
  doseId: string,
  status: StatusDose,
  realizada: string | null,
  observacao: string | null
): Promise<void> => {
  const db = await getDatabase();
  const now = new Date().toISOString();

  if (db) {
    await db.runAsync(
      `UPDATE historico_doses
       SET status = ?, data_hora_realizada = ?, observacao = ?, atualizado_em = ?, sincronizado = 0
       WHERE id = ?`,
      [status, realizada, observacao, now, doseId]
    );
  } else {
    const dose = memoryStore.historico.find(d => d.id === doseId);
    if (dose) {
      Object.assign(dose, { status, data_hora_realizada: realizada, observacao, atualizado_em: now, sincronizado: false });
      persistMemoryStore();
    }
  }
  notificarAlteracao();
};

/** Sets a status chosen by the user (skip, back to pending...) */
export const updateDoseStatus = async (
  doseId: string,
  novoStatus: StatusDose,
  observacao?: string
): Promise<void> => {
  const realizada = novoStatus === 'TOMADO' || novoStatus === 'ATRASADO' ? new Date().toISOString() : null;
  await gravarDose(doseId, novoStatus, realizada, observacao || null);
};

/** Puts a dose back exactly as it was (the "Desfazer" button) */
export const restaurarDose = async (dose: HistoricoDose): Promise<void> => {
  await gravarDose(dose.id, dose.status, dose.data_hora_realizada ?? null, dose.observacao ?? null);
};

/**
 * Registers that the dose was taken now and returns how it was saved:
 * - up to MINUTOS_TOLERANCIA_ATRASO after the scheduled time → "TOMADO";
 * - later than that → "ATRASADO" (taken late);
 * - more than HORAS_CORRECAO_SEM_HORARIO later it is a correction of the record (e.g. marking
 *   yesterday's dose): the real time is unknown, so it is saved as taken without a time.
 * Lateness counts from the original time, so snoozing doesn't hide it.
 */
export const confirmarDose = async (doseId: string): Promise<StatusDose> => {
  const db = await getDatabase();
  let dose: { id: string; data_hora_prevista: string; hora_programada: string | null } | null;

  if (db) {
    dose = await db.getFirstAsync(
      `SELECT hd.id, hd.data_hora_prevista, hm.hora_programada
       FROM historico_doses hd
       LEFT JOIN horarios_medicamento hm ON hd.horario_id = hm.id
       WHERE hd.id = ?`,
      [doseId]
    );
  } else {
    const d = memoryStore.historico.find(h => h.id === doseId);
    const hor = d && memoryStore.horarios.find(h => h.id === d.horario_id);
    dose = d ? { id: d.id, data_hora_prevista: d.data_hora_prevista, hora_programada: hor?.hora_programada ?? null } : null;
  }

  let status: StatusDose = 'TOMADO';
  let realizada: string | null = new Date().toISOString();
  let observacao: string | null = null;
  if (dose) {
    const original = dose.hora_programada
      ? `${dataDaDose(dose)}T${dose.hora_programada}`
      : dose.data_hora_prevista;
    const minutosDeAtraso = (Date.now() - paraDate(original).getTime()) / 60_000;
    if (minutosDeAtraso > HORAS_CORRECAO_SEM_HORARIO * 60) {
      realizada = null;
      observacao = 'Marcada depois';
    } else if (minutosDeAtraso > MINUTOS_TOLERANCIA_ATRASO) {
      status = 'ATRASADO';
    }
  }
  await gravarDose(doseId, status, realizada, observacao);
  return status;
};

export const snoozeDose = async (doseId: string, minutes: number = 15): Promise<string> => {
  const db = await getDatabase();
  const now = new Date();
  const atualizadoEm = now.toISOString();
  now.setMinutes(now.getMinutes() + minutes);
  const newScheduledTime = `${dataLocal(now)}T${pad2(now.getHours())}:${pad2(now.getMinutes())}:00`;

  if (db) {
    await db.runAsync(
      `UPDATE historico_doses
       SET data_hora_prevista = ?, status = 'PENDENTE', observacao = 'Soneca (+15min)', atualizado_em = ?, sincronizado = 0
       WHERE id = ?`,
      [newScheduledTime, atualizadoEm, doseId]
    );
  } else {
    const dose = memoryStore.historico.find(d => d.id === doseId);
    if (dose) {
      dose.data_hora_prevista = newScheduledTime;
      dose.status = 'PENDENTE';
      dose.observacao = `Soneca (+${minutes}min)`;
      dose.atualizado_em = atualizadoEm;
      dose.sincronizado = false;
      persistMemoryStore();
    }
  }
  notificarAlteracao();
  return newScheduledTime;
};

let preparandoDoses: Promise<void> | null = null;

/**
 * Keeps the dose record complete without the user's help. Run when the app opens, comes back
 * to the screen and before showing the history:
 * 1. Creates the doses of days the app wasn't opened (otherwise those days would be missing
 *    from the history and the report), up to DIAS_MAX_PREENCHIMENTO back.
 * 2. A dose still unconfirmed when its day is over becomes "PULADO" ("Não confirmada").
 */
export const prepararDoses = (): Promise<void> => {
  if (!preparandoDoses) {
    preparandoDoses = prepararDosesAgora()
      .catch((e) => console.warn('Erro ao atualizar as doses:', e))
      .finally(() => {
        preparandoDoses = null;
      });
  }
  return preparandoDoses;
};

const CHAVE_DOSES_CRIADAS_ATE = 'doses_criadas_ate';

const prepararDosesAgora = async (): Promise<void> => {
  const db = await getDatabase();
  const agora = new Date();
  const hoje = dataLocal(agora);
  const agoraIso = agora.toISOString();
  let alterou = false;

  // 1. Days without doses
  const criadasAte = await lerAjuste(CHAVE_DOSES_CRIADAS_ATE);
  if (criadasAte !== hoje) {
    const limite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - DIAS_MAX_PREENCHIMENTO);
    const diaSeguinte = (dia: string) => {
      const d = paraDate(dia);
      return dataLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
    };
    const inicioGeral = [dataLocal(limite), criadasAte ? diaSeguinte(criadasAte) : ''].sort().pop()!;

    type HorarioComInicio = HorarioMedicamento & { inicio: string | null };
    let horarios: HorarioComInicio[];
    if (db) {
      horarios = await db.getAllAsync<HorarioComInicio>(
        `SELECT hm.*, COALESCE(hm.criado_em, m.criado_em) AS inicio
         FROM horarios_medicamento hm
         JOIN medicamentos m ON hm.medicamento_id = m.id
         WHERE hm.ativo = 1`
      );
    } else {
      horarios = memoryStore.horarios
        .filter(h => h.ativo !== false)
        .map(h => ({
          ...h,
          inicio: h.criado_em ?? memoryStore.medicamentos.find(m => m.id === h.medicamento_id)?.criado_em ?? null,
        }));
    }

    const novas: HistoricoDose[] = [];
    for (const h of horarios) {
      const criacao = lerCarimbo(h.inicio);
      let dia = criacao && dataLocal(criacao) > inicioGeral ? dataLocal(criacao) : inicioGeral;
      for (; dia <= hoje; dia = diaSeguinte(dia)) {
        const prevista = `${dia}T${h.hora_programada}:00`;
        if (!horarioValeNoDia(h.dias_da_semana, dia) || !doseDepoisDoCadastro(prevista, criacao)) continue;
        novas.push({
          id: `dose-${dia}-${h.id}`,
          medicamento_id: h.medicamento_id,
          horario_id: h.id,
          data_hora_prevista: prevista,
          status: 'PENDENTE',
        });
      }
    }

    if (db) {
      if (novas.length > 0) {
        await db.withTransactionAsync(async () => {
          for (const d of novas) {
            const r = await db.runAsync(
              `INSERT OR IGNORE INTO historico_doses (id, medicamento_id, horario_id, data_hora_prevista, status)
               VALUES (?, ?, ?, ?, 'PENDENTE')`,
              [d.id, d.medicamento_id, d.horario_id ?? null, d.data_hora_prevista]
            );
            if (r.changes > 0) alterou = true;
          }
        });
      }
    } else {
      const existentes = new Set(memoryStore.historico.map(d => d.id));
      for (const d of novas) {
        if (existentes.has(d.id)) continue;
        memoryStore.historico.push(d);
        alterou = true;
      }
    }
    await salvarAjuste(CHAVE_DOSES_CRIADAS_ATE, hoje);
  }

  // 2. Unconfirmed doses of days that are over
  const limitePular = dataHoraLocal(new Date(agora.getTime() - HORAS_ANTES_DE_PULAR * 3_600_000));
  if (db) {
    const r = await db.runAsync(
      `UPDATE historico_doses
       SET status = 'PULADO', observacao = 'Não confirmada', atualizado_em = ?, sincronizado = 0
       WHERE status = 'PENDENTE' AND data_hora_prevista < ? AND data_hora_prevista <= ?`,
      [agoraIso, hoje, limitePular]
    );
    if (r.changes > 0) alterou = true;
  } else {
    for (const d of memoryStore.historico) {
      if (d.status === 'PENDENTE' && d.data_hora_prevista < hoje && d.data_hora_prevista <= limitePular) {
        Object.assign(d, { status: 'PULADO', observacao: 'Não confirmada', atualizado_em: agoraIso, sincronizado: false });
        alterou = true;
      }
    }
    if (alterou) persistMemoryStore();
  }

  if (alterou) notificarAlteracao();
};

export const cadastrarMedicamentoCompleto = async (
  medData: Omit<Medicamento, 'id' | 'criado_em'>,
  horariosData: Array<{ dosagem: string; hora_programada: string; dias_da_semana: string }>
): Promise<string> => {
  const db = await getDatabase();
  const medId = `med-${Date.now()}`;
  const agora = new Date();
  const user = await getPerfilUsuario();
  const userId = user?.id || 'usuario-local';

  if (db) {
    await db.runAsync(
      `INSERT INTO medicamentos (id, usuario_id, nome, forma_farmaceutica, cor, foto_url, orientacoes_extras)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        medId,
        userId,
        medData.nome,
        medData.forma_farmaceutica,
        medData.cor,
        medData.foto_url || null,
        medData.orientacoes_extras || null,
      ]
    );

    for (const h of horariosData) {
      const horId = `hor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      await db.runAsync(
        `INSERT INTO horarios_medicamento (id, medicamento_id, dosagem, hora_programada, dias_da_semana, criado_em)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [horId, medId, h.dosagem, h.hora_programada, h.dias_da_semana || 'TODOS', agora.toISOString()]
      );

      // Create today's dose if scheduled for today (and not long before the medication was added)
      const todayStr = dataLocal();
      const prevista = `${todayStr}T${h.hora_programada}:00`;
      if (!horarioValeNoDia(h.dias_da_semana, todayStr) || !doseDepoisDoCadastro(prevista, agora)) continue;
      const doseId = `dose-${todayStr}-${horId}`;
      await db.runAsync(
        `INSERT OR IGNORE INTO historico_doses (id, medicamento_id, horario_id, data_hora_prevista, status)
         VALUES (?, ?, ?, ?, 'PENDENTE')`,
        [doseId, medId, horId, prevista]
      );
    }
  } else {
    const newMed: Medicamento = {
      id: medId,
      usuario_id: userId,
      nome: medData.nome,
      forma_farmaceutica: medData.forma_farmaceutica,
      cor: medData.cor,
      foto_url: medData.foto_url,
      orientacoes_extras: medData.orientacoes_extras,
      criado_em: new Date().toISOString(),
    };
    memoryStore.medicamentos.unshift(newMed);

    const todayStr = dataLocal();
    for (const h of horariosData) {
      const horId = `hor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const newHor: HorarioMedicamento = {
        id: horId,
        medicamento_id: medId,
        dosagem: h.dosagem,
        hora_programada: h.hora_programada,
        dias_da_semana: h.dias_da_semana || 'TODOS',
        ativo: true,
        criado_em: agora.toISOString(),
      };
      memoryStore.horarios.push(newHor);

      const prevista = `${todayStr}T${h.hora_programada}:00`;
      if (!horarioValeNoDia(newHor.dias_da_semana, todayStr) || !doseDepoisDoCadastro(prevista, agora)) continue;
      memoryStore.historico.push({
        id: `dose-${todayStr}-${horId}`,
        medicamento_id: medId,
        horario_id: horId,
        data_hora_prevista: prevista,
        status: 'PENDENTE',
      });
    }
    persistMemoryStore();
  }

  notificarAlteracao();
  return medId;
};

export interface RelatorioMedicamento {
  medicamento_id: string;
  nome: string;
  dosagem: string;
  horarios: string[];
  tomadas: number;
  atrasadas: number;
  puladas: number;
  semRegistro: number;
  registros: RegistroDose[]; // most recent first
}

export interface RegistroDose {
  prevista: string; // local YYYY-MM-DDTHH:mm:ss
  realizada: string | null; // ISO timestamp of when it was marked as taken
  status: StatusDose;
  observacao: string | null; // "Não confirmada" when the app closed the dose at the end of the day
}

export interface RelatorioAdesao {
  inicio: string; // YYYY-MM-DD
  fim: string; // YYYY-MM-DD
  totalPrevistas: number;
  tomadas: number;
  atrasadas: number;
  puladas: number;
  semRegistro: number;
  adesaoPercentual: number | null;
  medicamentos: RelatorioMedicamento[];
}

/**
 * Adherence summary for the doctor over the last `dias` days. Includes every dose already due
 * plus later doses of today that were already marked (taken early / skipped). Past doses never
 * marked count as "sem registro"; upcoming unmarked doses are ignored.
 */
export const getRelatorioAdesao = async (dias: number = 30): Promise<RelatorioAdesao> => {
  const agora = new Date();
  const inicioDate = new Date(agora);
  inicioDate.setDate(inicioDate.getDate() - (dias - 1));
  const inicio = dataLocal(inicioDate);
  const fim = dataLocal(agora);
  const agoraStr = dataHoraLocal(agora);
  const fimDoDia = `${fim}T23:59:59`;

  const db = await getDatabase();
  let doses: DoseCompleta[];

  if (db) {
    doses = await db.getAllAsync<DoseCompleta>(
      `SELECT hd.*, m.nome AS medicamento_nome,
              COALESCE(hm.dosagem, '1 dose') AS dosagem,
              COALESCE(hm.hora_programada, SUBSTR(hd.data_hora_prevista, 12, 5)) AS hora_programada
       FROM historico_doses hd
       JOIN medicamentos m ON hd.medicamento_id = m.id
       LEFT JOIN horarios_medicamento hm ON hd.horario_id = hm.id
       WHERE hd.data_hora_prevista >= ? AND hd.data_hora_prevista <= ?
         AND (hd.data_hora_prevista <= ? OR hd.status <> 'PENDENTE')
       ORDER BY m.nome COLLATE NOCASE, hd.data_hora_prevista`,
      [inicio, fimDoDia, agoraStr]
    );
  } else {
    doses = memoryStore.historico
      .filter(
        h =>
          h.data_hora_prevista >= inicio &&
          h.data_hora_prevista <= fimDoDia &&
          (h.data_hora_prevista <= agoraStr || h.status !== 'PENDENTE')
      )
      .map(h => {
        const med = memoryStore.medicamentos.find(m => m.id === h.medicamento_id);
        const hor = memoryStore.horarios.find(hm => hm.id === h.horario_id);
        return {
          ...h,
          medicamento_nome: med?.nome || 'Medicamento',
          dosagem: hor?.dosagem || '1 dose',
          hora_programada: hor?.hora_programada || h.data_hora_prevista.substring(11, 16),
        } as DoseCompleta;
      })
      .sort((a, b) => a.medicamento_nome.localeCompare(b.medicamento_nome));
  }

  const porMed = new Map<string, RelatorioMedicamento>();
  for (const d of doses) {
    let item = porMed.get(d.medicamento_id);
    if (!item) {
      item = {
        medicamento_id: d.medicamento_id,
        nome: d.medicamento_nome,
        dosagem: d.dosagem,
        horarios: [],
        tomadas: 0,
        atrasadas: 0,
        puladas: 0,
        semRegistro: 0,
        registros: [],
      };
      porMed.set(d.medicamento_id, item);
    }
    if (!item.horarios.includes(d.hora_programada)) item.horarios.push(d.hora_programada);
    item.registros.push({
      prevista: d.data_hora_prevista,
      realizada: d.data_hora_realizada ?? null,
      status: d.status,
      observacao: d.observacao ?? null,
    });
    if (d.status === 'TOMADO') item.tomadas += 1;
    else if (d.status === 'ATRASADO') item.atrasadas += 1;
    else if (d.status === 'PULADO') item.puladas += 1;
    else item.semRegistro += 1;
  }

  const medicamentos = [...porMed.values()].map(m => ({
    ...m,
    horarios: m.horarios.sort(),
    registros: m.registros.sort((a, b) => b.prevista.localeCompare(a.prevista)),
  }));
  const soma = (k: 'tomadas' | 'atrasadas' | 'puladas' | 'semRegistro') =>
    medicamentos.reduce((acc, m) => acc + m[k], 0);
  const totalPrevistas = doses.length;
  const tomadas = soma('tomadas');
  const atrasadas = soma('atrasadas');

  return {
    inicio,
    fim,
    totalPrevistas,
    tomadas,
    atrasadas,
    puladas: soma('puladas'),
    semRegistro: soma('semRegistro'),
    // A dose taken late was still taken
    adesaoPercentual: totalPrevistas > 0 ? Math.round(((tomadas + atrasadas) / totalPrevistas) * 100) : null,
    medicamentos,
  };
};

export const getHistoricoMensal = async (mesAno?: string): Promise<{
  tomadas: number;
  comAtraso: number;
  puladas: number;
  dosesPorDia: Record<string, DoseCompleta[]>;
}> => {
  const agora = new Date();
  const currentMonth =
    mesAno || `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`; // e.g. "2026-10"
  const db = await getDatabase();

  let doses: DoseCompleta[] = [];

  if (db) {
    const query = `
      SELECT 
        hd.id,
        hd.medicamento_id,
        hd.horario_id,
        hd.data_hora_prevista,
        hd.data_hora_realizada,
        hd.status,
        hd.observacao,
        m.nome AS medicamento_nome,
        m.forma_farmaceutica,
        m.cor,
        m.foto_url,
        m.orientacoes_extras,
        COALESCE(hm.dosagem, '1 dose') AS dosagem,
        COALESCE(hm.hora_programada, SUBSTR(hd.data_hora_prevista, 12, 5)) AS hora_programada
      FROM historico_doses hd
      JOIN medicamentos m ON hd.medicamento_id = m.id
      LEFT JOIN horarios_medicamento hm ON hd.horario_id = hm.id
      WHERE SUBSTR(hd.data_hora_prevista, 1, 7) = ?
      ORDER BY hd.data_hora_prevista DESC
    `;
    doses = await db.getAllAsync<DoseCompleta>(query, [currentMonth]);
  } else {
    doses = memoryStore.historico
      .filter(h => h.data_hora_prevista.substring(0, 7) === currentMonth)
      .map(h => {
        const med = memoryStore.medicamentos.find(m => m.id === h.medicamento_id);
        const hor = memoryStore.horarios.find(hm => hm.id === h.horario_id);
        return {
          ...h,
          medicamento_nome: med?.nome || 'Medicamento',
          forma_farmaceutica: med?.forma_farmaceutica || 'Comprimido',
          cor: med?.cor || '#FFFFFF',
          foto_url: med?.foto_url,
          orientacoes_extras: med?.orientacoes_extras,
          dosagem: hor?.dosagem || '1 dose',
          hora_programada: hor?.hora_programada || h.data_hora_prevista.substring(11, 16),
        } as DoseCompleta;
      });
  }

  let tomadas = 0;
  let comAtraso = 0;
  let puladas = 0;
  const dosesPorDia: Record<string, DoseCompleta[]> = {};

  for (const dose of doses) {
    const dia = dose.data_hora_prevista.split('T')[0];
    if (!dosesPorDia[dia]) {
      dosesPorDia[dia] = [];
    }
    dosesPorDia[dia].push(dose);

    if (dose.status === 'TOMADO') {
      tomadas += 1;
    } else if (dose.status === 'ATRASADO') {
      comAtraso += 1;
    } else if (dose.status === 'PULADO') {
      puladas += 1;
    }
  }

  return {
    tomadas,
    comAtraso,
    puladas,
    dosesPorDia,
  };
};

// ---------------------------------------------------------------------------
// Cloud backup (src/services/supabase.ts)
//
// Schedules always go up whole (they are few). Doses go up only when they changed
// (sincronizado = 0). Pending doses need no copy, because they are recreated from the
// schedules, so a dose that went back to pending is deleted from the backup.
// ---------------------------------------------------------------------------

export const getHorariosParaNuvem = async (): Promise<HorarioMedicamento[]> => {
  const db = await getDatabase();
  if (db) {
    const rows = await db.getAllAsync<Omit<HorarioMedicamento, 'ativo'> & { ativo: number }>('SELECT * FROM horarios_medicamento');
    return rows.map(h => ({ ...h, ativo: h.ativo !== 0 }));
  }
  return memoryStore.horarios.map(h => ({ ...h, ativo: h.ativo !== false }));
};

export const getDosesParaNuvem = async (): Promise<HistoricoDose[]> => {
  const db = await getDatabase();
  if (db) {
    return await db.getAllAsync<HistoricoDose>(
      `SELECT id, medicamento_id, horario_id, data_hora_prevista, data_hora_realizada, status, observacao, atualizado_em
       FROM historico_doses WHERE COALESCE(sincronizado, 0) = 0`
    );
  }
  return memoryStore.historico.filter(d => !d.sincronizado);
};

/** Marks doses as sent, except the ones that changed again while they were being sent */
export const marcarDosesSincronizadas = async (doses: HistoricoDose[]): Promise<void> => {
  if (doses.length === 0) return;
  const db = await getDatabase();
  if (db) {
    await db.withTransactionAsync(async () => {
      for (const d of doses) {
        await db.runAsync('UPDATE historico_doses SET sincronizado = 1 WHERE id = ? AND atualizado_em IS ?', [
          d.id,
          d.atualizado_em ?? null,
        ]);
      }
    });
    return;
  }
  for (const d of doses) {
    const local = memoryStore.historico.find(h => h.id === d.id);
    if (local && local.atualizado_em === d.atualizado_em) local.sincronizado = true;
  }
  persistMemoryStore();
};

/** Medications whose current photo isn't in the backup yet */
export const getFotosParaNuvem = async (): Promise<Array<{ id: string; foto_url: string }>> => {
  const db = await getDatabase();
  if (db) {
    return await db.getAllAsync<{ id: string; foto_url: string }>(
      `SELECT id, foto_url FROM medicamentos WHERE foto_url IS NOT NULL AND COALESCE(foto_sincronizada, 0) = 0`
    );
  }
  return memoryStore.medicamentos
    .filter(m => m.foto_url && !m.foto_sincronizada)
    .map(m => ({ id: m.id, foto_url: m.foto_url as string }));
};

export const marcarFotoSincronizada = async (medicamentoId: string, fotoUrl: string): Promise<void> => {
  const db = await getDatabase();
  if (db) {
    await db.runAsync('UPDATE medicamentos SET foto_sincronizada = 1 WHERE id = ? AND foto_url = ?', [medicamentoId, fotoUrl]);
    return;
  }
  const med = memoryStore.medicamentos.find(m => m.id === medicamentoId);
  if (med && med.foto_url === fotoUrl) {
    med.foto_sincronizada = true;
    persistMemoryStore();
  }
};

/** Photo downloaded from the backup for a medication restored without one */
export const definirFotoRestaurada = async (medicamentoId: string, fotoUrl: string): Promise<void> => {
  const db = await getDatabase();
  if (db) {
    await db.runAsync(
      'UPDATE medicamentos SET foto_url = ?, foto_sincronizada = 1 WHERE id = ? AND foto_url IS NULL',
      [fotoUrl, medicamentoId]
    );
  } else {
    const med = memoryStore.medicamentos.find(m => m.id === medicamentoId);
    if (med && !med.foto_url) {
      med.foto_url = fotoUrl;
      med.foto_sincronizada = true;
      persistMemoryStore();
    }
  }
  notificarAlteracao();
};

export interface DadosNuvem {
  medicamentos: Medicamento[];
  horarios: HorarioMedicamento[];
  doses: HistoricoDose[];
}

/**
 * Brings the cloud backup into this phone (login on a new phone, or after reinstalling).
 * What exists only here is kept, and a dose registered in the backup replaces one still
 * pending here. Then the doses of the days in between are recreated and the reminders
 * rescheduled. Returns the ids of the medications that were added.
 */
export const restaurarDadosDaNuvem = async (dados: DadosNuvem): Promise<string[]> => {
  const db = await getDatabase();
  const perfil = await getPerfilUsuario();
  const usuarioId = perfil?.id || 'usuario-local';
  const novos: string[] = [];

  if (db) {
    await db.withTransactionAsync(async () => {
      for (const m of dados.medicamentos) {
        const r = await db.runAsync(
          `INSERT OR IGNORE INTO medicamentos
             (id, usuario_id, nome, forma_farmaceutica, cor, foto_url, orientacoes_extras, criado_em, foto_sincronizada)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 1)`,
          [m.id, usuarioId, m.nome, m.forma_farmaceutica, m.cor, m.orientacoes_extras ?? null, m.criado_em ?? new Date().toISOString()]
        );
        if (r.changes > 0) novos.push(m.id);
      }
      for (const h of dados.horarios) {
        await db.runAsync(
          `INSERT OR IGNORE INTO horarios_medicamento (id, medicamento_id, dosagem, hora_programada, dias_da_semana, ativo, criado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [h.id, h.medicamento_id, h.dosagem, h.hora_programada, h.dias_da_semana || 'TODOS', h.ativo ? 1 : 0, h.criado_em ?? null]
        );
        // A schedule turned off on the other phone stays off here
        if (!h.ativo) await db.runAsync('UPDATE horarios_medicamento SET ativo = 0 WHERE id = ?', [h.id]);
      }
      for (const d of dados.doses) {
        await db.runAsync(
          `INSERT INTO historico_doses
             (id, medicamento_id, horario_id, data_hora_prevista, data_hora_realizada, status, observacao, atualizado_em, sincronizado)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
           ON CONFLICT(id) DO UPDATE SET
             data_hora_prevista = excluded.data_hora_prevista,
             data_hora_realizada = excluded.data_hora_realizada,
             status = excluded.status,
             observacao = excluded.observacao,
             atualizado_em = excluded.atualizado_em,
             sincronizado = 1
           WHERE historico_doses.status = 'PENDENTE'`,
          [
            d.id,
            d.medicamento_id,
            d.horario_id ?? null,
            d.data_hora_prevista,
            d.data_hora_realizada ?? null,
            d.status,
            d.observacao ?? null,
            d.atualizado_em ?? null,
          ]
        );
      }
    });
  } else {
    for (const m of dados.medicamentos) {
      if (memoryStore.medicamentos.some(x => x.id === m.id)) continue;
      memoryStore.medicamentos.push({ ...m, usuario_id: usuarioId, foto_url: null, foto_sincronizada: true });
      novos.push(m.id);
    }
    for (const h of dados.horarios) {
      const local = memoryStore.horarios.find(x => x.id === h.id);
      if (!local) memoryStore.horarios.push({ ...h });
      else if (!h.ativo) local.ativo = false;
    }
    for (const d of dados.doses) {
      const i = memoryStore.historico.findIndex(x => x.id === d.id);
      if (i === -1) memoryStore.historico.push({ ...d, sincronizado: true });
      else if (memoryStore.historico[i].status === 'PENDENTE') memoryStore.historico[i] = { ...d, sincronizado: true };
    }
    persistMemoryStore();
  }

  // Schedules from the backup may start before the days already filled in on this phone
  await salvarAjuste(CHAVE_DOSES_CRIADAS_ATE, null);
  await prepararDoses();
  notificarAlteracao();
  return novos;
};
