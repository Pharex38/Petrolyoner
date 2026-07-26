# Yol Haritası

## v0.1 — Oynanabilir çekirdek ✅

Amaç: temel döngünün eğlenceli olup olmadığını anlamak. Grafik placeholder.

- [x] Repo + proje iskeleti
- [x] Kuş bakışı 3B saha (ortografik kamera, 4 kuyu, yollar)
- [x] Pompa animasyonu — seviye arttıkça hızlanır
- [x] Kuyuya dokun → seç + bir saniyelik üretim ödülü
- [x] Yükseltme butonu ve maliyet eğrisi (×1.14–1.17)
- [x] Sayı biçimlendirme (K/M/B/T ve sonrası)
- [x] localStorage kayıt / yükleme, bozuk kayıt kurtarma
- [x] Offline kazanç (4 saat tavan, %50 verim) ve dönüş ekranı
- [x] Dev konsol kancası (denge denemesi için)

**Karar noktası:** Bu haliyle 10 dakika oynanıyor mu? Oynanmıyorsa döngüyü değiştir,
grafiğe geçme.

Bilinen eksikler:
- Kamera sabit — kaydırma/yakınlaştırma yok
- Ses yok
- 4 kuyu dolduktan sonra yapacak bir şey kalmıyor (prestij yok)

## v0.2 — Derinlik

- [ ] Depo kapasitesi + dolma darboğazı
- [ ] Nakliye katmanı (kamyon animasyonu — kuş bakışında çok iyi durur)
- [ ] Yönetici / otomasyon
- [ ] İkinci saha (Adıyaman) ve saha geçişi
- [ ] Prestij ("Sahayı Sat")

## v0.3 — Cila ve his

- [ ] Sanat geçişi: primitif geometriden glTF modellere
- [ ] Ses + titreşim (Vibration API)
- [ ] Partikül, sayı uçuşma, kamera sarsıntısı
- [ ] Onboarding / ilk 60 saniye
- [ ] Performans: mobilde 60 fps, gölge maliyeti ölçülecek

## v0.4 — Mobil paket ve para

- [ ] **Capacitor** ile iOS/Android sarmalama
- [ ] Analytics — retention, oturum süresi, funnel
- [ ] Ödüllü reklam (AdMob Capacitor eklentisi)
- [ ] IAP: reklamsız + başlangıç paketi
- [ ] Remote config (ekonomiyi build almadan ayarlayabilmek)
- [ ] Bulut kayıt — şu an localStorage, tarayıcı temizlenince ilerleme gidiyor

## v1.0 — Yayın

- [ ] 8 saha, tam ekonomi dengesi
- [ ] Lokalizasyon: TR + EN
- [ ] Store görselleri, ikon, tanıtım videosu
- [ ] Kapalı test (Play internal testing, TestFlight)
- [ ] Gizlilik politikası + ATT (iOS izleme izni) akışı

## Yayın öncesi kontrol listesi

- [ ] Android keystore oluşturuldu ve **repo dışında** yedeklendi
- [ ] Bundle identifier son hali (isim değişirse burası da değişir)
- [ ] iOS: ATT prompt, App Privacy formu
- [ ] Android: Data safety formu, hedef API seviyesi
- [ ] İlk prestije ulaşma süresi ölçüldü

## Notlar

- İsim geçici (`Petrolyoner`). Değişirse: repo adı, `package.json`, bundle id, store listing.
- Erken aşamada grafiğe zaman harcama; idle oyunlarda ilk risk **ekonomi dengesi**, sanat değil.
- Bundle şu an ~135 kB gzip (çoğu Three.js). Mobilde ilk açılış süresi v0.3'te ölçülmeli.
