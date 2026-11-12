// Cloud backup arriving on a device (src/database/sqlite.ts → restaurarDadosDaNuvem), with rows
// shaped as Supabase returns them. Runs on the in-memory store, the same one the web version uses.
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.reject(new Error('sem SQLite nos testes'))),
}));

type Banco = typeof import('../src/database/sqlite');
let banco: Banco;

const USUARIO = '7b0f6c7e-0000-4000-8000-000000000001';

const nuvem = () => ({
  medicamentos: [
    {
      id: 'med-1',
      usuario_id: USUARIO,
      nome: 'Losartana 50 mg',
      forma_farmaceutica: 'Comprimido',
      cor: '#FFFFFF',
      foto_url: 'file:///data/user/0/app/files/fotos/med-1.jpg',
      foto_caminho: `${USUARIO}/med-1.jpg`,
      orientacoes_extras: null,
      criado_em: '2026-10-18T12:00:00+00:00',
    },
  ] as any[],
  horarios: [
    {
      usuario_id: USUARIO,
      id: 'hor-1',
      medicamento_id: 'med-1',
      dosagem: '1 comprimido',
      hora_programada: '08:00',
      dias_da_semana: 'TODOS',
      ativo: true,
      criado_em: '2026-10-18T12:00:00+00:00',
    },
  ] as any[],
  doses: [
    {
      usuario_id: USUARIO,
      id: 'dose-2026-10-19-hor-1',
      medicamento_id: 'med-1',
      horario_id: 'hor-1',
      data_hora_prevista: '2026-10-19T08:00:00',
      data_hora_realizada: '2026-10-19T11:05:00.000Z',
      status: 'TOMADO',
      observacao: null,
      atualizado_em: '2026-10-19T11:05:00+00:00',
    },
  ] as any[],
});

beforeEach(async () => {
  jest.resetModules();
  jest.useFakeTimers();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.setSystemTime(new Date(2026, 9, 20, 7)); // 20 Oct 2026, 07:00
  banco = require('../src/database/sqlite');
  await banco.initDatabase();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('restaurarDadosDaNuvem', () => {
  it('traz os remédios, os horários e as doses para um aparelho vazio', async () => {
    expect(await banco.restaurarDadosDaNuvem(nuvem())).toEqual(['med-1']);

    const meds = await banco.getMedicamentosAtivos();
    expect(meds.map((m) => m.nome)).toEqual(['Losartana 50 mg']);
    expect(meds[0].horarios).toEqual([{ dosagem: '1 comprimido', hora_programada: '08:00', dias_da_semana: 'TODOS' }]);

    const hoje = await banco.getDosesDoDia('2026-10-20');
    expect(hoje.map((d) => [d.medicamento_nome, d.hora_programada, d.status])).toEqual([
      ['Losartana 50 mg', '08:00', 'PENDENTE'],
    ]);
    const ontem = await banco.getDosesDoDia('2026-10-19');
    expect(ontem.map((d) => d.status)).toEqual(['TOMADO']);
  });

  it('buscar de novo sem novidades não avisa as telas nem duplica nada', async () => {
    await banco.restaurarDadosDaNuvem(nuvem());
    const ouvinte = jest.fn();
    banco.aoAlterarDoses(ouvinte);

    expect(await banco.restaurarDadosDaNuvem(nuvem())).toEqual([]);
    expect(ouvinte).not.toHaveBeenCalled();
    expect(await banco.getMedicamentosAtivos()).toHaveLength(1);
  });

  it('um remédio cadastrado depois em outro aparelho chega na busca seguinte', async () => {
    await banco.restaurarDadosDaNuvem(nuvem());
    const ouvinte = jest.fn();
    banco.aoAlterarDoses(ouvinte);

    const depois = nuvem();
    depois.medicamentos.push({ ...depois.medicamentos[0], id: 'med-2', nome: 'Metformina', foto_url: null, foto_caminho: null, criado_em: '2026-10-20T09:00:00+00:00' });
    depois.horarios.push({ ...depois.horarios[0], id: 'hor-2', medicamento_id: 'med-2', hora_programada: '20:00', criado_em: '2026-10-20T09:00:00+00:00' });

    expect(await banco.restaurarDadosDaNuvem(depois)).toEqual(['med-2']);
    expect(ouvinte).toHaveBeenCalled();
    expect((await banco.getMedicamentosAtivos()).map((m) => m.nome)).toEqual(['Losartana 50 mg', 'Metformina']);
  });
});
