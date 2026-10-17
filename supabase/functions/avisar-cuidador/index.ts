// Edge Function: avisar-cuidador
// Called every 5 minutes by pg_cron (see supabase/cron.sql). Emails the caregiver when a dose
// in "doses_pendentes" is still unconfirmed 30 minutes after its time, using Brevo. If the dose
// only reached the server after its time, the 30 minutes count from its arrival instead
// (column referencia_aviso), so the patient always gets a chance to confirm first.
// The app keeps that table in sync (src/services/supabase.ts → sincronizarDosesNuvem).
// Secrets required:
//   BREVO_API_KEY    Brevo → SMTP & API → API Keys
//   BREVO_REMETENTE  sender address verified in Brevo (e.g. a Gmail)
//   CRON_SECRET      shared with the pg_cron job, so nobody else can trigger the emails

import { createClient } from 'npm:@supabase/supabase-js@2';

const MINUTOS_SEM_CONFIRMACAO = 30;
// Older doses are not alerted anymore (e.g. the job was paused): the alert would be useless
const HORAS_MAXIMAS_ATRASO = 12;
// Doses that were never confirmed stay in the table; drop them after this
const DIAS_PARA_LIMPEZA = 2;
// Times in the email are shown in Brasília time
const FUSO = 'America/Sao_Paulo';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const escaparHtml = (texto: string) =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface DosePendente {
  usuario_id: string;
  dose_id: string;
  medicamento_nome: string;
  dosagem: string | null;
  previsto_para: string;
}

interface Perfil {
  id: string;
  nome: string | null;
  nome_cuidador: string | null;
  email_cuidador: string | null;
  avisar_cuidador: boolean | null;
}

const montarEmail = (perfil: Perfil, doses: DosePendente[]) => {
  const paciente = perfil.nome?.trim() || 'A pessoa que você acompanha';
  const saudacao = perfil.nome_cuidador?.trim() ? `Olá, ${perfil.nome_cuidador.trim()}!` : 'Olá!';
  const linhas = doses.map((d) => {
    const hora = new Date(d.previsto_para).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: FUSO,
    });
    return `${d.medicamento_nome}${d.dosagem ? ` (${d.dosagem})` : ''} — ${hora}`;
  });

  // "Not confirmed" instead of "not taken": the dose may have been taken with the phone offline
  const assunto = `DoseCerta: ${paciente} ainda não confirmou ${doses.length > 1 ? 'alguns remédios' : 'um remédio'}`;
  const texto = [
    saudacao,
    '',
    `${paciente} ainda não confirmou no DoseCerta ${doses.length > 1 ? 'estes remédios' : 'este remédio'}:`,
    ...linhas.map((l) => `• ${l}`),
    '',
    'Pode ser só esquecimento de marcar no aplicativo ou o celular estar sem internet.',
    'Se puder, entre em contato para conferir.',
    '',
    'Você recebe este aviso porque foi cadastrado como cuidador no aplicativo DoseCerta.',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 16px; color: #1E293B; line-height: 1.5;">
      <p>${escaparHtml(saudacao)}</p>
      <p><strong>${escaparHtml(paciente)}</strong> ainda não confirmou no DoseCerta
        ${doses.length > 1 ? 'estes remédios' : 'este remédio'}:</p>
      <ul>${linhas.map((l) => `<li>${escaparHtml(l)}</li>`).join('')}</ul>
      <p>Pode ser só esquecimento de marcar no aplicativo ou o celular estar sem internet.
        Se puder, entre em contato para conferir.</p>
      <p style="font-size: 13px; color: #64748B;">Você recebe este aviso porque foi cadastrado como
        cuidador no aplicativo DoseCerta.</p>
    </div>`;

  return { assunto, texto, html };
};

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'Não autorizado' }, 401);
  }

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  const remetente = Deno.env.get('BREVO_REMETENTE');
  if (!brevoKey || !remetente) {
    console.error('BREVO_API_KEY ou BREVO_REMETENTE não configurados');
    return json({ error: 'Envio de email não configurado' }, 500);
  }

  // Service role: reads every user's doses (the table has RLS for the app)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const agora = Date.now();
  const limite = new Date(agora - MINUTOS_SEM_CONFIRMACAO * 60_000).toISOString();
  const maisAntiga = new Date(agora - HORAS_MAXIMAS_ATRASO * 3_600_000).toISOString();

  await supabase
    .from('doses_pendentes')
    .delete()
    .lt('previsto_para', new Date(agora - DIAS_PARA_LIMPEZA * 86_400_000).toISOString());

  // Claim the late doses first (aviso_enviado_em still empty) so an overlapping run can't send twice
  const marcadoEm = new Date(agora).toISOString();
  const { data: atrasadas, error: erroDoses } = await supabase
    .from('doses_pendentes')
    .update({ aviso_enviado_em: marcadoEm })
    .is('aviso_enviado_em', null)
    .lte('referencia_aviso', limite)
    .gte('previsto_para', maisAntiga)
    .select('usuario_id, dose_id, medicamento_nome, dosagem, previsto_para');

  if (erroDoses) {
    console.error('Erro ao buscar doses atrasadas:', erroDoses);
    return json({ error: 'Erro ao buscar doses' }, 500);
  }
  if (!atrasadas || atrasadas.length === 0) {
    return json({ enviados: 0 });
  }

  const porUsuario = new Map<string, DosePendente[]>();
  for (const d of atrasadas as DosePendente[]) {
    porUsuario.set(d.usuario_id, [...(porUsuario.get(d.usuario_id) ?? []), d]);
  }

  const { data: perfis, error: erroPerfis } = await supabase
    .from('perfil_usuario')
    .select('id, nome, nome_cuidador, email_cuidador, avisar_cuidador')
    .in('id', [...porUsuario.keys()]);

  if (erroPerfis) {
    console.error('Erro ao buscar perfis:', erroPerfis);
  }

  let enviados = 0;
  for (const [usuarioId, doses] of porUsuario) {
    const perfil = (perfis as Perfil[] | null)?.find((p) => p.id === usuarioId);
    // Alert off or no email: the doses stay marked, so they are not retried every 5 minutes
    if (!perfil || perfil.avisar_cuidador === false || !perfil.email_cuidador) continue;

    const { assunto, texto, html } = montarEmail(perfil, doses);
    const resposta = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'DoseCerta', email: remetente },
        to: [{ email: perfil.email_cuidador, name: perfil.nome_cuidador || undefined }],
        subject: assunto,
        textContent: texto,
        htmlContent: html,
      }),
    });

    if (resposta.ok) {
      enviados++;
    } else {
      console.error('Brevo respondeu com erro:', resposta.status, await resposta.text());
      // Release the doses so the next run tries again
      await supabase
        .from('doses_pendentes')
        .update({ aviso_enviado_em: null })
        .eq('usuario_id', usuarioId)
        .eq('aviso_enviado_em', marcadoEm);
    }
  }

  return json({ enviados });
});
