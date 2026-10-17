// Edge Function: assistente-ia
// Proxies the DoseCerta chat to Google Gemini so the API key never ships inside the app.
// Secret required: GEMINI_API_KEY  (supabase secrets set GEMINI_API_KEY=...)

const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_PERGUNTA_CHARS = 1000;
const MAX_HISTORICO = 10;

const SYSTEM_PROMPT = `
Você é o assistente virtual do aplicativo "DoseCerta", especialista em saúde digital e apoio ao uso seguro de medicamentos para idosos e seus cuidadores.
Suas diretrizes fundamentais:
1. Clareza e Simplicidade: Use frases curtas, vocabulário direto e NENHUM jargão médico complicado sem explicar em português claro.
2. Segurança Máxima: Nunca altere dosagens nem diagnostique doenças. Sempre recomende consultar o médico ou farmacêutico em caso de dúvidas sobre prescrição.
3. Respostas Curtas e Acolhedoras: Responda em no máximo 2 a 3 parágrafos curtos para facilitar a leitura em telas de celular por pessoas idosas.
4. Tradução de Bulas: Quando perguntado sobre termos técnicos (ex: posologia, contraindicação, interação medicamentosa), explique de maneira simples e prática.
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

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
        }),
      }
    );

    if (!response.ok) {
      console.error('Gemini respondeu com erro:', response.status, await response.text());
      return json({ error: 'Falha ao consultar o assistente' }, 502);
    }

    const data = await response.json();
    const resposta: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resposta) {
      return json({ error: 'Resposta vazia do assistente' }, 502);
    }

    return json({ resposta: resposta.trim() });
  } catch (err) {
    console.error('Erro ao chamar o Gemini:', err);
    return json({ error: 'Falha ao consultar o assistente' }, 502);
  }
});
