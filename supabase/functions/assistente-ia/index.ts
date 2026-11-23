// Edge Function: assistente-ia
// Proxies the DoseCerta chat to Google Gemini so the API key never ships inside the app.
// Secret required: GEMINI_API_KEY  (supabase secrets set GEMINI_API_KEY=...)
// Optional secret: GEMINI_MODELO_RESERVA, a lighter model tried when the main one is busy or slow.
// If both fail, the app falls back to its offline answers.

const GEMINI_MODEL = 'gemini-3.8-flash';
const MAX_PERGUNTA_CHARS = 1000;
const MAX_HISTORICO = 10;
// Past this, an elderly user thinks the app froze: give up on the model and try the next one
const TIMEOUT_MS = 9000;
// Gemini answers 503 ("high demand") or 429 during spikes; switching model works better than waiting
const STATUS_TEMPORARIOS = [429, 500, 503, 504];

const SYSTEM_PROMPT = `
Você é o assistente virtual do aplicativo "DoseCerta", especialista em saúde digital e apoio ao uso seguro de medicamentos para idosos e seus cuidadores.
Suas diretrizes fundamentais:
1. Clareza e Simplicidade: Use frases curtas, vocabulário direto e NENHUM jargão médico complicado sem explicar em português claro.
2. Segurança Máxima: Nunca altere dosagens nem diagnostique doenças. Sempre recomende consultar o médico ou farmacêutico em caso de dúvidas sobre prescrição.
3. Respostas Curtas e Acolhedoras: Responda em no máximo 2 a 3 parágrafos curtos para facilitar a leitura em telas de celular por pessoas idosas.
4. Tradução de Bulas: Quando perguntado sobre termos técnicos (ex: posologia, contraindicação, interação medicamentosa), explique de maneira simples e prática.
5. Texto Simples: Escreva apenas texto corrido, sem formatação Markdown (nada de asteriscos, negrito, títulos ou listas com marcadores), pois o aplicativo mostra o texto exatamente como ele chega.
6. Sinais de Emergência: Se a pessoa relatar sintomas graves ou uma situação de risco (por exemplo: dor ou aperto no peito, falta de ar, desmaio, confusão súbita, fraqueza ou formigamento de um lado do corpo, fala enrolada, inchaço no rosto, na boca ou na garganta, convulsão, sangramento forte, ou ter tomado remédio a mais ou por engano), NÃO dê outras orientações sobre o remédio. Responda apenas, de forma curta e calma, que ela deve procurar um pronto-socorro agora ou ligar para o SAMU (192), e, se possível, avisar alguém da família ou o cuidador. Em caso de intoxicação ou dose a mais, informe também o Disque-Intoxicação da Anvisa (0800 722 6001).
`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface MensagemHistorico {
  remetente: 'usuario' | 'ia';
  texto: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido' }, 405);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('GEMINI_API_KEY não configurada');
    return json({ error: 'Assistente indisponível no momento' }, 500);
  }

  let pergunta: string;
  let historico: MensagemHistorico[];
  try {
    const body = await req.json();
    pergunta = typeof body?.pergunta === 'string' ? body.pergunta.trim() : '';
    historico = Array.isArray(body?.historico) ? body.historico : [];
  } catch {
    return json({ error: 'Corpo da requisição inválido' }, 400);
  }

  if (!pergunta) {
    return json({ error: 'Pergunta vazia' }, 400);
  }
  if (pergunta.length > MAX_PERGUNTA_CHARS) {
    return json({ error: 'Pergunta muito longa' }, 400);
  }

  const contents = [
    ...historico
      .filter((m) => m && typeof m.texto === 'string' && (m.remetente === 'usuario' || m.remetente === 'ia'))
      .slice(-MAX_HISTORICO)
      .map((m) => ({
        role: m.remetente === 'usuario' ? 'user' : 'model',
        parts: [{ text: m.texto.slice(0, MAX_PERGUNTA_CHARS) }],
      })),
    { role: 'user', parts: [{ text: pergunta }] },
  ];

  const modeloReserva = Deno.env.get('GEMINI_MODELO_RESERVA')?.trim();
  const modelos = [GEMINI_MODEL, ...(modeloReserva ? [modeloReserva] : [])];

  for (const modelo of modelos) {
    const principal = modelo === GEMINI_MODEL;
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1024,
              // Thinking options differ between model families, so the backup model keeps its defaults
              ...(principal && { thinkingConfig: { thinkingLevel: 'low' } }),
            },
          }),
        }
      );

      if (!response.ok) {
        console.error(`Gemini (${modelo}) respondeu com erro:`, response.status, await response.text());
        // A non-temporary error (bad key, bad request) would fail on the backup model too
        if (!STATUS_TEMPORARIOS.includes(response.status)) break;
        continue;
      }

      const data = await response.json();
      const resposta: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!resposta) {
        console.error(`Gemini (${modelo}) devolveu resposta vazia`);
        continue;
      }

      if (!principal) console.warn(`Respondido pelo modelo reserva ${modelo}`);
      // The app shows plain text, so drop any Markdown emphasis the model still adds
      return json({ resposta: resposta.replace(/\*\*?([^*]+)\*\*?/g, '$1').trim() });
    } catch (err) {
      // TimeoutError when the model took longer than TIMEOUT_MS, otherwise a network failure
      console.error(`Erro ao chamar o Gemini (${modelo}):`, err);
    }
  }

  return json({ error: 'Falha ao consultar o assistente' }, 502);
});
