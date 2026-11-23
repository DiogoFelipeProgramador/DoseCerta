import { DOSE_CONFIG, DoseConfig, lerQuantidade, textoDose } from '../src/utils/dose';

const comprimido = DOSE_CONFIG.Comprimido as DoseConfig;
const xarope = DOSE_CONFIG.Xarope as DoseConfig;
const gotas = DOSE_CONFIG.Gotas as DoseConfig;

describe('textoDose (quantidade em linguagem do dia a dia)', () => {
  it('escreve meio comprimido com o símbolo ½', () => {
    expect(textoDose(0.5, comprimido)).toBe('½ comprimido');
    expect(textoDose(1.5, comprimido)).toBe('1 e ½ comprimidos');
  });

  it('usa singular e plural', () => {
    expect(textoDose(1, comprimido)).toBe('1 comprimido');
    expect(textoDose(2, comprimido)).toBe('2 comprimidos');
    expect(textoDose(10, gotas)).toBe('10 gotas');
  });

  it('usa vírgula decimal no xarope', () => {
    expect(textoDose(2.5, xarope)).toBe('2,5 ml');
  });
});

describe('lerQuantidade (preencher o formulário ao editar um remédio)', () => {
  it.each([
    [0.5, comprimido],
    [1, comprimido],
    [1.5, comprimido],
    [3, comprimido],
    [2.5, xarope],
    [15, xarope],
    [20, gotas],
  ])('lê de volta %p', (quantidade, cfg) => {
    expect(lerQuantidade(textoDose(quantidade, cfg), cfg)).toBe(quantidade);
  });

  it('não inventa uma quantidade quando a unidade não confere', () => {
    expect(lerQuantidade('10 gotas', comprimido)).toBeNull();
    expect(lerQuantidade('', comprimido)).toBeNull();
  });
});
