import { FormaFarmaceutica } from '../types';

/**
 * How the dose is measured for each kind of medicine (Nielsen #2: match the real world —
 * a syrup is measured in ml, drops are counted, a pill can be split in half).
 */
export interface DoseConfig {
  singular: string;
  plural: string;
  passo: number;
  padrao: number;
  min: number;
  dica?: string;
}

export const DOSE_CONFIG: Partial<Record<FormaFarmaceutica, DoseConfig>> = {
  Comprimido: { singular: 'comprimido', plural: 'comprimidos', passo: 0.5, padrao: 1, min: 0.5, dica: 'Use ½ se o médico mandou partir o comprimido.' },
  'Cápsula': { singular: 'cápsula', plural: 'cápsulas', passo: 1, padrao: 1, min: 1 },
  Gotas: { singular: 'gota', plural: 'gotas', passo: 1, padrao: 10, min: 1 },
  Xarope: { singular: 'ml', plural: 'ml', passo: 2.5, padrao: 5, min: 2.5, dica: '5 ml = 1 colher de chá · 15 ml = 1 colher de sopa' },
  'Injeção': { singular: 'unidade', plural: 'unidades', passo: 1, padrao: 1, min: 1, dica: 'Use o número indicado na receita (por exemplo, unidades de insulina).' },
  Pomada: { singular: 'aplicação', plural: 'aplicações', passo: 1, padrao: 1, min: 1 },
};

export const formatarQuantidade = (qtd: number, cfg: DoseConfig) => {
  if (cfg.passo === 0.5) {
    const inteiro = Math.floor(qtd);
    const temMeio = qtd - inteiro >= 0.5;
    if (inteiro === 0) return '½';
    return temMeio ? `${inteiro} e ½` : String(inteiro);
  }
  return Number.isInteger(qtd) ? String(qtd) : String(qtd).replace('.', ',');
};

/** e.g. "1 e ½ comprimidos", "10 gotas", "2,5 ml" */
export const textoDose = (qtd: number, cfg: DoseConfig) =>
  `${formatarQuantidade(qtd, cfg)} ${qtd <= 1 ? cfg.singular : cfg.plural}`;

/** Reads back an amount written by textoDose ("1 e ½ comprimidos", "½ comprimido", "2,5 ml") */
export const lerQuantidade = (dosagem: string, cfg: DoseConfig): number | null => {
  const texto = dosagem.trim();
  if (!texto.endsWith(cfg.singular) && !texto.endsWith(cfg.plural)) return null;
  if (texto.startsWith('½')) return 0.5;
  const m = /^(\d+(?:,\d+)?)( e ½)?/.exec(texto);
  return m ? parseFloat(m[1].replace(',', '.')) + (m[2] ? 0.5 : 0) : null;
};
