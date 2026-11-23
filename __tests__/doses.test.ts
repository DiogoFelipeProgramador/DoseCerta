// Dose rules of src/database/sqlite.ts. Without native SQLite in Jest, the module uses its
// in-memory store (the same one the web version uses), so the rules run exactly as in the app.
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.reject(new Error('sem SQLite nos testes'))),
}));

type Banco = typeof import('../src/database/sqlite');
let banco: Banco;

// October 2026: the 19th is a Monday
const em = (dia: number, hora: number, minuto = 0) => new Date(2026, 9, dia, hora, minuto);
const agora = (d: Date) => jest.setSystemTime(d);
const data = (dia: number) => `2026-10-${String(dia).padStart(2, '0')}`;

beforeEach(async () => {
  jest.resetModules(); // fresh in-memory store for each test
  jest.useFakeTimers();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  agora(em(20, 7));
  banco = require('../src/database/sqlite');
  await banco.initDatabase();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const cadastrar = (horarios: string[] = ['08:00'], dias = 'TODOS') =>
  banco.cadastrarMedicamentoCompleto(
    { nome: 'Losartana 50 mg', forma_farmaceutica: 'Comprimido', cor: '#FFFFFF', foto_url: null, orientacoes_extras: null },
    horarios.map((h) => ({ dosagem: '1 comprimido', hora_programada: h, dias_da_semana: dias }))
  );

const doseDoDia = async (dia: number, hora = '08:00') => {
  const dose = (await banco.getDosesDoDia(data(dia))).find((d) => d.hora_programada === hora);
  if (!dose) throw new Error(`Sem dose em ${data(dia)} às ${hora}`);
  return dose;
};

const historicoDoMes = async () => (await banco.getHistoricoMensal('2026-10')).dosesPorDia;

describe('horarioValeNoDia', () => {
  it('respeita os dias da semana escolhidos', () => {
    expect(banco.horarioValeNoDia('SEG,QUA', data(19))).toBe(true); // segunda
    expect(banco.horarioValeNoDia('SEG,QUA', data(20))).toBe(false); // terça
    expect(banco.horarioValeNoDia('TODOS', data(20))).toBe(true);
  });
});

describe('confirmarDose', () => {
  it('até 30 minutos depois do horário, registra como "Tomado"', async () => {
    await cadastrar();
    agora(em(20, 8, 25));
    const dose = await doseDoDia(20);

    expect(await banco.confirmarDose(dose.id)).toBe('TOMADO');
    expect((await doseDoDia(20)).data_hora_realizada).toBeTruthy();
  });

  it('mais de 30 minutos depois, registra como "Com atraso"', async () => {
    await cadastrar();
    agora(em(20, 8, 45));

    expect(await banco.confirmarDose((await doseDoDia(20)).id)).toBe('ATRASADO');
  });

  it('adiar o lembrete não esconde o atraso (conta o horário original)', async () => {
    await cadastrar();
    agora(em(20, 8, 0));
    const dose = await doseDoDia(20);
    await banco.snoozeDose(dose.id, 15); // rings again at 08:15
    agora(em(20, 8, 40)); // 25 min after the snooze, 40 min after the original time

    expect(await banco.confirmarDose(dose.id)).toBe('ATRASADO');
  });

  it('mais de 12 horas depois é uma correção: "Tomado" sem hora', async () => {
    await cadastrar();
    agora(em(21, 9, 0));
    const dose = await doseDoDia(20);

    expect(await banco.confirmarDose(dose.id)).toBe('TOMADO');
    const corrigida = await doseDoDia(20);
    expect(corrigida.data_hora_realizada).toBeNull();
    expect(corrigida.observacao).toBe('Marcada depois');
  });
});

describe('prepararDoses (registro automático)', () => {
  it('cria as doses dos dias em que o app não foi aberto e fecha as não confirmadas', async () => {
    await cadastrar();
    agora(em(23, 10));
    await banco.prepararDoses();

    const historico = await historicoDoMes();
    for (const dia of [20, 21, 22]) {
      expect(historico[data(dia)]).toHaveLength(1);
      expect(historico[data(dia)][0]).toMatchObject({ status: 'PULADO', observacao: 'Não confirmada' });
    }
    expect(historico[data(23)][0].status).toBe('PENDENTE'); // today is not over
  });

  it('não altera doses já confirmadas', async () => {
    await cadastrar();
    agora(em(20, 8, 10));
    await banco.confirmarDose((await doseDoDia(20)).id);
    agora(em(22, 10));
    await banco.prepararDoses();

    expect((await historicoDoMes())[data(20)][0].status).toBe('TOMADO');
  });

  it('dá 2 horas de tolerância a uma dose perto da meia-noite', async () => {
    await cadastrar(['23:30']);
    agora(em(21, 0, 30));
    await banco.prepararDoses();
    expect((await historicoDoMes())[data(20)][0].status).toBe('PENDENTE');

    agora(em(21, 2, 0));
    await banco.prepararDoses();
    expect((await historicoDoMes())[data(20)][0].status).toBe('PULADO');
  });

  it('só cria doses nos dias da semana do horário', async () => {
    await cadastrar(['08:00'], 'SEG,QUA'); // tuesday the 20th: no dose today
    agora(em(26, 10));
    await banco.prepararDoses();

    expect(Object.keys(await historicoDoMes()).sort()).toEqual([data(21), data(26)]); // wednesday, monday
  });
});

describe('cadastro de remédio', () => {
  it('cadastrado à tarde, não gera a dose da manhã (que viraria "não confirmada")', async () => {
    agora(em(20, 15));
    await cadastrar(['08:00', '20:00']);

    const hoje = (await historicoDoMes())[data(20)];
    expect(hoje.map((d) => d.hora_programada)).toEqual(['20:00']);
  });
});

describe('edição de remédio', () => {
  it('mantém a dose já tomada, desliga o horário removido e cria o novo', async () => {
    await cadastrar(['08:00', '20:00']);
    agora(em(20, 8, 10));
    await banco.confirmarDose((await doseDoDia(20)).id);
    const [med] = await banco.getMedicamentosAtivos();

    await banco.atualizarMedicamentoCompleto(
      med.id,
      { nome: 'Losartana 100 mg', forma_farmaceutica: 'Comprimido', cor: '#FFFFFF', foto_url: null, orientacoes_extras: null },
      [
        { dosagem: '2 comprimidos', hora_programada: '08:00', dias_da_semana: 'TODOS' },
        { dosagem: '2 comprimidos', hora_programada: '21:00', dias_da_semana: 'TODOS' },
      ]
    );

    const hoje = await banco.getDosesDoDia(data(20));
    expect(hoje.map((d) => [d.hora_programada, d.status])).toEqual([
      ['08:00', 'TOMADO'],
      ['21:00', 'PENDENTE'],
    ]);
    const [editado] = await banco.getMedicamentosAtivos();
    expect(editado.nome).toBe('Losartana 100 mg');
    expect(editado.horarios.map((h) => h.dosagem)).toEqual(['2 comprimidos', '2 comprimidos']);
  });
});

describe('relatório de adesão', () => {
  it('conta a dose tomada com atraso como tomada', async () => {
    await cadastrar();
    agora(em(20, 8, 10));
    await banco.confirmarDose((await doseDoDia(20)).id); // on time
    agora(em(21, 9, 0));
    await banco.confirmarDose((await doseDoDia(21)).id); // 1 h late
    agora(em(23, 10)); // the 22nd was missed, the 23rd is still unconfirmed
    await banco.prepararDoses();

    const r = await banco.getRelatorioAdesao(7);
    expect(r).toMatchObject({ totalPrevistas: 4, tomadas: 1, atrasadas: 1, puladas: 1, semRegistro: 1 });
    expect(r.adesaoPercentual).toBe(50);
  });
});
