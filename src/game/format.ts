/**
 * Idle oyun sayılarını kısaltır: 1500 → "1.5K", 2.4e9 → "2.4B".
 * Arayüzde asla ham sayı basma, buradan geç.
 */

const SHORT_SUFFIXES = ['', 'K', 'M', 'B', 'T'] as const;

function suffixFor(tier: number): string {
  const short = SHORT_SUFFIXES[tier];
  if (short !== undefined) return short;

  // T'den sonra aa, ab, ac ... şeklinde devam eder (idle oyun standardı).
  const index = tier - SHORT_SUFFIXES.length;
  const first = String.fromCharCode(97 + (Math.floor(index / 26) % 26));
  const second = String.fromCharCode(97 + (index % 26));
  return first + second;
}

function trim(value: number): string {
  // 1.50 → "1.5", 1.00 → "1"
  return value.toFixed(2).replace(/\.?0+$/, '');
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';

  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs < 1000) return sign + trim(abs);

  let tier = Math.floor(Math.log10(abs) / 3);
  let scaled = abs / Math.pow(1000, tier);

  // log10 yuvarlama hatası 1000.00 gibi bir sonuç üretebilir.
  if (scaled >= 1000) {
    scaled /= 1000;
    tier += 1;
  }

  return sign + trim(scaled) + suffixFor(tier);
}

export function formatMoney(value: number): string {
  return '₺' + formatNumber(value);
}

/** "3sa 12dk" gibi kısa süre metni — offline kazanç ekranı için. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));

  if (seconds < 60) return `${Math.max(1, seconds)}sn`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}dk`;

  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}sa ${minutes}dk`;
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}g ${hours}sa`;
}
