# Yol Haritası

## v0.1 — Oynanabilir çekirdek ✅

Amaç: servis döngüsünün eğlenceli olup olmadığını anlamak. Grafik placeholder.

- [x] Kuş bakışı 3B istasyon (ortografik kamera, 6 pompa yeri, şerit, bina)
- [x] Araç akışı: giriş → pompaya yanaşma → bekleme → doldurma → çıkış
- [x] Sipariş etiketi (yakıt rengi + tutar) ve sabır çubuğu
- [x] Yakıt türü + tutar seçme paneli
- [x] Doğru servis → ödeme; yanlış yakıt/tutar → müşteri kızgın ayrılır
- [x] Sabır bitince müşteri kaçar
- [x] Pompa açma ve maliyetleri
- [x] localStorage kayıt, bozuk kayıt kurtarma, v1'den şema taşıma
- [x] Gece vardiyası (offline kazanç)
- [x] Dev konsol kancası (denge denemesi ve zamanı elle ilerletme)

**Karar noktası:** Bu haliyle 10 dakika oynanıyor mu?

Bilinen eksikler:
- Ses yok
- Kamera sabit — kaydırma/yakınlaştırma yok
- 6 pompa dolduktan sonra yapacak bir şey kalmıyor
- Doldurma paneli açıkken alt sıradaki pompalar panelin altında kalıyor

## v0.2 — Derinlik

- [ ] Kuyruk: pompalar doluyken araçlar sıraya girsin
- [ ] Market: ödeme sırasında ek satış
- [ ] Personel: bir pompayı otomatik çalıştıran görevli
- [ ] Yakıt stoğu ve tanker çağırma
- [ ] Farklı araç tipleri (kamyon, motosiklet)
- [ ] Zorluk eğrisi: pompa sayısı arttıkça araç sıklığı artsın

## v0.3 — Cila ve his

- [ ] Sanat geçişi: primitif geometriden glTF modellere
- [ ] Ses + titreşim (Vibration API)
- [ ] Dolum hortumu animasyonu, kasa efekti, kızgın müşteri kornası
- [ ] Onboarding / ilk 60 saniye
- [ ] Performans: mobilde 60 fps ölçümü

## v0.4 — Mobil paket ve para

- [ ] **Capacitor** ile iOS/Android sarmalama
- [ ] Analytics — retention, oturum süresi, funnel
- [ ] Ödüllü reklam (AdMob Capacitor eklentisi)
- [ ] IAP: reklamsız + başlangıç paketi
- [ ] Remote config (ekonomiyi build almadan ayarlayabilmek)
- [ ] Bulut kayıt — şu an localStorage, tarayıcı temizlenince ilerleme gidiyor

## v1.0 — Yayın

- [ ] Tam ekonomi dengesi
- [ ] Lokalizasyon: TR + EN
- [ ] Store görselleri, ikon, tanıtım videosu
- [ ] Kapalı test (Play internal testing, TestFlight)
- [ ] Gizlilik politikası + ATT (iOS izleme izni) akışı

## Yayın öncesi kontrol listesi

- [ ] Android keystore oluşturuldu ve **repo dışında** yedeklendi
- [ ] Bundle identifier son hali (isim değişirse burası da değişir)
- [ ] iOS: ATT prompt, App Privacy formu
- [ ] Android: Data safety formu, hedef API seviyesi

## Notlar

- İsim geçici (`Petrolyoner`). Değişirse: repo adı, `package.json`, bundle id, store listing.
- Erken aşamada grafiğe zaman harcama; ilk risk **zamanlama dengesi**, sanat değil.
- Bundle ~135 kB gzip (çoğu Three.js). Mobilde ilk açılış süresi v0.3'te ölçülmeli.
- Proje geçmişi: `21abe9b` Unity petrol sahası, `82c2033` Three.js petrol sahası.
  İstasyon konseptine bu commit'te geçildi; ekonomi/kayıt/biçimlendirme katmanı taşındı.
