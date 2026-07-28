# Yol Haritası

## v0.1 — Oynanabilir çekirdek ✅

Amaç: servis döngüsünün eğlenceli olup olmadığını anlamak. Grafikler stilize
primitiflerden oluşuyor; ayrıntı ve okunabilirlik cilası eklendi.

- [x] Kuş bakışı 3B istasyon (ortografik kamera, 6 pompa yeri, geniş tek yönlü saha)
- [x] Araç akışı: giriş → pompaya yanaşma → bekleme → doldurma → çıkış
- [x] Sipariş etiketi (yakıt rengi + tutar) ve sabır çubuğu
- [x] Renkli nozula basılı tutup hedef tutarda bırakma paneli
- [x] Doğru servis → ödeme; yanlış yakıt/tutar → müşteri kızgın ayrılır
- [x] Sabır bitince müşteri kaçar
- [x] Pompa açma ve maliyetleri
- [x] localStorage kayıt, bozuk kayıt kurtarma, v1'den şema taşıma
- [x] Gece vardiyası (offline kazanç)
- [x] Dev konsol kancası (denge denemesi ve zamanı elle ilerletme)
- [x] Ayrı giriş/çıkış, rezervasyonlu çakışmasız pompa rotaları ve güvenli yol birleşimi
- [x] Ayrıntılı araç/pompa/bina primitif modelleri
- [x] ₺50 adımlı siparişler, kalıcı yakıt stokları ve tanker ikmali
- [x] Arabaya uzun basarak doğrudan dolum
- [x] Gece–gündüz, yolu aydınlatan farlar ve giriş/çıkış sinyalleri
- [x] Korna, kaçınma ve hızlanma dahil genişletilmiş trafik olayları
- [x] Aktif dolum sırasında sabrı dondurma
- [x] Çift far havuzu, çevreyi aydınlatan acil araç tepe lambaları
- [x] Bozulan araç çekicisi ve yaklaşma–indirme–ayrılma animasyonlu yakıt teslimatı
- [x] Başlangıçta market şantiyesi ve ₺15K karşılığında kalıcı bina inşası
- [x] Trafiği durduran polis/ambulans geçişi ve eşzamanlı Web Audio sireni
- [x] Kazı, toprak, duba ve bariyerli market şantiyesi; yol seviyesinde ayrı kapılar
- [x] Kalıcı yakıt/market fiyatları ve fiyat-talep ekonomisi
- [x] Market binasına dokunarak ürün fiyatı yönetimi ve ek ürün satışları
- [x] Aralıklı yağmur, yağmurda yavaşlayan trafik, kuş/leylek uçuşları
- [x] Gece yanan yol kenarı lambaları
- [x] Ana yoldan gelen, servis cebinde hortum bağlayan fiziksel yakıt tankeri
- [x] İkmal sürerken ilgili yakıtı kilitleme ve yarım teslimatı kayıtta sürdürme
- [x] Çekicinin müşteriyi ayrılmış pompa cebine doğrudan indirmesi

**Karar noktası:** Bu haliyle 10 dakika oynanıyor mu?

Bilinen eksikler:
- Pompa motoru ve çevresel ambiyans sesi henüz yok
- Kamera sabit — kaydırma/yakınlaştırma yok
- Doldurma paneli açıkken alt sıradaki pompalar panelin altında kalıyor

## Bu turda eklenenler

- [x] Müşteri akışı göstergesi (üst bar, yön oku + kademe rengi)
- [x] Pompacı: gelen aracı otomatik dolduran personel (komisyonlu)
- [x] Trafik yönü ayarı (sağdan / soldan)
- [x] Haritada kaydırma ve yakınlaştırma
- [x] Yönetim/Fiyatlar paneli açıkken oyun duraklar

## v0.2 — Derinlik

- [ ] Kuyruk: pompalar doluyken araçlar sıraya girsin
- [x] Kurulmuş markette ödeme sırasında ek satış
- [x] Nitelikli personel, özellikler, bordro, memnuniyet, sendika ve grev
- [x] Yakıt stoğu ve tanker çağırma
- [x] Değişken toptan maliyet ve ikmal sırasında satış kilidi
- [x] Çevre vergisi/cezası, sızıntı, protesto, temizlik ve greenwashing
- [x] Üç AI rakip, fiyat savaşı, işçi avı, rezerv casusluğu ve grev sabotajı
- [x] Küresel krizler ve canlı petrol fiyatı
- [x] Ham petrol üretimi, alım/satım ve sahada görünen dev depolama tankları
- [x] Yakalanma riski, el koyma ve ceza içeren kara borsa
- [x] Beş sekmeli mobil şirket yönetimi ve olay günlüğü
- [x] Kayıt şeması v6 ve eski kayıtlardan yönetim/tanker migrasyonu
- [ ] Farklı araç tipleri (kamyon, motosiklet)
- [ ] Zorluk eğrisi: pompa sayısı arttıkça araç sıklığı artsın

## v0.3 — Cila ve his

- [ ] Sanat geçişi: primitif geometriden glTF modellere
- [ ] Ses: dolum motoru, çevresel ambiyans
- [x] Web Audio ile yanaşma/trafik kornası ve kasa efekti
- [x] Bass aracı için synth loop, subwoofer ve neon görseli
- [x] Dolum hedefi ve başarı için titreşim (Vibration API)
- [x] Dolum hortumu ve pompa sayaç animasyonu
- [ ] Onboarding / ilk 60 saniye
- [ ] Performans: mobilde 60 fps ölçümü
- [x] Görünür far ışığı bütçesi, düşük mobil piksel oranı ve parçalı Three.js build
- [x] Tek çizim çağrılı yağmur ve yeniden kullanılan kuş/leylek modelleri
- [x] Yağmur çizgisiyle aynı vektörde rüzgârlı damla hareketi
- [x] Yönetim hesaplarını kare başı Three.js işinden ayrıştırma; paneli 300 ms aralıkla yenileme

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
- Build Three.js renderer/core ve oyun kodunu ayrı önbelleklenebilir parçalara böler.
  Mobilde ilk açılış süresi ve gerçek cihaz FPS'i ayrıca ölçülmeli.
- Proje geçmişi: `21abe9b` Unity petrol sahası, `82c2033` Three.js petrol sahası.
  İstasyon konseptine bu commit'te geçildi; ekonomi/kayıt/biçimlendirme katmanı taşındı.
