// Input validation shared by the screens (and covered by __tests__/validacao.test.ts).
// Each function returns the message to show next to the field, or null when the value is valid.

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Phone with area code: 10 digits (landline) or 11 (mobile). Empty is allowed (optional field). */
export const validarTelefone = (telefone: string): string | null => {
  const digitos = telefone.replace(/\D/g, '');
  if (digitos.length > 0 && digitos.length < 10) {
    return 'Telefone incompleto. Digite com DDD, por exemplo: (11) 98765-4321';
  }
  return null;
};

/** Empty is allowed (optional field) */
export const validarEmail = (email: string): string | null => {
  const valor = email.trim();
  if (valor && !EMAIL_VALIDO.test(valor)) {
    return 'Email do cuidador inválido. Confira, por exemplo: maria@gmail.com';
  }
  return null;
};

/** "11987654321" → "(11) 98765-4321". A leading country code 55 is dropped. */
export const formatarTelefone = (digits: string) => {
  const d = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
};
