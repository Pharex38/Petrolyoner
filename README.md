# Petrolyoner

Akaryakıt istasyonu işletme oyunu. Gelen araçlara doğru yakıtı doğru tutarda ver,
kazandığın parayla yeni pompa aç. Kuş bakışı 3B, dikey mobil ekran için.

> **İsim geçici.** "Petrolyoner" (petrol + milyoner) çalışma adı; daha iyi bir isim
> bulununca değişecek.

## Nasıl oynanır

1. Araç gelir, pompanın yanına yanaşır ve siparişini söyler: **"₺300 Benzin"**
2. Araca dokun → yakıt türü ve tutarı seç → **Doldur**
3. Doğruysa para kasaya girer; yanlış yakıt verirsen müşteri kızıp gider
4. Sabrı biterse de gider — çubuk kırmızıya dönünce acele et
5. Parayla yeni pompa aç, aynı anda daha çok araca bak

## Teknoloji

- **Three.js** (WebGL) + **TypeScript** + **Vite**
- Hedef: mobil tarayıcı (dikey), sonrasında Capacitor ile iOS/Android mağaza paketi

## Çalıştırma

```bash
npm install
npm run dev
```

Tarayıcıda `http://localhost:5173`. Aynı ağdaki telefondan test için terminalde yazan
`Network:` adresini kullanın — gerçek dokunmatik his için şart.

| Komut | İş |
|---|---|
| `npm run dev` | Geliştirme sunucusu (HMR) |
| `npm run build` | Tip kontrolü + production build (`dist/`) |
| `npm run preview` | Build çıktısını yerelde sun |
| `npm run typecheck` | Sadece tip kontrolü |

## Klasör yapısı

```
src/
  game/          Motordan bağımsız oyun mantığı — Three.js'i hiç bilmez
    fuel.ts      Yakıt türleri ve tutar seçenekleri
    slots.ts     Pompa yerleşimi ve açma maliyetleri
    station.ts   Station: araç akışı, servis, pompa açma, gece vardiyası
    save.ts      localStorage kayıt/yükleme, bozuk kayıt kurtarma, şema taşıma
    state.ts     Kayıt veri modeli
    format.ts    K/M/B/T sayı biçimlendirme
  scene/         3B görsel katman
    world.ts     Sahne, ortografik kuş bakışı kamera, ışık, zemin, raycast
    models.ts    Pompa adası, araç ve istasyon binası modelleri
  ui/hud.ts      DOM arayüzü (sahne üstünde katman)
  main.ts        Bağlayıcı: giriş, ana döngü, yaşam döngüsü
docs/            Tasarım dokümanları
```

**Önemli ayrım:** `src/game/` içindeki hiçbir dosya Three.js import etmez. Görsel katman
tamamen değişse bile oyun mantığı aynı kalır.

## Denge ayarı

Sayılar [src/game/slots.ts](src/game/slots.ts) (pompa maliyetleri),
[src/game/fuel.ts](src/game/fuel.ts) (yakıt ve tutarlar) ve
[src/game/station.ts](src/game/station.ts) (süreler, sabır, gece vardiyası) içinde.

Dev sunucusunda tarayıcı konsolundan:

```js
__petrolyoner.station.addMoney(1e5)   // para ekle
__petrolyoner.step(10)                // zamanı 10 saniye ilerlet
__petrolyoner.offline(3)              // 3 saatlik gece vardiyası ekranı
__petrolyoner.reset()                 // kaydı sil, baştan başla
__petrolyoner.station.cars            // sahadaki araçlar
```

`step()` özellikle işe yarar: sekme arka plandayken tarayıcı
`requestAnimationFrame`'i durdurur, bu yüzden otomatik testte oyun bununla sürülür.
Bu kancaların tamamı sadece `npm run dev` sırasında var, production build'e girmez.

## Dokümanlar

- [docs/GDD.md](docs/GDD.md) — oyun tasarım dokümanı, temel döngü, ilerleme
- [docs/ROADMAP.md](docs/ROADMAP.md) — sürüm planı ve yapılacaklar

## Kurallar

- Oyun mantığına Three.js sızdırma; `src/game/` saf TypeScript kalsın.
- Para için `formatMoney()` kullan, ham sayı basma.
- Müşterinin isteyebileceği tutarlar ile oyuncunun seçebileceği tutarlar aynı küme
  olmalı (`AMOUNT_OPTIONS`) — yoksa eşleşmesi imkânsız sipariş üretilir.
- Keystore, imza sertifikası, `.env` asla commitlenmez.
