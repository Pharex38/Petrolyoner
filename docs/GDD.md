# Petrolyoner — Oyun Tasarım Dokümanı

> Taslak. Kararlar netleştikçe güncellenecek.

## Tek cümlelik özet

Bir tek kuyuyla başlayıp, sondaj yapıp yükselterek dünyanın en büyük petrol imparatorluğunu kuran idle/tycoon oyunu.

## Hedef kitle

- Idle tycoon oynayan mobil oyuncu (Idle Miner, Adventure Capitalist, Oil Tycoon kitlesi)
- Kısa oturumlar: günde 3-6 kez, 2-5 dakika
- Portre mod, tek elle oynanabilir

## Temel döngü

```
Sondaj / tıkla  →  petrol üret  →  sat, para kazan  →  yükselt
       ↑                                                   │
       └───────────  yeni kuyu / yeni saha aç  ←───────────┘
```

1. Oyuncu kuyuya dokunarak veya otomatik pompayla petrol üretir.
2. Petrol depoya dolar; depo dolunca üretim durur (yükseltme baskısı).
3. Petrol satılır → para.
4. Parayla: kuyu seviyesi, pompa hızı, depo kapasitesi, nakliye hızı yükseltilir.
5. Yeterli sermaye birikince yeni saha açılır.

## İlerleme / sahalar

Her saha bir "bölüm"; yeni saha açmak ana ilerleme hissi.

| # | Saha | Tema |
|---|---|---|
| 1 | Batman | Başlangıç, tek kuyu, toprak yol, traktör |
| 2 | Adıyaman | İlk rafineri, kamyon nakliyesi |
| 3 | Trakya | Doğalgaz mekaniği eklenir |
| 4 | Basra Körfezi | Ölçek büyür, boru hattı |
| 5 | Kuzey Denizi | Deniz platformu, hava koşulu olayları |
| 6 | Teksas | Rakip şirketler, borsa mekaniği |
| 7 | Sibirya | Donma / bakım mekaniği |
| 8 | Derin Deniz | Geç oyun, çok yüksek çarpanlar |

Türkiye'den başlamak yerel pazarda güçlü bir bağ kuruyor; Batman gerçekten Türkiye'nin petrol şehri.

## Üretim zinciri

Basit tutulacak, katman katman açılacak:

```
Kuyu → Depo → Nakliye (kamyon/boru/tanker) → Rafineri → Satış
```

- **v0.1**: sadece Kuyu → Para (zincir yok)
- **v0.2**: Depo kapasitesi + nakliye darboğazı
- **v0.3**: Rafineri (ham petrol → benzin, daha yüksek fiyat)

## Yükseltmeler

| Tür | Etki |
|---|---|
| Kuyu seviyesi | Varil/saniye artar |
| Pompa | Üretim çarpanı |
| Depo | Kapasite (offline birikim için kritik) |
| Nakliye | Satış hızı |
| Yönetici | Otomasyon — o kuyuyu elle dokunmadan çalıştırır |

Maliyet formülü: `cost = baseCost * costGrowth ^ level`, `costGrowth ≈ 1.15`.

## Prestij — "Sahayı Sat"

Oyuncu tüm imparatorluğu satıp sıfırdan başlar; karşılığında kalıcı çarpan kazanır.

- Para birimi: **Hisse** (kalıcı)
- Formül taslağı: `hisse = floor(sqrt(toplamKazanç / 1e12))`
- Her hisse kalıcı **+%2 gelir**
- İlk prestij ~2-3 saatlik oyunda erişilebilir olmalı, yoksa oyuncu döngüyü hiç görmez.

## Offline kazanç

- Baz: **4 saat** (yükseltme + reklamla uzatılır)
- Offline verim: aktif gelirin **%50**'si (aktif oynamayı ödüllendirmek için)
- Dönüşte "Yokken 3sa 12dk'da ₺4.2M kazandın" ekranı → 2x için reklam butonu

## Monetizasyon

Reklam ağırlıklı, IAP destekli. Agresif değil.

- **Ödüllü reklam** (ana kaynak): 2x gelir 4 saat / offline kazancı ikiye katla / anlık nakit
- **Geçiş reklamı**: sadece saha değişiminde, seyrek
- **IAP**: reklamsız (₺149), başlangıç paketi, hisse paketleri
- Kesinlikle yok: enerji/can sistemi, ilerlemeyi bloklayan paywall

## Sanat yönü

- 2D, sıcak ve biraz karikatürize; kirli/endüstriyel değil
- Palet: kum sarısı + petrol siyahı + turkuaz (UI vurgu)
- Sayılar büyüdükçe ekran daha "zengin" görünmeli: traktör → kamyon → tanker → helikopter

## Ses

- Ritmik pompa sesi (oyunun imzası olabilir)
- Para sesi her satışta, pitch kazanca göre yükselir

## Açık sorular

- [ ] Tıklama mı tamamen idle mi? (öneri: erken oyunda tıklama, sonra otomasyon)
- [ ] Online özellik olacak mı? (lider tablosu / klan) — v1'de hayır
- [ ] Petrol fiyatı dalgalanacak mı? (borsa mekaniği eğlenceli ama karmaşıklık katıyor)
