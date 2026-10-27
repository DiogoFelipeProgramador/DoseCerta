import { formatarTelefone, validarEmail, validarTelefone } from '../src/utils/validacao';

describe('validarTelefone (cadastro do cuidador)', () => {
  it('aceita celular e fixo com DDD, com ou sem máscara', () => {
    expect(validarTelefone('(11) 98765-4321')).toBeNull();
    expect(validarTelefone('11987654321')).toBeNull();
    expect(validarTelefone('1132654321')).toBeNull();
  });

  it('aceita o campo vazio, porque o telefone é opcional', () => {
    expect(validarTelefone('')).toBeNull();
  });

  it('recusa telefone sem DDD e explica como corrigir', () => {
    expect(validarTelefone('98765-4321')).toMatch(/Telefone incompleto/);
    expect(validarTelefone('123')).toMatch(/DDD/);
  });
});

describe('validarEmail (aviso ao cuidador)', () => {
  it('aceita um e-mail válido, mesmo com espaços nas pontas', () => {
    expect(validarEmail('maria@gmail.com')).toBeNull();
    expect(validarEmail('  joao.silva@empresa.com.br ')).toBeNull();
  });

  it('aceita o campo vazio, porque o e-mail é opcional', () => {
    expect(validarEmail('')).toBeNull();
  });

  it.each(['maria', 'maria@', 'maria@gmail', 'maria @gmail.com', '@gmail.com'])('recusa "%s"', (email) => {
    expect(validarEmail(email)).toMatch(/inválido/);
  });
});

describe('formatarTelefone', () => {
  it('formata celular e fixo', () => {
    expect(formatarTelefone('11987654321')).toBe('(11) 98765-4321');
    expect(formatarTelefone('1132654321')).toBe('(11) 3265-4321');
  });

  it('remove o código do país 55', () => {
    expect(formatarTelefone('5511987654321')).toBe('(11) 98765-4321');
  });
});
