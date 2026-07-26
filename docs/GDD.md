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
Araç gelir → siparişini söyler → pompaya dokun → yakıt türü + tutar seç
     ↑                                                      │
     │                                                  doldur
     │                                                      ↓
     └──────── yeni pompa aç ←── para ←── ödeme ────────────┘
```

1. Araç istasyona girer, boş bir pompanın yanına yanaşır.
2. Kafasının üstünde siparişi belirir: **"₺300 Benzin"**.
3. Oyuncu araca/pompaya dokunur, açılan panelden yakıt türü ve tutarı seçer.
4. Doğru seçim → doldurma animasyonu → ödeme alınır, araç mutlu ayrılır.
5. Yanlış yakıt veya yanlış tutar → müşteri kızar, para ödemeden gider.
6. Sipariş verilmeden sabrı biterse yine gider (kaçan müşteri).
7. Biriken parayla yeni pompa açılır → aynı anda daha çok araca bakılır.

**Oyunun zorluğu zamanlama.** Tek pompayla rahat; 4-6 pompa açıkken aynı anda
birden çok sipariş yetiştirmek gerekir.

## Yakıt türleri

| Tür | Renk |
|---|---|
| Dizel | Yeşil |
| Benzin | Kırmızı |
| LPG | Mavi |

Tutarlar sabit seçeneklerden: **₺100 / ₺200 / ₺300 / ₺500**. Müşterinin isteyebileceği
küme ile oyuncunun seçebileceği küme birebir aynı — yoksa eşleşmesi imkânsız sipariş
üretilir.

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
| Doldurma | 2,6 sn |
| Ayrılma | 2,2 sn |

## Gece vardiyası (offline)

Oyun kapalıyken pompa başına saniyede ₺2, en fazla 4 saat. Aktif oynanan bir oyun
olduğu için bilerek düşük tutuldu — amaç geri dönüşü ödüllendirmek, oynamamayı değil.

## Sonraki katmanlar (v0.2+)

- **Kuyruk:** pompalar doluyken araçlar sıraya girer, sabır daha hızlı erir
- **Market:** ödeme sırasında ek satış (kahve, sigara) → sipariş başına ekstra kâr
- **Personel:** bir pompayı otomatik çalıştıran görevli
- **Yakıt stoğu:** depo bitince tanker çağırma
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

## Ses

- Pompa çalışma sesi, dolum bitince "klik"
- Kasa sesi her ödemede
- Kızgın müşteri kornası — kaçırmanın bedeli duyulsun

## Açık sorular

- [ ] Kuyruk olmalı mı, yoksa "boş pompa yoksa araç gelmez" yeterli mi?
- [ ] Yanlış yakıt cezası çok mu sert? (şu an: hiç para yok)
- [ ] Tutar seçimi sabit butonlar mı kalsın, yoksa kaydırma çubuğu mu?
- [ ] Yakıt fiyatı dalgalansın mı? (gerçekçi ama karmaşıklık katıyor)
