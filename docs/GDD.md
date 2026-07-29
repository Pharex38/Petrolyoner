# Petrolyoner — Oyun Tasarım Dokümanı

> Taslak. Kararlar netleştikçe güncellenecek.

## Tek cümlelik özet

Tek pompalı küçük bir akaryakıt istasyonunu devralıp, gelen araçlara doğru yakıtı
doğru tutarda vererek büyüten servis/tycoon oyunu.

## Hedef kitle

- Servis-yönetim oyunu oynayan mobil oyuncu (Gas Station Simulator, Idle Miner kitlesi)
- Kısa oturumlar: günde 3-6 kez, 3-6 dakika
- Portre mod, tek elle oynanabilir

## Temel döngü

```
Araç gelir → siparişini söyler → pompaya dokun → renkli nozula basılı tut
     ↑                                                       │
     │                                                hedefte bırak
     │                                                       ↓
     └───────── yeni pompa aç ←── para ←── ödeme ────────────┘
```

1. Araç istasyona girer, boş bir pompanın yanına yanaşır.
2. Kafasının üstünde ₺50 adımlı siparişi belirir: **"₺350 Benzin"**.
3. Oyuncu panelden nozulu seçebilir veya arabanın üzerinde basılı tutarak hızlı
   doluma geçebilir.
4. Sayaç sipariş tutarına geldiğinde nozulu bırakır; hedef aralığı titreşim ve
   yeşil ışıkla anlık geri bildirim verir.
5. Erken/geç bırakma kısa geri bildirimden sonra yeniden denenebilir; yanlış
   yakıt seçimi de süre kaybettirir.
6. Sipariş verilmeden sabrı biterse yine gider; aktif nozul ve başarı geri bildirimi
   boyunca sabır sayacı durur.
7. Biriken parayla yeni pompa açılır → aynı anda daha çok araca bakılır.

**Oyunun zorluğu zamanlama.** Tek pompayla rahat; 4-6 pompa açıkken aynı anda
birden çok sipariş yetiştirmek gerekir.

## Yakıt türleri

| Tür | Renk |
|---|---|
| Dizel | Yeşil |
| Benzin | Kırmızı |
| LPG | Mavi |

Hedef tutarlar **₺50–₺500 arasında ₺50 adımlıdır**. Oyuncu tutarı butondan seçmez;
basılı tuttuğu sürece sayaç akar ve hedef aralığında bırakır.

Her yakıtın 420 litrelik ayrı yeraltı tankı vardır. Servis, sipariş tutarını yakıtın
litre fiyatına bölerek stoktan düşer. Sol üstteki üç bar kalan litreyi gösterir;
bara dokunmak ücretli 10, 30 veya 140 litrelik tanker ikmali çağırır. Tanker ana
yoldan trafik kurallarına uyarak gelir, servis cebine girer ve hortumla boşaltır.
İkmal sürerken ilgili yakıt güvenlik nedeniyle satılamaz; stok boşaltma bitince artar.
Offline vardiya da stok tüketir ve yakıt biterse kazanç durur.
Hortum kapanıp tanker istasyondan çıkışa geçtiği anda sonraki ikmal siparişi
verilebilir; eski tanker yolu açana kadar yeni tanker güvenli sırada bekler.

Müşteri üretimi, stokta karşılanabilen siparişleri olan yakıta ağırlık verir; yine de
az sayıda sürücü başka yakıt isteyebilir. Böylece düşük stokta servis döngüsü çalışır
kalırken depo planlaması önemini korur. Kasa sıfırken ve hiçbir yakıt en küçük siparişi
bile karşılayamazken bir kez **acil ikmal kredisi** açılır: oyuncu 20 L yakıt seçer,
peşin ödeme yapmaz ve borç sonraki başarılı yakıt satışlarının %20'sinden kesilerek
kapanır. Normal küçük ikmal alınabildiği sürece bu yardım görünmez.

Litre fiyatları **Fiyatlar** panelinden ₺1 adımla belirlenir. Düşük fiyat daha sık
müşteri getirir; yüksek fiyat aynı sipariş tutarında daha az litre harcatır fakat
istasyona sapma ihtimalini ve müşteri sabrını düşürür. Araç içeri girdiği andaki
fiyat sipariş boyunca sabitlenir.

## Market

Market yeni oyunda yoktur. ₺15.000 karşılığında şantiye alanına kurulur. Kurulan
binaya dokunmak fiyat panelini açar; kahve, atıştırmalık ve su fiyatları ₺5 adımla
ayarlanır. Her başarılı yakıt müşterisinin bir ürün alma ihtimali vardır. Yüksek
raf fiyatı ürün başına kazancı artırırken satış ihtimalini azaltır.

