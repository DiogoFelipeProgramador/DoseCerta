# DoseCerta 💊

Aplicativo mobile de Saúde Digital (**mHealth**) em **React Native + Expo + TypeScript**, focado na gestão segura, pontual e clara de medicamentos para idosos e pacientes com doenças crônicas.

📘 Documentação do projeto (GitBook): https://projeto-a3-usabilidade-desenvolv.gitbook.io/dosecerta

---

## 📱 Telas

Navegação por abas: **Início · Histórico · Novo · Cuidador · Perfil**.

1. **Boas-vindas (Onboarding)**
   - Apresentação da marca e dos 3 pilares: **Pontualidade 🕒**, **Segurança 🛡️** e **Clareza 💚**.
   - Botão de ação em destaque *"Começar ➔"*.

2. **Início**
   - Saudação com o nome do usuário (*"Olá, Maria! Vamos cuidar de sua saúde hoje."*).
   - Card **"Próximo medicamento"** com ilustração do remédio (forma e cor), dose e horário:
     - **Confirmar dose**: registra como tomada no SQLite, com opção **Desfazer**.
     - **Soneca**: adia o lembrete em 15 minutos.
   - Lista **"Hoje"** com o status de cada dose (*Tomado*, *Pendente*, *Atrasado*, *Pulado*), que pode ser corrigido com um toque.

3. **Cadastrar remédio (aba Novo)**: assistente em 4 etapas (**Remédio → Quando → Dicas → Conferir**)
   - Nome, forma (*Comprimido, Cápsula, Gotas, Xarope, Injeção, Pomada, Outro*) e cor da pílula (*Branco, Azul claro, Rosa, Amarelo, Azul escuro, Verde*).
   - Quantidade por dose ajustada à forma (½ comprimido, gotas, ml de xarope, unidades de insulina…).
   - Vários horários por dia e escolha de dias da semana (*Todos os dias* ou *Só alguns dias*).
   - Orientações rápidas (*em jejum, com alimentos…*) ou texto livre.
   - Foto opcional da caixa do remédio pela câmera.
   - Aviso antes de sair sem salvar.

4. **Meus remédios**: lista dos remédios cadastrados com horários e dias, e opção de remover.

5. **Hora do remédio** (tela cheia): abre ao tocar no lembrete ou quando ele chega com o app aberto, com os botões **Tomei** e **Adiar**.

6. **Histórico**
   - Navegação por mês.
   - Resumo: **Tomadas**, **Atrasadas** e **Puladas**.
   - Linha do tempo diária com cores e ícones de status, com opção de desfazer alterações.

