# Yol Haritası

## v0.1 — Oynanabilir çekirdek (hedef: ilk çalışan prototip)

Amaç: temel döngünün eğlenceli olup olmadığını anlamak. Grafik önemsiz, placeholder kare yeterli.

- [x] Repo + proje iskeleti
- [ ] `GameManager` tick döngüsü
- [ ] Tek kuyu: tıkla → üret → sat
- [ ] Yükseltme butonu + maliyet eğrisi
- [ ] Sayı formatlama (K/M/B/T)
- [ ] Kayıt / yükleme
- [ ] Offline kazanç
- [ ] 3-4 kuyu ile ilerleme hissi

**Karar noktası:** Bu haliyle 10 dakika oynanıyor mu? Oynanmıyorsa döngüyü değiştir, grafiğe geçme.

## v0.2 — Derinlik

- [ ] Depo kapasitesi + dolma darboğazı
- [ ] Nakliye katmanı
- [ ] Yönetici / otomasyon
- [ ] İkinci saha (Adıyaman)
- [ ] Prestij ("Sahayı Sat")

## v0.3 — Cila ve his

- [ ] Sanat geçişi (placeholder → gerçek sprite)
- [ ] Ses + haptik
- [ ] Partikül, sayı uçuşma animasyonları
- [ ] Onboarding / ilk 60 saniye

## v0.4 — Para ve ölçüm

- [ ] Analytics (Unity Analytics veya Firebase) — retention, oturum, funnel
- [ ] Ödüllü reklam entegrasyonu (AdMob veya Unity Ads / LevelPlay)
- [ ] IAP: reklamsız + başlangıç paketi
- [ ] Remote config (ekonomi değerlerini build almadan ayarlayabilmek)

## v1.0 — Yayın

- [ ] 8 saha, tam ekonomi dengesi
- [ ] Lokalizasyon: TR + EN
- [ ] Store görselleri, ikon, tanıtım videosu
- [ ] Kapalı test (Google Play internal testing, TestFlight)
- [ ] Gizlilik politikası + ATT (iOS izleme izni) akışı
- [ ] Play Console + App Store Connect hesapları

## Yayın öncesi kontrol listesi

- [ ] Android keystore oluşturuldu ve **repo dışında** güvenli yerde yedeklendi
- [ ] Bundle identifier son hali (isim değişirse burası da değişir)
- [ ] iOS: ATT prompt, App Privacy formu, çocuk kitlesi ayarı
- [ ] Android: Data safety formu, hedef API seviyesi
- [ ] Ekonomi dengesi: ilk prestije ulaşma süresi ölçüldü

## Notlar

- İsim geçici, `Petrolyoner`. Değişirse: klasör adı, namespace, bundle id, store listing.
- Erken aşamada grafiğe zaman harcama; idle oyunlarda ilk risk **ekonomi dengesi**, sanat değil.
