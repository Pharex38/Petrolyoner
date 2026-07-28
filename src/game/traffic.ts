/**
 * Trafiğin hangi yönden aktığı. Türkiye sağdan trafik kullanır; sol seçeneği
 * İngiltere/Japonya düzeni içindir.
 *
 * Yol ve istasyon yerinde kalır, değişen tek şey şeritlerin gidiş yönüdür.
 * Buna bağlı olarak istasyonun giriş ve çıkış kapıları rol değiştirir: sağdan
 * trafikte araçlar alt kapıdan girip üst kapıdan çıkar, soldan trafikte tersi.
 */

export type TrafficSide = 'sag' | 'sol';

export const DEFAULT_TRAFFIC_SIDE: TrafficSide = 'sag';

export function isTrafficSide(value: unknown): value is TrafficSide {
  return value === 'sag' || value === 'sol';
}

export function trafficSideLabel(side: TrafficSide): string {
  return side === 'sag' ? 'Sağdan' : 'Soldan';
}

/**
 * İstasyona komşu şeridin gidiş yönü — aynı zamanda araçların saha içindeki
 * akış yönü. Sağdan trafikte -z (ekranda yukarı), soldan trafikte +z.
 *
 * Sahnedeki tüm z ofsetleri bu işaretle çarpılır; böylece elle ayarlanmış
 * rota noktaları yeniden çizilmeden aynalanır.
 */
export function stationFlowDirection(side: TrafficSide): -1 | 1 {
  return side === 'sag' ? -1 : 1;
}
