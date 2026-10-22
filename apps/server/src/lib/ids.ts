import { createHash, randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encode(value: number, length: number): string {
  let out = '';
  let remaining = value;
  for (let i = 0; i < length; i += 1) {
    out = ALPHABET[remaining % 32] + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

/** ULID: 48-bit timestamp + 80-bit randomness, Crockford base32, 26 chars. */
export function ulid(now = Date.now()): string {
  const time = encode(now, 10);
  const random = encode(Math.floor(Math.random() * 0xffffffff), 8) +
    encode(Math.floor(Math.random() * 0xffffffff), 8);
  return time + random.slice(0, 16);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
