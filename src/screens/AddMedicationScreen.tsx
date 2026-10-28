import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme/themeContext';
import { NomeRemedio } from '../components/NomeRemedio';
import { useFeedback } from '../components/FeedbackProvider';
import { FormaFarmaceutica, CorMedicamento } from '../types';
import { StepIndicator } from '../components/StepIndicator';
import { CustomButton } from '../components/CustomButton';
import { PillGraphic } from '../components/PillGraphic';
import {
  cadastrarMedicamentoCompleto,
  atualizarMedicamentoCompleto,
  getMedicamentoParaEdicao,
  CODIGOS_DIAS,
} from '../database/sqlite';
import { triggerAutoSync } from '../services/supabase';
import { guardarFoto } from '../services/fotos';
import { DOSE_CONFIG, lerQuantidade, textoDose } from '../utils/dose';
import { Ionicons, MaterialCommunityIcons, Feather, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface AddMedicationScreenProps {
  navigation: any;
  route?: any; // params: { medicamentoId?: string } when opened from "Gerenciar medicamentos" to edit
}

const FORMAS: Array<{ forma: FormaFarmaceutica; icon: string; provider: 'mci' | 'ion' | 'fa5' }> = [
  { forma: 'Comprimido', icon: 'pill', provider: 'mci' },
  { forma: 'Cápsula', icon: 'capsules', provider: 'fa5' },
  { forma: 'Gotas', icon: 'water', provider: 'ion' },
  { forma: 'Xarope', icon: 'bottle-tonic-plus', provider: 'mci' },
  { forma: 'Injeção', icon: 'needle', provider: 'mci' },
  { forma: 'Pomada', icon: 'lotion-outline', provider: 'mci' },
  { forma: 'Outro', icon: 'dots-horizontal', provider: 'mci' },
];

// Only solid medicines have a color that helps to recognize them
const FORMAS_COM_COR: FormaFarmaceutica[] = ['Comprimido', 'Cápsula'];

const CORES: Array<{ cor: CorMedicamento; nome: string }> = [
  { cor: '#FFFFFF', nome: 'Branco' },
  { cor: '#93C5FD', nome: 'Azul claro' },
  { cor: '#FCA5A5', nome: 'Rosa' },
  { cor: '#FDE047', nome: 'Amarelo' },
  { cor: '#2563EB', nome: 'Azul escuro' },
  { cor: '#059669', nome: 'Verde' },
];

const HORARIOS_RAPIDOS = [
  { hora: '07:00', periodo: 'Manhã' },
  { hora: '08:00', periodo: 'Manhã' },
  { hora: '12:00', periodo: 'Almoço' },
  { hora: '14:00', periodo: 'Tarde' },
  { hora: '18:00', periodo: 'Tarde' },
  { hora: '20:00', periodo: 'Noite' },
  { hora: '22:00', periodo: 'Noite' },
];

const DIAS = [
  { codigo: 'DOM', curto: 'Dom', nome: 'Domingo' },
  { codigo: 'SEG', curto: 'Seg', nome: 'Segunda' },
  { codigo: 'TER', curto: 'Ter', nome: 'Terça' },
  { codigo: 'QUA', curto: 'Qua', nome: 'Quarta' },
  { codigo: 'QUI', curto: 'Qui', nome: 'Quinta' },
  { codigo: 'SEX', curto: 'Sex', nome: 'Sexta' },
  { codigo: 'SAB', curto: 'Sáb', nome: 'Sábado' },
];

const ORIENTACOES_SUGESTOES = [
  'Tomar em jejum',
  'Junto com as refeições',
  'Após o almoço',
  'Antes de dormir',
  'Com bastante água',
  'Evitar bebidas alcoólicas',
];

const pad2 = (n: number) => String(n).padStart(2, '0');

const textoDias = (dias: string[]) => {
  if (dias.length === 7) return 'Todos os dias';
  return DIAS.filter((d) => dias.includes(d.codigo))
    .map((d) => d.curto)
    .join(', ');
};

export const AddMedicationScreen: React.FC<AddMedicationScreenProps> = ({ navigation, route }) => {
  const { colors, typography, textScale } = useTheme();
  const { avisar, confirmar } = useFeedback();
  const empilharBotoes = textScale !== 'padrao';
  const medicamentoId = route?.params?.medicamentoId;
  const editando = Boolean(medicamentoId);

  const [step, setStep] = useState<number>(1);
  const [erro, setErro] = useState<string>('');
  // The error box can sit below the fold (e.g. at the end of step 2), so we scroll to it when it shows up
  const scrollRef = useRef<ScrollView>(null);
  const erroY = useRef(0);
  const rolarParaErro = useRef(false);

  // Step 1
  const [nome, setNome] = useState<string>('');
  const [forma, setForma] = useState<FormaFarmaceutica>('Comprimido');
  const [cor, setCor] = useState<string>('#FFFFFF');
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  // Step 2
  const [quantidade, setQuantidade] = useState<number>(1);
  const [dosagemLivre, setDosagemLivre] = useState<string>('');
  const [horarios, setHorarios] = useState<string[]>([]);
  // Custom time being edited. It is already selected while the user adjusts it.
  const [horarioEmEdicao, setHorarioEmEdicao] = useState<string | null>(null);
  const [todosOsDias, setTodosOsDias] = useState(true);
  const [diasEscolhidos, setDiasEscolhidos] = useState<string[]>([]);

  // Step 3
  const [dicasEscolhidas, setDicasEscolhidas] = useState<string[]>([]);
  const [outraOrientacao, setOutraOrientacao] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const doseCfg = DOSE_CONFIG[forma];
  const dosagem = doseCfg ? textoDose(quantidade, doseCfg) : dosagemLivre.trim();
  const diasSemana = todosOsDias ? 'TODOS' : CODIGOS_DIAS.filter((c) => diasEscolhidos.includes(c)).join(',');
  const orientacoes = [...dicasEscolhidas, outraOrientacao.trim()].filter(Boolean).join('. ');

  // Snapshot of the form as loaded, to know if the edit has unsaved changes
  const formulario = JSON.stringify({ nome: nome.trim(), forma, cor, fotoUrl, dosagem, horarios, diasSemana, orientacoes });
  const formularioInicial = useRef<string | null>(null);
  const [prontoParaEditar, setProntoParaEditar] = useState(!editando);

  // Edit: fill the wizard with the saved medication
  useEffect(() => {
    if (!medicamentoId) return;
    let ativo = true;
    (async () => {
      const med = await getMedicamentoParaEdicao(medicamentoId);
      if (!ativo) return;
      if (!med) {
        avisar({ mensagem: 'Este remédio não foi encontrado.', tipo: 'erro' });
        navigation.goBack();
        return;
      }
      const cfg = DOSE_CONFIG[med.forma_farmaceutica];
      const dosagemSalva = med.horarios[0]?.dosagem ?? '';
      const dias = med.horarios[0]?.dias_da_semana ?? 'TODOS';
      const partes = (med.orientacoes_extras ?? '').split('. ').filter(Boolean);
      setNome(med.nome);
      setForma(med.forma_farmaceutica);
      setCor(med.cor || '#FFFFFF');
      setFotoUrl(med.foto_url ?? null);
      if (cfg) setQuantidade(lerQuantidade(dosagemSalva, cfg) ?? cfg.padrao);
      else setDosagemLivre(dosagemSalva);
      setHorarios(med.horarios.map((h) => h.hora_programada).sort());
      setTodosOsDias(dias === 'TODOS');
      setDiasEscolhidos(dias === 'TODOS' ? [] : dias.split(','));
      setDicasEscolhidas(partes.filter((p) => ORIENTACOES_SUGESTOES.includes(p)));
      setOutraOrientacao(partes.filter((p) => !ORIENTACOES_SUGESTOES.includes(p)).join('. '));
      setProntoParaEditar(true);
    })();
    return () => {
      ativo = false;
    };
  }, [medicamentoId]);

  useEffect(() => {
    if (prontoParaEditar && formularioInicial.current === null) formularioInicial.current = formulario;
  }, [prontoParaEditar, formulario]);

  const haptic = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ---------- Step 1 handlers ----------
  const escolherForma = (f: FormaFarmaceutica) => {
    haptic();
    setForma(f);
    // Each kind has its own unit, so the amount restarts from a sensible default
    setQuantidade(DOSE_CONFIG[f]?.padrao ?? 1);
    if (!FORMAS_COM_COR.includes(f)) setCor('#FFFFFF');
  };

  const handlePickPhoto = async () => {
    try {
      // The OS permission dialog can't be restyled, so we explain WHY in our own words first
      // (asked only once) and, if it was blocked, offer a direct path to the phone settings.
      let permission = await ImagePicker.getCameraPermissionsAsync();

      if (!permission.granted && permission.canAskAgain) {
        const continuar = await confirmar({
          titulo: 'Tirar foto do remédio?',
          mensagem:
            'Para isso, o celular vai pedir permissão para usar a câmera. ' +
            'A foto fica guardada no seu celular (e na cópia de segurança, se você tiver conta) e ajuda a reconhecer o remédio na hora de tomar.',
          confirmarLabel: 'Continuar',
          cancelarLabel: 'Agora não',
        });
        if (!continuar) return;
        permission = await ImagePicker.requestCameraPermissionsAsync();
      }

      if (!permission.granted) {
        if (!permission.canAskAgain) {
          const abrirAjustes = await confirmar({
            titulo: 'A câmera está bloqueada',
            mensagem:
              'Para tirar a foto, abra os ajustes do celular, toque em "Permissões" e ligue a "Câmera" para o DoseCerta.',
            confirmarLabel: 'Abrir ajustes do celular',
            cancelarLabel: 'Agora não',
          });
          if (abrirAjustes) Linking.openSettings();
        } else {
          avisar({ mensagem: 'Sem a câmera, você pode cadastrar o remédio normalmente, só sem foto.', tipo: 'info' });
        }
        return;
      }

      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setFotoUrl(result.assets[0].uri);
      }
    } catch (e) {
      console.warn('Erro ao abrir câmera:', e);
    }
  };

  // ---------- Step 2 handlers ----------
  const alterarQuantidade = (delta: number) => {
    if (!doseCfg) return;
    haptic();
    setQuantidade((q) => Math.max(doseCfg.min, Math.round((q + delta * doseCfg.passo) * 10) / 10));
  };

  const alternarHorario = (hora: string) => {
    haptic();
    setErro('');
    setHorarios((atual) =>
      atual.includes(hora) ? atual.filter((h) => h !== hora) : [...atual, hora].sort()
    );
  };

  const paraTexto = (t: number) => `${pad2(Math.floor(t / 60) % 24)}:${pad2(t % 60)}`;

  // The custom time is a draft while being adjusted; it is only selected on "Pronto"
  const abrirOutroHorario = () => {
    haptic();
    setErro('');
    let minutos = 9 * 60;
    while (horarios.includes(paraTexto(minutos))) minutos += 5;
    setHorarioEmEdicao(paraTexto(minutos));
  };

  const ajustarHorarioEmEdicao = (deltaMinutos: number) => {
    if (!horarioEmEdicao) return;
    haptic();
    const [h, m] = horarioEmEdicao.split(':').map(Number);
    const inicial = h * 60 + m;
    let total = inicial;
    // Skip times that are already selected, so "Pronto" always adds a new one
    do {
      total = (((total + deltaMinutos) % 1440) + 1440) % 1440;
    } while (horarios.includes(paraTexto(total)) && total !== inicial);
    setHorarioEmEdicao(paraTexto(total));
  };

  const confirmarHorarioEmEdicao = () => {
    if (horarioEmEdicao && !horarios.includes(horarioEmEdicao)) {
      setHorarios([...horarios, horarioEmEdicao].sort());
    }
    setHorarioEmEdicao(null);
    setErro('');
    haptic();
  };

  const cancelarHorarioEmEdicao = () => setHorarioEmEdicao(null);

  const alternarDia = (codigo: string) => {
    haptic();
    setErro('');
    setDiasEscolhidos((atual) => (atual.includes(codigo) ? atual.filter((d) => d !== codigo) : [...atual, codigo]));
  };

  // ---------- Step 3 handlers ----------
  const alternarDica = (dica: string) => {
    haptic();
    setDicasEscolhidas((atual) => (atual.includes(dica) ? atual.filter((d) => d !== dica) : [...atual, dica]));
  };

  // ---------- Navigation ----------
  const limparFormulario = () => {
    setStep(1);
    setErro('');
    setNome('');
    setForma('Comprimido');
    setCor('#FFFFFF');
    setFotoUrl(null);
    setQuantidade(1);
    setDosagemLivre('');
    setHorarios([]);
    setHorarioEmEdicao(null);
    setTodosOsDias(true);
    setDiasEscolhidos([]);
    setDicasEscolhidas([]);
    setOutraOrientacao('');
  };

  // Errors are shown next to the field that needs fixing (Nielsen #9)
  const validarPasso = (): string => {
    if (step === 1 && !nome.trim()) return 'Digite o nome do remédio para continuar.';
    if (step === 2) {
      // Don't silently drop a time the user was adjusting
      if (horarioEmEdicao) return `Toque em "Pronto" para adicionar o horário ${horarioEmEdicao}, ou em "Cancelar".`;
      if (!dosagem) return 'Escreva quanto deve tomar de cada vez.';
      if (horarios.length === 0) return 'Escolha pelo menos um horário.';
      if (!todosOsDias && diasEscolhidos.length === 0) return 'Escolha pelo menos um dia da semana.';
    }
    return '';
  };

  const irParaPasso = (n: number) => {
    setErro('');
    setStep(n);
  };

  const handleNextStep = () => {
    const msg = validarPasso();
    if (msg) {
      if (msg === erro) {
        // Same message already on screen: no re-render, so scroll right away
        scrollRef.current?.scrollTo({ y: Math.max(0, erroY.current - 120), animated: true });
      } else {
        rolarParaErro.current = true;
        setErro(msg);
      }
      return;
    }
    haptic();
    setHorarioEmEdicao(null);
    irParaPasso(Math.min(step + 1, 4));
  };

  const handlePrevStep = async () => {
    if (step > 1) {
      irParaPasso(step - 1);
      return;
    }
    if (editando) {
      if (formularioInicial.current !== null && formulario !== formularioInicial.current) {
        const descartar = await confirmar({
          titulo: 'Sair sem salvar?',
          mensagem: 'As alterações deste remédio serão perdidas.',
          confirmarLabel: 'Sim, sair sem salvar',
          cancelarLabel: 'Continuar editando',
          destrutivo: true,
        });
        if (!descartar) return;
      }
      navigation.goBack();
      return;
    }
    if (nome.trim()) {
      const descartar = await confirmar({
        titulo: 'Sair sem salvar?',
        mensagem: 'O que você preencheu deste remédio será perdido.',
        confirmarLabel: 'Sim, sair sem salvar',
        cancelarLabel: 'Continuar cadastrando',
        destrutivo: true,
      });
      if (!descartar) return;
      limparFormulario();
    }
    navigation.navigate('InicioTab');
  };

  const handleSalvar = async () => {
    try {
      setIsSaving(true);
      const horariosData = horarios.map((h) => ({ dosagem, hora_programada: h, dias_da_semana: diasSemana }));
      const dados = {
        nome: nome.trim(),
        forma_farmaceutica: forma,
        cor,
        // The camera's own folder may be cleaned by the system
        foto_url: await guardarFoto(fotoUrl),
        orientacoes_extras: orientacoes,
      };
      const nomeSalvo = nome.trim();

      if (medicamentoId) {
        await atualizarMedicamentoCompleto(medicamentoId, dados, horariosData);
        triggerAutoSync();
        formularioInicial.current = null;
        navigation.goBack();
        avisar({ mensagem: `${nomeSalvo} atualizado. Os lembretes foram ajustados.` });
        return;
      }

      await cadastrarMedicamentoCompleto(dados, horariosData);
      triggerAutoSync();
      limparFormulario();
      navigation.navigate('InicioTab');
      avisar({ mensagem: `${nomeSalvo} cadastrado. Os lembretes estão ligados.` });
    } catch (e) {
      console.error('Erro ao salvar medicamento:', e);
      avisar({
        mensagem: editando
          ? 'Não foi possível salvar as alterações. Tente novamente.'
          : 'Não foi possível cadastrar o remédio. Tente novamente.',
        tipo: 'erro',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ---------- UI helpers ----------
  const Label = ({ children, opcional }: { children: React.ReactNode; opcional?: boolean }) => (
    <Text style={[styles.label, { color: colors.textPrimary, fontSize: typography.bodyBold.fontSize }]}>
      {children}
      {opcional ? (
        <Text style={{ color: colors.textSecondary, fontWeight: '500', fontSize: typography.caption.fontSize + 1 }}>
          {'  '}(opcional)
        </Text>
      ) : null}
    </Text>
  );

  const MensagemErro = () =>
    erro ? (
      <View
        style={[styles.erroBox, { backgroundColor: colors.statusSkippedBg, borderColor: colors.statusSkippedBorder }]}
        accessibilityLiveRegion="polite"
        onLayout={(e) => {
          // y is relative to the step container, which starts at the top of the scroll content
          erroY.current = e.nativeEvent.layout.y;
          if (!rolarParaErro.current) return;
          rolarParaErro.current = false;
          scrollRef.current?.scrollTo({ y: Math.max(0, erroY.current - 120), animated: true });
        }}
      >
        <Ionicons name="alert-circle-outline" size={22} color={colors.statusSkipped} />
        <Text style={[styles.erroTexto, { fontSize: typography.caption.fontSize + 1 }]}>{erro}</Text>
      </View>
    ) : null;

  const Stepper = ({
    valor,
    onMenos,
    onMais,
    labelMenos,
    labelMais,
    podeMenos = true,
  }: {
    valor: string;
    onMenos: () => void;
    onMais: () => void;
    labelMenos: string;
    labelMais: string;
    podeMenos?: boolean;
  }) => (
    <View style={styles.stepperRow}>
      <TouchableOpacity
        onPress={onMenos}
        disabled={!podeMenos}
        style={[styles.stepperBtn, { borderColor: colors.primary, opacity: podeMenos ? 1 : 0.35 }]}
        accessibilityRole="button"
        accessibilityLabel={labelMenos}
      >
        <Ionicons name="remove" size={30} color={colors.primary} />
      </TouchableOpacity>
      <Text
        style={[styles.stepperValor, { color: colors.textPrimary, fontSize: typography.title.fontSize }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        accessibilityLiveRegion="polite"
      >
        {valor}
      </Text>
      <TouchableOpacity
        onPress={onMais}
        style={[styles.stepperBtn, { borderColor: colors.primary, backgroundColor: colors.primary }]}
        accessibilityRole="button"
        accessibilityLabel={labelMais}
      >
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );

  const LinhaRevisao = ({
    icon,
    titulo,
    valor,
    passo,
  }: {
    icon: React.ReactNode;
    titulo: string;
    valor: string;
    passo: number;
  }) => (
    <View style={[styles.reviewRow, { borderTopColor: colors.border }]}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={[styles.reviewLabel, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}>{titulo}</Text>
        <Text style={[styles.reviewValue, { color: colors.textPrimary, fontSize: typography.bodyBold.fontSize }]}>{valor}</Text>
      </View>
      <TouchableOpacity onPress={() => irParaPasso(passo)} style={styles.alterarBtn} accessibilityRole="button" accessibilityLabel={`Alterar ${titulo}`}>
        <Text style={[styles.alterarTexto, { color: colors.primary, fontSize: typography.body.fontSize }]}>Alterar</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFormaIcon = (item: (typeof FORMAS)[number], selected: boolean) => {
    const color = selected ? colors.primary : colors.textSecondary;
    if (item.provider === 'fa5') return <FontAwesome5 name={item.icon as any} size={26} color={color} />;
    if (item.provider === 'ion') return <Ionicons name={item.icon as any} size={30} color={color} />;
    return <MaterialCommunityIcons name={item.icon as any} size={30} color={color} />;
  };

  const chip = (selected: boolean) => ({
    backgroundColor: selected ? colors.primary : colors.cardBackground,
    borderColor: selected ? colors.primary : colors.borderStrong,
  });
  const chipText = (selected: boolean) => ({
    color: selected ? '#FFFFFF' : colors.textPrimary,
  });

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handlePrevStep} style={styles.backButton} activeOpacity={0.7} accessibilityLabel="Voltar">
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontSize: typography.title.fontSize }]} numberOfLines={1}>
          {editando ? 'Editar remédio' : 'Novo remédio'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <StepIndicator currentStep={step} stepLabels={['Remédio', 'Quando', 'Dicas', 'Conferir']} />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* ================= STEP 1: WHAT ================= */}
        {step === 1 && (
          <View>
            <Label>Qual é o nome do remédio?</Label>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: erro ? colors.statusSkipped : colors.borderStrong,
                  color: colors.textPrimary,
                  fontSize: typography.body.fontSize,
                },
              ]}
              placeholder="Ex: Losartana 50 mg"
              placeholderTextColor={colors.textMuted}
              value={nome}
              onChangeText={(t) => {
                setNome(t);
                setErro('');
              }}
              autoCapitalize="words"
              returnKeyType="done"
            />
            <Text style={[styles.helper, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
              Copie o nome como está escrito na caixa ou na receita.
            </Text>
            <MensagemErro />

            <Label>Como é o remédio?</Label>
            <View style={styles.formasGrid}>
              {FORMAS.map((item) => {
                const isSelected = forma === item.forma;
                return (
                  <TouchableOpacity
                    key={item.forma}
                    activeOpacity={0.8}
                    onPress={() => escolherForma(item.forma)}
                    style={[
                      styles.formaCard,
                      {
                        backgroundColor: isSelected ? colors.primaryLight : colors.cardBackground,
                        borderColor: isSelected ? colors.primary : colors.border,
                        borderWidth: isSelected ? 2.5 : 1.5,
                      },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                  >
                    {renderFormaIcon(item, isSelected)}
                    <Text
                      style={[
                        styles.formaText,
                        {
                          color: isSelected ? colors.primaryDark : colors.textPrimary,
                          fontWeight: isSelected ? '800' : '600',
                          fontSize: typography.caption.fontSize + 1,
                        },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {item.forma}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {FORMAS_COM_COR.includes(forma) && (
              <>
                <Label opcional>Qual a cor do {forma.toLowerCase()}?</Label>
                <View style={styles.colorsRow}>
                  {CORES.map((c) => {
                    const isSelected = cor === c.cor;
                    return (
                      <TouchableOpacity
                        key={c.cor}
                        onPress={() => {
                          haptic();
                          setCor(c.cor);
                        }}
                        style={styles.colorOption}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={c.nome}
                      >
                        <View
                          style={[
                            styles.colorCircle,
                            {
                              backgroundColor: c.cor,
                              borderColor: isSelected ? colors.primary : '#CBD5E1',
                              borderWidth: isSelected ? 3 : 1.5,
                            },
                          ]}
                        >
                          {isSelected && (
                            <Ionicons name="checkmark" size={20} color={c.cor === '#FFFFFF' || c.cor === '#FDE047' ? '#000000' : '#FFFFFF'} />
                          )}
                        </View>
                        <Text
                          style={[styles.colorName, { color: isSelected ? colors.primaryDark : colors.textSecondary, fontWeight: isSelected ? '800' : '500' }]}
                          numberOfLines={1}
                        >
                          {c.nome}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <Label opcional>Foto da caixa</Label>
            <TouchableOpacity
              style={[styles.photoButton, { borderColor: colors.primaryBorder, backgroundColor: colors.cardBackground }]}
              onPress={handlePickPhoto}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              {fotoUrl ? (
                <Image source={{ uri: fotoUrl }} style={styles.photoPreview} />
              ) : (
                <View style={[styles.photoIcon, { backgroundColor: colors.primaryLight }]}>
                  <Feather name="camera" size={24} color={colors.primary} />
                </View>
              )}
              <Text style={[styles.photoText, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                {fotoUrl ? 'Tirar outra foto' : 'Tirar foto'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ================= STEP 2: HOW MUCH / WHEN ================= */}
        {step === 2 && (
          <View>
            <Label>Quanto tomar de cada vez?</Label>
            {doseCfg ? (
              <>
                <Stepper
                  valor={textoDose(quantidade, doseCfg)}
                  onMenos={() => alterarQuantidade(-1)}
                  onMais={() => alterarQuantidade(1)}
                  labelMenos="Diminuir quantidade"
                  labelMais="Aumentar quantidade"
                  podeMenos={quantidade > doseCfg.min}
                />
                {doseCfg.dica ? (
                  <Text style={[styles.helper, { color: colors.textSecondary, fontSize: typography.caption.fontSize, textAlign: 'center' }]}>
                    {doseCfg.dica}
                  </Text>
                ) : null}
              </>
            ) : (
              <TextInput
                style={[styles.input, { backgroundColor: colors.cardBackground, borderColor: colors.borderStrong, color: colors.textPrimary, fontSize: typography.body.fontSize }]}
                value={dosagemLivre}
                onChangeText={(t) => {
                  setDosagemLivre(t);
                  setErro('');
                }}
                placeholder="Ex: 1 sachê, 1 inalação"
                placeholderTextColor={colors.textMuted}
              />
            )}

            <Label>Em quais horários?</Label>
            <Text style={[styles.helper, { color: colors.textSecondary, fontSize: typography.caption.fontSize, marginTop: -4 }]}>
              Toque para marcar ou desmarcar. Pode escolher mais de um.
            </Text>
            <View style={styles.timesGrid}>
              {HORARIOS_RAPIDOS.map(({ hora, periodo }) => {
                const sel = horarios.includes(hora);
                return (
                  <TouchableOpacity
                    key={hora}
                    style={[styles.timeChip, chip(sel)]}
                    onPress={() => alternarHorario(hora)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: sel }}
                    accessibilityLabel={`${hora}, ${periodo}`}
                  >
                    <View style={styles.timeChipTop}>
                      {sel && <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />}
                      <Text style={[styles.timeChipHora, chipText(sel), { fontSize: typography.bodyBold.fontSize }]}>{hora}</Text>
                    </View>
                    <Text style={[styles.timeChipPeriodo, { color: sel ? '#E6F4F1' : colors.textSecondary }]}>{periodo}</Text>
                  </TouchableOpacity>
                );
              })}
              {/* Custom times picked via "Outro horário" */}
              {horarios
                .filter((h) => !HORARIOS_RAPIDOS.some((r) => r.hora === h))
                .map((hora) => (
                  <TouchableOpacity
                    key={hora}
                    style={[styles.timeChip, chip(true)]}
                    onPress={() => alternarHorario(hora)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: true }}
                  >
                    <View style={styles.timeChipTop}>
                      <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                      <Text style={[styles.timeChipHora, chipText(true), { fontSize: typography.bodyBold.fontSize }]}>{hora}</Text>
                    </View>
                    <Text style={[styles.timeChipPeriodo, { color: '#E6F4F1' }]}>Outro</Text>
                  </TouchableOpacity>
                ))}
            </View>

            {!horarioEmEdicao ? (
              <TouchableOpacity
                style={[styles.outroHorarioBtn, { borderColor: colors.primaryBorder, backgroundColor: colors.primaryLight }]}
                onPress={abrirOutroHorario}
                accessibilityRole="button"
              >
                <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
                <Text style={[styles.outroHorarioTexto, { color: colors.primaryDark, fontSize: typography.body.fontSize }]}>Outro horário</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.outroHorarioPanel, { borderColor: colors.primary, backgroundColor: colors.cardBackground }]}>
                <View style={styles.outroHorarioHeader}>
                  <Feather name="clock" size={22} color={colors.primary} />
                  <Text style={[styles.outroHorarioHeaderText, { color: colors.primaryDark, fontSize: typography.body.fontSize }]}>
                    Escolha o horário e toque em "Pronto"
                  </Text>
                </View>
                <Text style={[styles.subLabel, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}>Hora</Text>
                <Stepper
                  valor={horarioEmEdicao.split(':')[0]}
                  onMenos={() => ajustarHorarioEmEdicao(-60)}
                  onMais={() => ajustarHorarioEmEdicao(60)}
                  labelMenos="Hora anterior"
                  labelMais="Próxima hora"
                />
                <Text style={[styles.subLabel, { color: colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}>Minutos</Text>
                <Stepper
                  valor={horarioEmEdicao.split(':')[1]}
                  onMenos={() => ajustarHorarioEmEdicao(-5)}
                  onMais={() => ajustarHorarioEmEdicao(5)}
                  labelMenos="Menos 5 minutos"
                  labelMais="Mais 5 minutos"
                />
                <View style={[styles.rowButtons, { marginTop: 12 }]}>
                  <CustomButton title="Cancelar" onPress={cancelarHorarioEmEdicao} variant="secondary" size="normal" style={{ flex: 1 }} />
                  <CustomButton title={`Pronto, adicionar ${horarioEmEdicao}`} onPress={confirmarHorarioEmEdicao} variant="primary" size="normal" style={{ flex: 1.6 }} />
                </View>
              </View>
            )}

            <Label>Em quais dias?</Label>
            <View style={[styles.segment, { backgroundColor: colors.cardAltBg, borderColor: colors.border }]}>
              {[
                { val: true, label: 'Todos os dias' },
                { val: false, label: 'Só alguns dias' },
              ].map((op) => {
                const ativo = todosOsDias === op.val;
                return (
                  <TouchableOpacity
                    key={op.label}
                    style={[styles.segmentBtn, ativo && { backgroundColor: colors.cardBackground, borderColor: colors.primary }]}
                    onPress={() => {
                      haptic();
                      setErro('');
                      setTodosOsDias(op.val);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: ativo }}
                  >
                    <Text
                      style={[styles.segmentText, { color: ativo ? colors.primaryDark : colors.textSecondary, fontSize: typography.caption.fontSize + 1 }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {op.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {!todosOsDias && (
              <View style={styles.diasGrid}>
                {DIAS.map((d) => {
                  const sel = diasEscolhidos.includes(d.codigo);
                  return (
                    <TouchableOpacity
                      key={d.codigo}
                      style={[styles.diaChip, chip(sel)]}
                      onPress={() => alternarDia(d.codigo)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: sel }}
                      accessibilityLabel={d.nome}
                    >
                      <Text style={[styles.diaTexto, chipText(sel), { fontSize: typography.caption.fontSize + 1 }]} numberOfLines={1} adjustsFontSizeToFit>
                        {d.curto}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <MensagemErro />
          </View>
        )}

        {/* ================= STEP 3: TIPS ================= */}
        {step === 3 && (
          <View>
            <Label opcional>Alguma orientação do médico?</Label>
            <Text style={[styles.helper, { color: colors.textSecondary, fontSize: typography.caption.fontSize, marginTop: -4 }]}>
              Ela aparece no lembrete na hora de tomar. Toque para marcar.
            </Text>
            <View style={styles.dicasGrid}>
              {ORIENTACOES_SUGESTOES.map((dica) => {
                const sel = dicasEscolhidas.includes(dica);
                return (
                  <TouchableOpacity
                    key={dica}
                    style={[styles.dicaChip, chip(sel)]}
                    onPress={() => alternarDica(dica)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: sel }}
                  >
                    <Ionicons name={sel ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={sel ? '#FFFFFF' : colors.textMuted} />
                    <Text style={[styles.dicaText, chipText(sel), { fontSize: typography.body.fontSize }]}>{dica}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Label opcional>Outra orientação</Label>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.borderStrong,
                  color: colors.textPrimary,
                  fontSize: typography.body.fontSize,
                  minHeight: 90,
                  textAlignVertical: 'top',
                },
              ]}
              multiline
              value={outraOrientacao}
              onChangeText={setOutraOrientacao}
              placeholder="Ex: 30 minutos antes do café"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        )}

        {/* ================= STEP 4: REVIEW ================= */}
        {step === 4 && (
          <View>
            <Text style={[styles.reviewTitle, { color: colors.textPrimary, fontSize: typography.title.fontSize }]}>
              Está tudo certo?
            </Text>
            <Text style={[styles.helper, { color: colors.textSecondary, fontSize: typography.body.fontSize, textAlign: 'center' }]}>
              Confira antes de salvar. Toque em "Alterar" para corrigir.
            </Text>

            <View style={[styles.reviewCard, { backgroundColor: colors.cardBackground, borderColor: colors.primaryBorder }]}>
              <View style={styles.reviewHeader}>
                {fotoUrl ? (
                  <Image source={{ uri: fotoUrl }} style={styles.reviewPhoto} />
                ) : (
                  <PillGraphic forma={forma} cor={cor} size={64} />
                )}
                <View style={{ marginLeft: 16, flex: 1 }}>
                  <NomeRemedio
                    nome={nome.trim()}
                    style={[styles.reviewMedName, { color: colors.textPrimary, fontSize: typography.subtitle.fontSize }]}
                  />
                  <View style={styles.reviewFormaRow}>
                    <Text style={[styles.reviewForma, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>{forma}</Text>
                    <TouchableOpacity onPress={() => irParaPasso(1)} style={styles.alterarBtn} accessibilityRole="button" accessibilityLabel="Alterar remédio">
                      <Text style={[styles.alterarTexto, { color: colors.primary, fontSize: typography.body.fontSize }]}>Alterar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <LinhaRevisao icon={<MaterialCommunityIcons name="pill" size={22} color={colors.primary} />} titulo="Quantidade" valor={dosagem} passo={2} />
              <LinhaRevisao icon={<Feather name="clock" size={22} color={colors.primary} />} titulo="Horários" valor={horarios.join('  •  ')} passo={2} />
              <LinhaRevisao
                icon={<Feather name="calendar" size={22} color={colors.primary} />}
                titulo="Dias"
                valor={todosOsDias ? 'Todos os dias' : textoDias(diasEscolhidos)}
                passo={2}
              />
              <LinhaRevisao
                icon={<Ionicons name="information-circle-outline" size={22} color={colors.primary} />}
                titulo="Orientações"
                valor={orientacoes || 'Nenhuma'}
                passo={3}
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom actions: explicit "Voltar" next to "Próximo" (Nielsen #3) */}
      <View
        style={[
          styles.bottomBar,
          { backgroundColor: colors.cardBackground, borderTopColor: colors.border },
          empilharBotoes ? styles.bottomBarStacked : styles.rowButtons,
        ]}
      >
        {step > 1 && (
          <CustomButton
            title="Voltar"
            onPress={handlePrevStep}
            variant="secondary"
            size="large"
            style={empilharBotoes ? undefined : { flex: 1 }}
          />
        )}
        <CustomButton
          title={step === 4 ? (editando ? 'Salvar alterações' : 'Salvar remédio') : 'Próximo'}
          onPress={step === 4 ? handleSalvar : handleNextStep}
          loading={isSaving}
          size="large"
          variant="primary"
          style={empilharBotoes ? undefined : { flex: 1.6 }}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontWeight: '800',
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 30,
  },
  label: {
    fontWeight: '800',
    marginTop: 22,
    marginBottom: 10,
  },
  helper: {
    marginTop: 6,
    lineHeight: 22,
  },
  subLabel: {
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 6,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 58,
  },
  erroBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  erroTexto: {
    flex: 1,
    color: '#991B1B',
    fontWeight: '700',
  },
  formasGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  formaCard: {
    flexBasis: '30%',
    flexGrow: 1,
    minHeight: 92,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  formaText: {
    marginTop: 6,
    textAlign: 'center',
  },
  colorsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  colorOption: {
    alignItems: 'center',
    width: 72,
    paddingVertical: 4,
  },
  colorCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorName: {
    marginTop: 4,
    fontSize: 13,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: 12,
    minHeight: 72,
  },
  photoIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPreview: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  photoText: {
    fontWeight: '700',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValor: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '800',
  },
  timesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  timeChip: {
    flexBasis: '30%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    minHeight: 64,
    justifyContent: 'center',
  },
  timeChipTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeChipHora: {
    fontWeight: '800',
  },
  timeChipPeriodo: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  outroHorarioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    marginTop: 12,
  },
  outroHorarioTexto: {
    fontWeight: '800',
  },
  outroHorarioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  outroHorarioHeaderText: {
    flex: 1,
    fontWeight: '700',
  },
  outroHorarioPanel: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    marginTop: 12,
    gap: 4,
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  segmentText: {
    fontWeight: '800',
  },
  diasGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  diaChip: {
    flexBasis: '22%',
    flexGrow: 1,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  diaTexto: {
    fontWeight: '800',
  },
  dicasGrid: {
    gap: 10,
  },
  dicaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  dicaText: {
    flex: 1,
    fontWeight: '600',
  },
  reviewTitle: {
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 16,
  },
  reviewCard: {
    borderRadius: 20,
    borderWidth: 2,
    padding: 18,
    marginTop: 16,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  reviewPhoto: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  reviewMedName: {
    fontWeight: '800',
  },
  reviewForma: {
    marginTop: 2,
    flexShrink: 1,
  },
  reviewFormaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  reviewLabel: {
    fontWeight: '600',
  },
  reviewValue: {
    fontWeight: '800',
    marginTop: 1,
  },
  alterarBtn: {
    minHeight: 44,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  alterarTexto: {
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  bottomBarStacked: {
    flexDirection: 'column-reverse',
    gap: 10,
  },
});
