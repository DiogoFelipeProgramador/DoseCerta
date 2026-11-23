// Offline answers of the AI assistant (no internet / Supabase unavailable)
jest.mock('../src/services/supabase', () => ({ supabase: null }));

import { consultarAssistenteIA } from '../src/services/ai';

describe('assistente de IA sem internet', () => {
  it.each([
    'Estou com dor no peito depois do remédio',
    'Sinto falta de ar',
    'Minha mãe desmaiou',
    'Tomei a mais por engano, o que faço?',
  ])('em "%s", interrompe e orienta a procurar emergência', async (pergunta) => {
    const resposta = await consultarAssistenteIA(pergunta);
    expect(resposta).toMatch(/pronto-socorro/);
    expect(resposta).toMatch(/192/);
  });

  it('informa o Disque-Intoxicação quando a pessoa tomou dose a mais', async () => {
    expect(await consultarAssistenteIA('tomei duas vezes o mesmo comprimido')).toMatch(/0800 722 6001/);
  });

  it('responde dúvidas comuns sem orientar emergência', async () => {
    const resposta = await consultarAssistenteIA('Posso tomar esse remédio com leite?');
    expect(resposta).toMatch(/leite/);
    expect(resposta).not.toMatch(/192/);
  });

  it('em dose esquecida, alerta para nunca tomar duas doses juntas', async () => {
    expect(await consultarAssistenteIA('Esqueci de tomar de manhã')).toMatch(/NUNCA tome duas doses/);
  });

  it('em perguntas desconhecidas, recomenda falar com médico ou farmacêutico', async () => {
    expect(await consultarAssistenteIA('Qual a melhor marca?')).toMatch(/médico ou farmacêutico/);
  });
});