7. **Cuidador**
   - Cadastro de nome, telefone e e-mail do cuidador ou familiar.
   - Ligação com 1 toque e mensagem pelo WhatsApp.
   - **Aviso automático por e-mail** quando uma dose fica 30 minutos sem confirmação (veja [Aviso ao cuidador](#-aviso-ao-cuidador)). Só fica disponível com conta conectada, com um atalho para entrar na conta.
   - Atalho para o **Relatório** de adesão.

8. **Relatório**: resumo de adesão para levar à consulta (7 dias, 30 dias ou 3 meses), que pode ser compartilhado pelo celular.

9. **Assistente de IA**
   - Banner de segurança fixo: *"Esta orientação não substitui a consulta médica."*
   - Respostas do **Google Gemini** por meio de uma Supabase Edge Function. Sem internet ou sem Supabase configurado, responde com uma base offline de dúvidas comuns (esqueci a dose, jejum, leite, sono, termos da bula).

10. **Perfil & Acessibilidade**
    - Tamanho do texto: **Normal**, **Grande** e **Maior**.
    - Modo de **alto contraste**.
    - Conta opcional (e-mail e senha) via **Supabase**, que libera a cópia de segurança na nuvem e o aviso ao cuidador. O app funciona sem conta, e o login fica salvo entre aberturas do app.
    - Ajustes de lembretes no Android: teste de aviso, som e "Não perturbe", bateria e alarmes no horário exato.

---

## ⏰ Lembretes

- Cada horário vira uma notificação local agendada para os próximos 7 dias. A agenda é refeita sempre que o app volta para a tela (`sincronizarLembretes()`).
- A notificação tem os botões **Tomei** e **Adiar 15 min**.
- Sem resposta, o aviso toca de novo a cada 2 minutos, até 6 vezes.
- No Android usa um canal de alarme com som próprio (`assets/sounds/`), gerado por `scripts/gerar-alarme.js`.

> Lembretes não funcionam no **Expo Go** (SDK 53+). É preciso instalar o app (APK ou development build).

---

## 📧 Aviso ao cuidador

Se o paciente não confirmar uma dose em até 30 minutos, o cuidador recebe um e-mail. Quem envia é o **servidor**, porque o app pode estar fechado nessa hora:

```
App (celular) ──doses dos próximos 7 dias──▶ Supabase (tabela doses_pendentes)
                                                    │
                          pg_cron, a cada 5 minutos ▼
                              Edge Function avisar-cuidador ──Brevo──▶ e-mail do cuidador
```

1. O app mantém a tabela `doses_pendentes` igual à agenda de lembretes dos próximos 7 dias (`sincronizarDosesNuvem()`, em `src/services/supabase.ts`). Dose tomada, pulada ou de remédio removido sai da tabela.
2. A cada 5 minutos, o `pg_cron` chama a Edge Function `avisar-cuidador`.
3. A função procura doses que continuam na tabela 30 minutos depois do horário, envia um único e-mail por paciente (agrupando os remédios) e marca as doses como avisadas, para não repetir.

**Regras:**
- Só funciona com **conta conectada**, aviso ligado e e-mail do cuidador preenchido. Sem isso, nenhuma dose é enviada ao servidor, e as que estavam lá são apagadas (o mesmo acontece ao sair da conta).
- Se a dose só chegou ao servidor **depois** do horário (celular sem internet ou aviso recém-ligado), os 30 minutos contam a partir da chegada. Assim o paciente sempre tem tempo de confirmar antes do aviso.
- Doses atrasadas há mais de 12 horas não geram aviso, e as que ficaram na tabela são apagadas depois de 2 dias.

**Limitações conhecidas:**
- Se o paciente marcar a dose **sem internet**, o servidor não fica sabendo e o cuidador recebe o aviso. Por isso o e-mail diz *"ainda não confirmou"* e lembra que o celular pode estar offline.
- O remetente é um Gmail verificado no Brevo (plano gratuito), então o e-mail pode cair no **spam**. Um domínio próprio resolveria.

---

## 🧭 Heurísticas de Usabilidade (Jakob Nielsen) aplicadas

1. **Visibilidade do status do sistema:** a tela inicial destaca o próximo remédio e o status das doses do dia. Cada ação mostra uma mensagem de confirmação.
2. **Correspondência com o mundo real:** ícones de comprimido, gotas e xarope, quantidades em linguagem do dia a dia (*"½ comprimido"*, *"5 ml = 1 colher de chá"*) e nenhum jargão médico.
3. **Controle e liberdade do usuário:** **Soneca**/**Adiar**, **Desfazer** após confirmar ou alterar uma dose e aviso antes de descartar um cadastro.
4. **Consistência e padrões:** botões grandes (mínimo de 56 px), paleta uniforme e navegação por abas fixa.
5. **Prevenção de erros:** assistente de cadastro em etapas com revisão final, validação do telefone e do e-mail do cuidador, aviso legal fixo no chat com a IA e o aviso ao cuidador desabilitado (com a explicação) quando não há conta conectada.
6. **Reconhecimento em vez de memorização:** a cor e a forma reais do remédio aparecem nos cards, na lista e no histórico.
7. **Design estético e minimalista:** cada tela mostra só o essencial (o que tomar, quanto e quando).
8. **Ajuda e documentação:** assistente integrado que explica termos de bula com palavras simples.

---

## 🛠️ Tecnologias

- **Frontend:** React Native 0.86, **Expo SDK 57**, TypeScript, React Navigation 7.
- **Armazenamento local:** SQLite via `expo-sqlite` (local-first, sem login obrigatório).
- **Nuvem (opcional):** Supabase (Auth com sessão salva no `AsyncStorage` + tabelas `perfil_usuario`, `medicamentos` e `doses_pendentes`, todas com RLS).
- **IA generativa:** Google Gemini (`gemini-3.8-flash`) via Supabase Edge Function. A chave nunca fica dentro do app.
- **Aviso ao cuidador:** Edge Function agendada com `pg_cron` + `pg_net`, e envio de e-mail pela API do **Brevo**.
- **Notificações:** `expo-notifications` (lembretes locais com ações e canal de alarme no Android).
- **Outros:** `expo-image-picker` (foto da caixa), `expo-haptics` (feedback tátil), `react-native-svg` (ilustrações dos remédios).

### Estrutura

```
src/
  components/   botões, banners, ilustração da pílula, feedback (toasts e diálogos)
  database/     sqlite.ts: tabelas, doses do dia e histórico
  navigation/   pilha principal + abas
  screens/      telas do app
  services/     notificações, Supabase, assistente de IA, ajustes do Android
  theme/        cores, alto contraste e escala de texto
supabase/
  functions/assistente-ia/    Edge Function que conversa com o Gemini
  functions/avisar-cuidador/  Edge Function que envia o e-mail ao cuidador
  functions/deno.json         configuração do Deno (só para o editor e o `deno check`)
  schema.sql                  tabelas e políticas (RLS)
  cron.sql                    modelo da tarefa agendada (pg_cron) do aviso ao cuidador
scripts/gerar-alarme.js      gera os sons de alarme em WAV
```

---

## 🚀 Como executar

### Pré-requisitos

- [Node.js](https://nodejs.org) LTS (inclui o `npm` e o `npx`).
- Celular com o app **Expo Go** (para testar rápido) ou um APK instalado (necessário para os lembretes, veja [Lembretes](#-lembretes)).
- Para gerar o APK: uma conta gratuita na [Expo](https://expo.dev).
- Opcional, só para editar as Edge Functions: [Deno](https://deno.com) e a extensão **Deno** do VS Code (já configurada em `.vscode/settings.json`).

```bash
# 1. Instalar dependências
npm install

# 2. Configurar o Supabase (obrigatório): copie o modelo e preencha URL e chave pública
cp .env.example .env          # macOS / Linux / Git Bash
copy .env.example .env        # PowerShell / Prompt do Windows

# 3. Iniciar o servidor Expo e ler o QR code com o Expo Go
npm start
```

Sem `.env` o app para logo ao abrir, em desenvolvimento, com uma mensagem dizendo o que falta. Depois de mudar o `.env`, reinicie limpando o cache: `npx expo start -c`.

### Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) e rode `supabase/schema.sql` no **SQL Editor**. Pode rodar de novo a cada atualização, porque ele só cria o que ainda não existe.
2. Em **Authentication → Sign In / Providers → Email**, desligue o **Confirm email** para testes. Com ele ligado, o link do e-mail leva para `localhost`, a menos que a **Site URL** seja configurada.
3. Coloque a URL e a chave pública (anon ou publishable) no `.env`.
4. Publique o assistente de IA. A chave do Gemini é gerada em [Google AI Studio](https://aistudio.google.com) → **Get API key**, e `SEU-PROJETO` é a parte antes de `.supabase.co` na URL:

   ```bash
   npx supabase login
   npx supabase link --project-ref SEU-PROJETO
   npx supabase secrets set GEMINI_API_KEY=sua-chave
   npx supabase functions deploy assistente-ia --no-verify-jwt
   ```

   O `--no-verify-jwt` é necessário com chaves **publishable** (`sb_publishable_...`), que não são JWT.

5. Publique o aviso ao cuidador:
   1. Crie uma conta gratuita no [Brevo](https://www.brevo.com), verifique o e-mail remetente em **Senders** e gere uma chave em **SMTP & API → API Keys**. Use a chave que começa com `xkeysib-`, não a SMTP (`xsmtpsib-`).
   2. Configure os secrets e publique a função. O `CRON_SECRET` é uma senha aleatória que você inventa:

      ```bash
      npx supabase secrets set BREVO_API_KEY=xkeysib-... BREVO_REMETENTE=seu-remetente@gmail.com CRON_SECRET=uma-senha-aleatoria
      npx supabase functions deploy avisar-cuidador --no-verify-jwt
      ```

   3. Copie `supabase/cron.sql`, troque `SEU-PROJETO` e `SEU_CRON_SECRET` pelos valores reais e rode no **SQL Editor**. Não faça commit da versão preenchida.

### Gerar o APK (Android)

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

Ao terminar, o EAS mostra um link para baixar o `.apk`.

Se usar Supabase, cadastre as variáveis também no EAS **antes** do build, porque o `.env` não é enviado (está no `.gitignore`):

```bash
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://SEU-PROJETO.supabase.co --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value sua-chave-publica --visibility plaintext
```

Essas duas variáveis são públicas por natureza (ficam dentro do app) e quem protege os dados é o RLS. Nunca coloque nelas a chave secreta (`service_role` / `sb_secret_...`) nem as chaves do Gemini ou do Brevo.

---

## 🚧 Próximos passos

- Marcar doses como **Atrasado** automaticamente.
- **Editar** um remédio já cadastrado.
- Sincronizar também o histórico de doses com a nuvem e restaurar os dados ao trocar de celular.
- Aviso ao cuidador por **WhatsApp Business** ou **SMS** (ficaram de fora pelo custo e pela verificação da empresa na Meta).
- **Domínio próprio** para o e-mail do aviso não cair no spam.
- E-mail de **"tudo certo"** quando o paciente confirmar uma dose depois de o cuidador já ter sido avisado.
- Exigir login no assistente de IA e limitar perguntas por usuário, para proteger a cota do Gemini.

---

> ⚠️ O DoseCerta é um apoio à rotina e **não substitui orientação médica**.