## Şirket yönetimi

**Yönetim** paneli beş sekmeden oluşur: Özet, Çevre, İşçiler, Rakipler ve Ekonomi.
Bu katman servis mini oyununu kaldırmaz; müşteri talebini, maliyetleri, offline
kazancı ve uzun vadeli yatırım kararlarını değiştirir.

### Hukuk, çevre ve kamuoyu

- Yakıt satışı karbon endeksini, tanker ikmali karbonu ve sızıntı riskini artırır.
- Orta karbon periyodik çevre vergisi doğurur. Yüksek karbon veya sızıntı
  denetimde daha ağır para cezası, itibar/halk desteği kaybı ve istasyon
  girişinde görünür protesto doğurur.
- Denetimler kasayı sıfırlamaz: tahsilat mevcut kasanın sınırlı bir payıdır;
  kasa boşken yeni ceza uyarıları durur ve oyuncu servis vererek toparlanır.
- Güvenlik yatırımı kaza, sızıntı ve ceza ihtimalini azaltır.
- Gerçek temizlik sızıntı riskini düşürür. Yeşil imaj kampanyası yalnızca kamuoyu
  ve itibarı yükseltir; karbon ile sızıntıyı bilerek değiştirmez.
- Protesto sürerken müşteri talebi ve offline kazanç azalır.

### Nitelikli personel ve sendika

| Personel | Özellik | Sonuç |
|---|---|---|
| Engin Usta | Sarhoş mühendis | Üretime katkı sağlar fakat hasar ve sızıntı kazası çıkarabilir |
| Dr. Selin | Dahi jeolog | Üretim verimi, casusluk ve gizli rezerv keşfi avantajı |
| Murat Şef | Sendikacı vardiya şefi | Memnuniyeti korur ve sendika baskısını azaltır |

İşçiler tek seferlik işe alım bedeli ve her oyun gününde maaş ister. Maaş,
güvenlik ve çalışma koşulları ortak memnuniyet hedefini belirler. Düşük memnuniyet
sendika baskısını yükseltir; baskı tavana ulaşınca grev başlar, ham petrol üretimi
ve market satışı grev boyunca tamamen durur.

### AI rakipler ve casusluk

Kuzey Enerji, MaviPet ve Bozkır Petrol kendi kasası, rezervi, morali ve güvenlik
seviyesiyle sürekli üretir. Rakipler fiyat savaşı başlatabilir veya oyuncunun
işçilerine yüksek maaş teklif ederek sendika baskısını büyütebilir. Oyuncu:

- rezerv ve kasa bilgisini açan istihbarat operasyonu yapabilir,
- rakip işçileri greve teşvik ederek üretimi geçici durdurabilir.

Başarı rakip güvenliği ve dahi jeolog bonusuna bağlıdır. Yakalanan casus itibar
kaybettirir, rakip güvenliğini ve hukuki takip riskini artırır.

### Küresel ekonomi, depolama ve kara borsa

Petrol fiyatı doğal piyasa dalgasına ek olarak küresel çatışma, resesyon, temiz
teknoloji atılımı, ambargo ve yeni rezerv keşfinden etkilenir. Canlı fiyat tanker
ikmal maliyetini de değiştirir. Kiralanan işçiler kanıtlanmış rezervden ham petrol
üretir; kapasite dolunca üretim durur.

Oyuncu düşük fiyat döneminde 100 varillik partiler alabilir, sahada görünür
devasa tanklar kurarak kapasiteyi büyütebilir ve yükselişte yasal piyasaya
satabilir. Kara borsa ağı daha yüksek çarpanla satış açar. Her işlem takip riskini
büyütür; yakalanırsa gelire el konur, ek ceza kesilir ve protesto başlar.

## Pompalar ve ilerleme

6 pompa, sol/sağ ikili sıralar halinde. İlki bedava açık gelir.

| Pompa | Maliyet |
|---|---|
| 1 | bedava |
| 2 | ₺2.500 |
| 3 | ₺7.000 |
| 4 | ₺18.000 |
| 5 | ₺45.000 |
| 6 | ₺110.000 |

Araç ~5,5 saniyede bir gelir ve **boş pompa yoksa hiç gelmez** — yani pompa sayısı
doğrudan kapasite demek. Kuyruk mekaniği bilerek v0.1'e alınmadı (bkz. Açık sorular).

## Zamanlama değerleri

| Değer | Süre |
|---|---|
| Müşteri sabrı | 24 sn |
| Yanaşma | 2,4 sn |
| Dolum sayacı | ₺150/sn |
| Hortum bitiriş animasyonu | 1,15 sn |
| Depo kapasitesi | 420 L / yakıt |
| Tanker partisi | 10 / 30 / 140 L |
| Tanker boşaltma | 6,2 sn + görünür giriş/çıkış rotası |
| Ayrılma | 2,2 sn |

