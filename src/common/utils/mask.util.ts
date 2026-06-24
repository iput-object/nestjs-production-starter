/**
 * Masking helpers for surfacing a contact channel without disclosing it in
 * full (e.g. on a password-reset channel picker).
 */

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) {
    return maskSegment(email);
  }
  const [host, ...rest] = domain.split('.');
  const tld = rest.length ? `.${rest.join('.')}` : '';
  return `${maskSegment(local)}@${maskSegment(host)}${tld}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const last = digits.slice(-4);
  return `•••• ${last}`;
}

function maskSegment(value: string): string {
  if (value.length <= 1) {
    return '*';
  }
  if (value.length === 2) {
    return `${value[0]}*`;
  }
  return `${value[0]}${'*'.repeat(value.length - 2)}${value[value.length - 1]}`;
}
