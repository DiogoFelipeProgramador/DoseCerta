// AI Assistant Service for DoseCerta.
// Questions go to the Supabase Edge Function "assistente-ia", which holds the Gemini API key
// server-side (see supabase/functions/assistente-ia). Falls back to offline answers when
// Supabase isn't configured or the call fails (e.g. no internet).
import { supabase } from './supabase';

// Offline knowledge base fallback matching mockups and common geriatric questions
const OFFLINE_KNOWLEDGE: Record<string, string> = {
  leite: "Em geral, o Losartana e a maioria dos remédios comuns de pressão não possuem interação prejudicial com leite. Contudo, alguns antibióticos e remédios para tireoide não devem ser tomados com leite. Na dúvida, tome sempre com um bom copo de água pura.",
  sono: "Medicamentos como Losartana e Metformina geralmente não causam sonolência. Já calmantes, antialérgicos e relaxantes musculares podem dar sono. Se sentir tontura ou sonolência excessiva, sente-se devagar e avise seu médico.",
  esqueci: "Se você esqueceu de tomar o remédio, tome assim que lembrar. Porém, se já estiver quase na hora da próxima dose, pule a dose esquecida e siga o horário normal. NUNCA tome duas doses juntas para compensar!",
  jejum: "Tomar 'em jejum' significa tomar o remédio logo ao acordar, com água, cerca de 30 a 60 minutos antes de tomar o café da manhã. Remédios como Omeprazol funcionam melhor assim.",
  posologia: "'Posologia' é apenas o nome que os médicos dão para a receita de horários e a quantidade certa de comprimidos que você deve tomar.",
  horario: "Manter o horário fixo todos os dias ajuda o remédio a fazer o efeito perfeito no seu corpo sem oscilações na pressão ou na glicose.",
};

export const consultarAssistenteIA = async (
  pergunta: string,
  historicoMensagens: Array<{ remetente: 'usuario' | 'ia'; texto: string }> = []
): Promise<string> => {
  if (supabase) {
    try {
      const { data, error } = await supabase.functions.invoke<{ resposta?: string }>('assistente-ia', {
        body: { pergunta, historico: historicoMensagens },
      });
      if (error) throw error;
      if (data?.resposta) {
        return data.resposta;
      }
    } catch (error) {
      console.warn('Erro ao consultar o assistente online, usando respostas offline:', error);
    }
  }

  // Fallback / Offline heuristic response matching queries
  const perguntaLower = pergunta.toLowerCase();

  if (perguntaLower.includes('leite') || perguntaLower.includes('tomar esse remédio com leite')) {
    return OFFLINE_KNOWLEDGE.leite;
  }
  if (perguntaLower.includes('sono') || perguntaLower.includes('dá sono') || perguntaLower.includes('sonolência')) {
    return OFFLINE_KNOWLEDGE.sono;
  }
  if (perguntaLower.includes('esqueci') || perguntaLower.includes('atrasei') || perguntaLower.includes('não tomei')) {
    return OFFLINE_KNOWLEDGE.esqueci;
  }
  if (perguntaLower.includes('jejum') || perguntaLower.includes('antes de comer')) {
    return OFFLINE_KNOWLEDGE.jejum;
  }
  if (perguntaLower.includes('posologia') || perguntaLower.includes('termo') || perguntaLower.includes('significa')) {
    return OFFLINE_KNOWLEDGE.posologia;
  }

  // Default reassuring response for general inquiries
  return `Para a sua segurança com "${pergunta}": recomendamos sempre tomar seus medicamentos com água em temperatura ambiente e nos horários regulares indicados na sua receita. Se estiver sentindo qualquer mal-estar ou dúvida sobre interações com outros remédios, entre em contato com seu médico ou farmacêutico.`;
};