## Gece vardiyası (offline)

Oyun kapalıyken pompa başına saniyede ₺2, en fazla 4 saat. Aktif oynanan bir oyun
olduğu için bilerek düşük tutuldu — amaç geri dönüşü ödüllendirmek, oynamamayı değil.

## Pompacılar

Yönetim → İşçiler sekmesinden tutulur. En küçük numaralı açık pompalardan başlayarak
atanır; ilk pompacı ₺25.000, her yenisi ×1.9.

Pompacı, beklemeye başlayan aracı **2,8 saniye sonra** kendisi doldurur. Bu gecikme
bilerek var: oyuncu yetişirse tam parayı alır. Otomatik serviste tutarın **%20'si**
pompacıya gider. Maaş yerine komisyon seçildi — kendiliğinden ölçeklenir ve elle
servisi her zaman kârlı tutar.

## Trafik yönü

Sağdan (Türkiye) veya soldan trafik seçilebilir. Yol ve istasyon yerinde kalır;
şeritler ters akar ve istasyonun giriş/çıkış kapıları rol değiştirir.

## Sonraki katmanlar (v0.2+)

- **Kuyruk:** pompalar doluyken araçlar sıraya girer, sabır daha hızlı erir
- **Otomasyon:** mevcut nitelikli personele pompa otomasyonu görevleri
- **Farklı araç tipleri:** kamyon (büyük tutar, uzun doldurma), motosiklet (küçük, hızlı)

## Monetizasyon

Reklam ağırlıklı, IAP destekli. Agresif değil.

- **Ödüllü reklam:** 2x kazanç 4 saat / gece vardiyasını ikiye katla / anlık nakit
- **Geçiş reklamı:** sadece pompa açılışlarında, seyrek
- **IAP:** reklamsız, başlangıç paketi
- Kesinlikle yok: enerji/can sistemi, ilerlemeyi bloklayan paywall

## Sanat yönü

- Kuş bakışı, ortografik kamera (~60° eğim) — tüm pompalar eşit kolaylıkta seçilebilir
- Sade, biraz karikatürize; kirli/fotogerçekçi değil
- Palet: asfalt grisi + beton + yakıt renkleri (yeşil/kırmızı/mavi) + turkuaz UI vurgusu
- İstasyon büyüdükçe ekran daha "dolu" görünmeli: daha çok pompa, daha çok araç
- 3 dakikalık hızlandırılmış gece–gündüz döngüsü; gece istasyon ışıkları, kısa
  çift farlar ve selektör spotları çevreyi gerçekten aydınlatır
- Polis/ambulans tepe lambaları zemine mavi-kırmızı ışık düşürür; siren boyunca
  istasyon çıkışı kilitlenir
- Bozulan araç omuza geçer, çekici tarafından alınır; ayrı çekici olayı yakıtı
  biten müşteriyi ayrı girişten getirip rampadan indirebilir
- Market binası yeni oyunda bulunmaz; şantiye alanına ₺15K karşılığında
  sonradan kurulur; öncesinde kazı, toprak yığını, duba ve bariyerler görünür
- Ara sıra başlayan rüzgâr yönüyle uyumlu yağmur gökyüzünü karartır ve trafiği yavaşlatır
- Yol kenarı lambaları gece gerçek ışık yayar; kuş sürüsü ve leylek uçuşları
  gökyüzünü hareketlendirir
- Tanker ve çekici ana yoldan gelir; çekici müşteriyi ayrılmış pompanın park
  konumuna doğrudan rampayla indirir
- Gece, sahanın çevresi kısa soğuk beyaz direklerle; ana yol ise aşağı yönlü
  sıcak sokak lambalarıyla okunur kalır.
- Depolama yatırımları istasyon kenarında metal tanklar olarak görünür; protesto
  süresince pankartlı kalabalık girişte kalır

## Ses

- Pompa çalışma sesi, dolum bitince "klik"
- Kasa sesi her ödemede
- Müşteri yanaşma kornası ve trafikte sabırsız sürücü kornası
- Polis ve ambulans görünür olduğu sürece frekans taramalı siren
- Üstü açık bass aracında ritmik synth loop, subwoofer ve neon darbesi

## Açık sorular

- [ ] Kuyruk olmalı mı, yoksa "boş pompa yoksa araç gelmez" yeterli mi?
- [ ] Yanlış yakıt cezası çok mu sert? (şu an: hiç para yok)
- [x] Tutar seçimi: basılı tutup hedefte bırakılan dolum sayacı
- [x] Oyuncunun belirlediği yakıt fiyatı talebi ve litre tüketimini etkiler
