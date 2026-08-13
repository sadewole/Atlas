/**
 * Wallet number generation (WSS §Wallet Number Generation).
 *
 * Format: `ATL-{CURRENCY}-{sequence}-{checksum}`
 * e.g. ATL-NGN-0000012345-7
 *
 * Human-readable, auditable, and never exposes the DB id.
 */
export interface WalletNumberProps {
  currency: string;
  /** Monotonic sequence per currency, e.g. 12345. */
  sequence: number;
}

export function formatWalletNumber(currency: string, sequence: number): string {
  const seq = String(sequence).padStart(10, '0');
  const base = `ATL-${currency}-${seq}`;
  return `${base}-${checksum(base)}`;
}

/** Simple deterministic checksum (sum of char codes mod 10) — a readable guard digit. */
function checksum(input: string): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    sum += input.charCodeAt(i);
  }
  return sum % 10;
}

export function parseWalletNumber(walletNumber: string): {
  currency: string;
  sequence: number;
} | null {
  const match = /^ATL-([A-Z]{3})-(\d{10})-(\d)$/.exec(walletNumber);
  if (!match) return null;
  const base = `ATL-${match[1]}-${match[2]}`;
  if (checksum(base) !== Number(match[3])) return null;
  return {
    currency: match[1],
    sequence: Number(match[2]),
  };
}
