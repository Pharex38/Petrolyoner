/**
 * Oyun saati. Sahne katmanı yalnızca görsel gün/gece geçişi için faz değerini
 * okur; günün kendisi burada, yani kayda giren tarafta ilerler.
 */

/** Bir oyun gününün gerçek süresi. */
export const DAY_CYCLE_SECONDS = 300;

/** Yeni oyun sabah 08:00'de açılır. */
export const DAY_START_PHASE = 8 / 24;

/** Gün dönümünde alınan kapanış özeti. */
export interface DayReport {
  /** Biten günün numarası. */
  readonly day: number;
  /** Gün boyunca kasaya giren brüt satış. */
  readonly earned: number;
  /** Kasadaki net değişim; ikmal, bordro ve yatırımlar düşülmüş hali. */
  readonly netChange: number;
  readonly served: number;
  readonly missed: number;
  readonly marketSales: number;
}

/** Gün başındaki sayaç fotoğrafı; rapor bununla fark alınarak üretilir. */
export interface DayOpening {
  money: number;
  totalEarned: number;
  servedCars: number;
  missedCars: number;
  marketSales: number;
}

export function clockLabel(phase: number): string {
  const totalMinutes = Math.floor(phase * 24 * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
