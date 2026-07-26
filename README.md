# Petrolyoner

Petrol sahibi simülasyonu / idle tycoon oyunu. Kuş bakışı 3B saha, dikey mobil ekran için.

> **İsim geçici.** "Petrolyoner" (petrol + milyoner) çalışma adı; daha iyi bir isim bulununca değişecek.

## Teknoloji

- **Three.js** (WebGL) + **TypeScript** + **Vite**
- Hedef: mobil tarayıcı (dikey), sonrasında Capacitor ile iOS/Android mağaza paketi

> Proje başlangıçta Unity ile kurulmuştu; `21abe9b` commit'inde Unity sürümü duruyor.
> Three.js'e geçildi çünkü iterasyon çok daha hızlı (build yok, kaydet-yenile) ve
> bu oyun türü ağırlıklı olarak UI + basit geometri.

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
    wells.ts     Kuyu tanımları ve denge değerleri (ayar burada)
    economy.ts   GameEngine: gelir, yükseltme, offline kazanç, tick
    save.ts      localStorage kayıt/yükleme, bozuk kayıt kurtarma
    state.ts     Kayıt veri modeli
    format.ts    K/M/B/T sayı biçimlendirme
  scene/         3B görsel katman
    world.ts     Sahne, ortografik kuş bakışı kamera, ışık, zemin, raycast
    pumpjack.ts  Kuyu modeli ve pompa animasyonu
  ui/hud.ts      DOM arayüzü (sahne üstünde katman)
  main.ts        Bağlayıcı: giriş, ana döngü, yaşam döngüsü
docs/            Tasarım dokümanları
```

**Önemli ayrım:** `src/game/` içindeki hiçbir dosya Three.js import etmez. Görsel katman
tamamen değişse bile oyun mantığı aynı kalır — nitekim Unity'den geçerken bu dosyalar
neredeyse birebir taşındı.

## Denge ayarı

Tüm sayılar [src/game/wells.ts](src/game/wells.ts) içinde. Dev sunucusunda tarayıcı
konsolundan deneme yapabilirsiniz:

```js
__petrolyoner.engine.addMoney(1e6)   // para ekle
__petrolyoner.offline(3)             // 3 saatlik offline ekranını dene
__petrolyoner.reset()                // kaydı sil, baştan başla
__petrolyoner.engine.data.wells      // seviyeleri gör
```

Bu kanca sadece `npm run dev` sırasında var, production build'e girmez.

## Dokümanlar

- [docs/GDD.md](docs/GDD.md) — oyun tasarım dokümanı, temel döngü, ilerleme
- [docs/ROADMAP.md](docs/ROADMAP.md) — sürüm planı ve yapılacaklar

## Kurallar

- Oyun mantığına Three.js sızdırma; `src/game/` saf TypeScript kalsın.
- Para/üretim değerleri için `formatMoney()` kullan, ham sayı basma.
- Kuyuların `id` alanı kayıt dosyasına yazılıyor — yayına çıktıktan sonra değiştirme.
- Keystore, imza sertifikası, `.env` asla commitlenmez.
