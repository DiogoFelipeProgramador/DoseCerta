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

// Fallback store for web (no native SQLite). Persisted to the browser's localStorage so
// data survives reloads, keeping the "works without an account" promise on every platform.
const memoryStore = {
  perfil: null as PerfilUsuario | null,
  medicamentos: [] as Medicamento[],
  horarios: [] as HorarioMedicamento[],
  historico: [] as HistoricoDose[],
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
  const paraDate = (local: string) => {
    const [dia, hora] = local.split('T');
    const [a, m, d] = dia.split('-').map(Number);
    const [hh, mm] = hora.split(':').map(Number);
    return new Date(a, m - 1, d, hh, mm);
  };

  const agenda: ItemAgendaLembrete[] = [];
  for (const data of datas) {
    for (const h of horarios) {
      if (!horarioValeNoDia(h.dias_da_semana, data)) continue;
      const doseId = `dose-${data}-${h.id}`;
      const dose = dosePorId.get(doseId);
      if (dose && (dose.status === 'TOMADO' || dose.status === 'PULADO')) continue;
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
       WHERE medicamento_id = ? AND status IN ('PENDENTE', 'ATRASADO') AND data_hora_prevista >= ?`,
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
          (d.status === 'PENDENTE' || d.status === 'ATRASADO') &&
          d.data_hora_prevista >= hoje
        )
    );
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
        AND (hm.id IS NULL OR hm.ativo = 1)
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
    .filter(h => h.data_hora_prevista.startsWith(targetDate) && !(h.horario_id && horariosRemovidos.has(h.horario_id)))
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

export const updateDoseStatus = async (
  doseId: string,
  novoStatus: StatusDose,
  observacao?: string
): Promise<void> => {
  const db = await getDatabase();
  const now = new Date().toISOString();

  if (db) {
    const dataHoraRealizada = novoStatus === 'TOMADO' ? now : null;
    await db.runAsync(
      `UPDATE historico_doses 
       SET status = ?, data_hora_realizada = ?, observacao = ?, atualizado_em = ?
       WHERE id = ?`,
      [novoStatus, dataHoraRealizada, observacao || null, now, doseId]
    );
  } else {
    const dose = memoryStore.historico.find(d => d.id === doseId);
    if (dose) {
      dose.status = novoStatus;
      dose.data_hora_realizada = novoStatus === 'TOMADO' ? now : null;
      dose.observacao = observacao || dose.observacao;
      dose.atualizado_em = now;
      persistMemoryStore();
    }
  }
  notificarAlteracao();
};

export const snoozeDose = async (doseId: string, minutes: number = 15): Promise<string> => {
  const db = await getDatabase();
  const now = new Date();
  now.setMinutes(now.getMinutes() + minutes);
  const newScheduledTime = `${dataLocal(now)}T${pad2(now.getHours())}:${pad2(now.getMinutes())}:00`;

  if (db) {
    await db.runAsync(
      `UPDATE historico_doses 
       SET data_hora_prevista = ?, status = 'PENDENTE', observacao = 'Soneca (+15min)'
       WHERE id = ?`,
      [newScheduledTime, doseId]
    );
  } else {
    const dose = memoryStore.historico.find(d => d.id === doseId);
    if (dose) {
      dose.data_hora_prevista = newScheduledTime;
      dose.status = 'PENDENTE';
      dose.observacao = `Soneca (+${minutes}min)`;
      persistMemoryStore();
    }
  }
  notificarAlteracao();
  return newScheduledTime;
};

export const cadastrarMedicamentoCompleto = async (
  medData: Omit<Medicamento, 'id' | 'criado_em'>,
  horariosData: Array<{ dosagem: string; hora_programada: string; dias_da_semana: string }>
): Promise<string> => {
  const db = await getDatabase();
  const medId = `med-${Date.now()}`;
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
        `INSERT INTO horarios_medicamento (id, medicamento_id, dosagem, hora_programada, dias_da_semana)
         VALUES (?, ?, ?, ?, ?)`,
        [horId, medId, h.dosagem, h.hora_programada, h.dias_da_semana || 'TODOS']
      );

      // Create today's dose if scheduled for today
      const todayStr = dataLocal();
      if (!horarioValeNoDia(h.dias_da_semana, todayStr)) continue;
      const doseId = `dose-${todayStr}-${horId}`;
      await db.runAsync(
        `INSERT OR IGNORE INTO historico_doses (id, medicamento_id, horario_id, data_hora_prevista, status)
         VALUES (?, ?, ?, ?, 'PENDENTE')`,
        [doseId, medId, horId, `${todayStr}T${h.hora_programada}:00`]
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
      };
      memoryStore.horarios.push(newHor);

      if (!horarioValeNoDia(newHor.dias_da_semana, todayStr)) continue;
      memoryStore.historico.push({
        id: `dose-${todayStr}-${horId}`,
        medicamento_id: medId,
        horario_id: horId,
        data_hora_prevista: `${todayStr}T${h.hora_programada}:00`,
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
         AND (hd.data_hora_prevista <= ? OR hd.status IN ('TOMADO', 'PULADO'))
       ORDER BY m.nome COLLATE NOCASE, hd.data_hora_prevista`,
      [inicio, fimDoDia, agoraStr]
    );
  } else {
    doses = memoryStore.historico
      .filter(
        h =>
          h.data_hora_prevista >= inicio &&
          h.data_hora_prevista <= fimDoDia &&
          (h.data_hora_prevista <= agoraStr || h.status === 'TOMADO' || h.status === 'PULADO')
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
    item.registros.push({ prevista: d.data_hora_prevista, realizada: d.data_hora_realizada ?? null, status: d.status });
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

  return {
    inicio,
    fim,
    totalPrevistas,
    tomadas,
    atrasadas: soma('atrasadas'),
    puladas: soma('puladas'),
    semRegistro: soma('semRegistro'),
    adesaoPercentual: totalPrevistas > 0 ? Math.round((tomadas / totalPrevistas) * 100) : null,
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
