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
   - Cadastro de nome e telefone do cuidador ou familiar.
   - Ligação com 1 toque e mensagem pelo WhatsApp.
   - Atalho para o **Relatório** de adesão.

8. **Relatório**: resumo de adesão para levar à consulta (7 dias, 30 dias ou 3 meses), que pode ser compartilhado pelo celular.

9. **Assistente de IA**
   - Banner de segurança fixo: *"Esta orientação não substitui a consulta médica."*
   - Respostas do **Google Gemini** por meio de uma Supabase Edge Function. Sem internet ou sem Supabase configurado, responde com uma base offline de dúvidas comuns (esqueci a dose, jejum, leite, sono, termos da bula).

10. **Perfil & Acessibilidade**
    - Tamanho do texto: **Normal**, **Grande** e **Maior**.
    - Modo de **alto contraste**.
    - Conta opcional (e-mail e senha) para cópia de segurança na nuvem via **Supabase**. O app funciona sem conta.
    - Ajustes de lembretes no Android: teste de aviso, som e "Não perturbe", bateria e alarmes no horário exato.

---

## ⏰ Lembretes

- Cada horário vira uma notificação local agendada para os próximos 7 dias. A agenda é refeita sempre que o app volta para a tela (`sincronizarLembretes()`).
- A notificação tem os botões **Tomei** e **Adiar 15 min**.
- Sem resposta, o aviso toca de novo a cada 2 minutos, até 6 vezes.
- No Android usa um canal de alarme com som próprio (`assets/sounds/`), gerado por `scripts/gerar-alarme.js`.

> Lembretes não funcionam no **Expo Go** (SDK 53+). É preciso instalar o app (APK ou development build).

---

## 🧭 Heurísticas de Usabilidade (Jakob Nielsen) aplicadas

1. **Visibilidade do status do sistema:** a tela inicial destaca o próximo remédio e o status das doses do dia. Cada ação mostra uma mensagem de confirmação.
2. **Correspondência com o mundo real:** ícones de comprimido, gotas e xarope, quantidades em linguagem do dia a dia (*"½ comprimido"*, *"5 ml = 1 colher de chá"*) e nenhum jargão médico.
3. **Controle e liberdade do usuário:** **Soneca**/**Adiar**, **Desfazer** após confirmar ou alterar uma dose e aviso antes de descartar um cadastro.
4. **Consistência e padrões:** botões grandes (mínimo de 56 px), paleta uniforme e navegação por abas fixa.
5. **Prevenção de erros:** assistente de cadastro em etapas com revisão final, validação do telefone do cuidador, e aviso legal fixo no chat com a IA.
6. **Reconhecimento em vez de memorização:** a cor e a forma reais do remédio aparecem nos cards, na lista e no histórico.
7. **Design estético e minimalista:** cada tela mostra só o essencial (o que tomar, quanto e quando).
8. **Ajuda e documentação:** assistente integrado que explica termos de bula com palavras simples.

---

## 🛠️ Tecnologias

- **Frontend:** React Native 0.86, **Expo SDK 57**, TypeScript, React Navigation 7.
- **Armazenamento local:** SQLite via `expo-sqlite` (local-first, sem login obrigatório).
- **Nuvem (opcional):** Supabase (Auth + tabelas `perfil_usuario` e `medicamentos`).
- **IA generativa:** Google Gemini (`gemini-2.5-flash`) via Supabase Edge Function. A chave nunca fica dentro do app.
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
  functions/assistente-ia/   Edge Function que conversa com o Gemini
  schema.sql                 tabelas e políticas (RLS) da cópia de segurança
scripts/gerar-alarme.js      gera os sons de alarme em WAV
```

---

## 🚀 Como executar

```bash
# 1. Instalar dependências
npm install

# 2. (Opcional) Configurar o Supabase
cp .env.example .env   # e preencha URL e chave anon

# 3. Iniciar o servidor Expo
npm start
```

Sem `.env` o app roda normalmente, mas sem conta na nuvem e com o assistente em modo offline.

### Configurar o Supabase (opcional)

1. Crie um projeto em [supabase.com](https://supabase.com) e rode `supabase/schema.sql` no **SQL Editor**.
2. Coloque a URL e a chave anon no `.env`.
3. Publique o assistente de IA:

   ```bash
   supabase login
   supabase link --project-ref SEU-PROJETO
   supabase secrets set GEMINI_API_KEY=sua-chave
   supabase functions deploy assistente-ia
   ```

### Gerar o APK (Android)

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

Ao terminar, o EAS mostra um link para baixar o `.apk`. Se usar Supabase, cadastre as variáveis `EXPO_PUBLIC_*` também no ambiente **preview** do EAS (`eas env:create`), porque o `.env` não é enviado para o build.

---

## 🚧 Próximos passos

- Marcar doses como **Atrasado** automaticamente.
- **Editar** um remédio já cadastrado.
- Manter a sessão do Supabase salva entre aberturas do app.
- Sincronizar também o histórico de doses com a nuvem.

---

> ⚠️ O DoseCerta é um apoio à rotina e **não substitui orientação médica**.
