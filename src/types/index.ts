export type FormaFarmaceutica = 
  | 'Comprimido' 
  | 'Cápsula' 
  | 'Gotas' 
  | 'Xarope' 
  | 'Injeção' 
  | 'Pomada' 
  | 'Outro';

export type CorMedicamento = 
  | '#FFFFFF' // Branco
  | '#93C5FD' // Azul claro
  | '#FCA5A5' // Vermelho/Rosa
  | '#FDE047' // Amarelo
  | '#2563EB' // Azul escuro
  | '#059669' // Verde
  | '#FB923C' // Laranja
  | '#A855F7'; // Roxo

export type StatusDose = 'PENDENTE' | 'TOMADO' | 'ATRASADO' | 'PULADO';

export interface PerfilUsuario {
  id: string;
  nome: string;
  email?: string | null;
  telefone_cuidador?: string | null;
  nome_cuidador?: string | null;
  email_cuidador?: string | null;
  avisar_cuidador?: boolean; // email the caregiver when a dose stays unconfirmed for 30 min
  tamanho_fonte?: 'padrao' | 'grande' | 'extra_grande';
  alto_contraste?: boolean;
  is_synced?: boolean;
  criado_em?: string;
}

export interface Medicamento {
  id: string;
  usuario_id?: string;
  nome: string;
  forma_farmaceutica: FormaFarmaceutica;
  cor: string;
  foto_url?: string | null;
  orientacoes_extras?: string | null;
  criado_em?: string;
}

export interface HorarioMedicamento {
  id: string;
  medicamento_id: string;
  dosagem: string;
  hora_programada: string; // "08:00", "12:00", "20:00"
  dias_da_semana: string; // "TODOS", "SEG,TER,QUA,QUI,SEX,SAB,DOM"
  ativo: boolean;
}

export interface HistoricoDose {
  id: string;
  medicamento_id: string;
  horario_id?: string | null;
  data_hora_prevista: string; // ISO 8601 string
  data_hora_realizada?: string | null;
  status: StatusDose;
  observacao?: string | null;
  atualizado_em?: string;
}

export interface DoseCompleta extends HistoricoDose {
  medicamento_nome: string;
  forma_farmaceutica: FormaFarmaceutica;
  cor: string;
  foto_url?: string | null;
  orientacoes_extras?: string | null;
  dosagem: string;
  hora_programada: string;
}

export interface MensagemChat {
  id: string;
  remetente: 'usuario' | 'ia' | 'sistema';
  texto: string;
  data_hora: string;
  sugestoes?: string[];
}
