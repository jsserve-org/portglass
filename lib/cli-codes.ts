import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createDeviceCode(): string {
  return randomBytes(32).toString('base64url');
}

export function createUserCode(): string {
  const bytes = randomBytes(8);
  let value = '';
  for (let i = 0; i < 8; i++) value += ALPHABET[bytes[i] % ALPHABET.length];
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}

export function normalizeUserCode(value: unknown): string {
  const compact = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
}
