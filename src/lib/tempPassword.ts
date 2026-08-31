/**
 * The temporary password handed to a newly provisioned account.
 *
 * One implementation, because there were two — `createOrganization` and
 * `inviteAccount` each carried their own copy, and a credential generator is
 * the last thing that should exist twice.
 *
 * ## Why the rejection loop
 *
 * The previous version was `chars[randomValue % chars.length]`, which is
 * uniform only when the alphabet size divides the range evenly. It does not:
 * the alphabet is 62 characters and 2³² is not a multiple of 62, so the first
 * `2³² mod 62` characters were very slightly likelier than the rest.
 *
 * The bias here is tiny and not a practical break of a 14-character password.
 * It is fixed anyway because "slightly biased" is not a property anyone should
 * have to reason about in a credential path, and rejection sampling costs one
 * cheap loop.
 *
 * ## Why these characters
 *
 * No `I`, `l`, `O` or `0`. These passwords are read off a screen and typed into
 * another one — often dictated over a phone — and a credential that cannot be
 * transcribed reliably gets written down somewhere worse.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

/** Largest multiple of the alphabet size that fits in a byte; values at or
 *  above it are discarded so every character stays equally likely. */
const UNBIASED_LIMIT = 256 - (256 % ALPHABET.length);

export function randomPassword(length = 14): string {
  if (length < 12) throw new Error('A temporary password must be at least 12 characters.');

  const out: string[] = [];
  const buffer = new Uint8Array(length);

  while (out.length < length) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) {
      if (byte >= UNBIASED_LIMIT) continue; // discard, do not fold
      out.push(ALPHABET[byte % ALPHABET.length]);
      if (out.length === length) break;
    }
  }

  return out.join('');
}
