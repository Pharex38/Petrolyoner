# Petrolyoner

Akaryakıt istasyonu işletme oyunu. Gelen araçlara doğru yakıtı doğru tutarda ver,
kazandığın parayla yeni pompa aç. Kuş bakışı 3B, dikey mobil ekran için.

> **İsim geçici.** "Petrolyoner" (petrol + milyoner) çalışma adı; daha iyi bir isim
> bulununca değişecek.

## Nasıl oynanır

1. Araç gelir, sinyal verip pompanın yanına yanaşır ve siparişini söyler: **"₺350 Benzin"**
2. Araca dokunup nozulu seç veya arabanın üstünde basılı tut; sayaç hedefe gelince bırak
3. Hedefi kaçırırsan süre tükenmeden yeniden dene; doğruysa para kasaya girer
4. Sabrı biterse gider; nozul gerçekten açıkken sayaç durur ve dolum ortasında kaçmaz
5. Sol üstteki depo barlarını takip et; bara dokunup yoldan gelecek tankeri çağır
6. **Fiyatlar** düğmesinden litre fiyatlarını yönet; pahalı yakıtın talebi düşürdüğünü unutma
7. Parayla yeni pompa aç; ₺15K biriktirince şantiye alanına marketi kur
8. Kurulan market binasına dokunup kahve, atıştırmalık ve su fiyatlarını ayarla

Siparişler ₺50–₺500 arasında ₺50 adımlarla gelir. Hızlandırılmış gece–gündüz
döngüsünde trafik çift kısa farını yakar; sıkışan sürücü gündüz korna, gece
selektör kullanır. Araçlar ayrı kapılardan girip çıkar; rota rezervasyonu hem saha
içinde hem yol birleşiminde gövdelerin üst üste binmesini önler. Çekici bozulan
aracı götürür, bazen de yakıtı biten müşteriyi istasyona getirip görünür biçimde
indirir. Sollama, kaçınma ve sirenli acil araç gibi yol olayları devam eder.
Ara sıra yağmur yağar ve trafik yavaşlar; yol lambaları geceleri çevreyi
aydınlatırken kuş sürüleriyle leylekler istasyonun üzerinden geçer.

**Yönetim** paneli servis döngüsünün üstündeki şirket simülasyonudur. Nitelikli
personel kiralanabilir; maaş, güvenlik ve çalışma koşulları sendika baskısını ve
grevleri belirler. Çevre yükü ceza ve protesto doğurur; gerçek temizlik ya da
karbonu değiştirmeyen yeşil imaj kampanyası seçilebilir. Üç AI rakibin rezervleri
casuslukla öğrenilebilir, işçileri greve teşvik edilebilir. Küresel savaş,
resesyon, ambargo, teknoloji ve rezerv olayları petrol fiyatını değiştirir.
Oyuncu dev tanklar kurup ham petrol stoklayabilir; kara borsa daha yüksek kazanç
karşılığında yakalanma, para cezası ve itibar kaybı riski taşır.

Yakıt ikmali anlık değildir: ücret ödenince tanker ana yoldan gelir, ayrı servis
cebine girip hortumunu bağlar. Boşaltma boyunca o yakıt satılamaz; stok ancak
hortum kapandığında artar. Yarım kalan teslimat kayıt sürümü 6 ile saklanır ve
oyun yeniden açıldığında tanker yolculuğu baştan görünür biçimde devam eder.

## Teknoloji

- **Three.js** (WebGL) + **TypeScript** + **Vite**
- Hedef: mobil tarayıcı (dikey), sonrasında Capacitor ile iOS/Android mağaza paketi

## Çalıştırma

```bash
pnpm install
pnpm dev
```

Tarayıcıda `http://localhost:5173`. Aynı ağdaki telefondan test için terminalde yazan
`Network:` adresini kullanın — gerçek dokunmatik his için şart.

| Komut | İş |
|---|---|
| `pnpm dev` | Geliştirme sunucusu (HMR) |
| `pnpm build` | Tip kontrolü + production build (`dist/`) |
| `pnpm preview` | Build çıktısını yerelde sun |
| `pnpm typecheck` | Sadece tip kontrolü |

## Klasör yapısı

```
src/
  game/          Motordan bağımsız oyun mantığı — Three.js'i hiç bilmez
    fuel.ts      Yakıt türleri ve tutar seçenekleri
    management.ts Hukuk, personel, rakipler, krizler, depolama ve kara borsa
    market.ts    Market ürünleri, fiyat aralıkları ve satış ihtimali
    slots.ts     Pompa yerleşimi ve açma maliyetleri
    station.ts   Station: araç akışı, servis, pompa açma, gece vardiyası
    save.ts      localStorage kayıt/yükleme, bozuk kayıt kurtarma, şema taşıma
    state.ts     Kayıt veri modeli
    format.ts    K/M/B/T sayı biçimlendirme
  audio/         Web Audio ile üretilen korna, kasa, siren ve bass müziği
  scene/         3B görsel katman
    world.ts     Sahne, ortografik kuş bakışı kamera, ışık, zemin, raycast
    ambient.ts   Yağmur, kuş/leylek uçuşları ve yol aydınlatması
    models.ts    Pompa adası, araç ve istasyon binası modelleri
  ui/
    hud.ts       Servis, stok, fiyat ve sahne üstü geri bildirim
    management-panel.ts Şirket yönetimi için beş sekmeli DOM arayüzü
  main.ts        Bağlayıcı: giriş, ana döngü, yaşam döngüsü
docs/            Tasarım dokümanları
```

**Önemli ayrım:** `src/game/` içindeki hiçbir dosya Three.js import etmez. Görsel katman
tamamen değişse bile oyun mantığı aynı kalır.

## Denge ayarı

Sayılar [src/game/slots.ts](src/game/slots.ts) (pompa maliyetleri),
[src/game/fuel.ts](src/game/fuel.ts) (yakıt, fiyat-talep, stok ve tutarlar),
[src/game/market.ts](src/game/market.ts) (ürün fiyat-talep dengesi) ve
[src/game/station.ts](src/game/station.ts) (süreler, sabır, gece vardiyası) içinde.
Şirket olayları, riskler ve yatırım maliyetleri
[src/game/management.ts](src/game/management.ts) içindedir.

Dev sunucusunda tarayıcı konsolundan:

```js
__petrolyoner.station.addMoney(1e5)   // para ekle
__petrolyoner.step(10)                // zamanı 10 saniye ilerlet
__petrolyoner.offline(3)              // 3 saatlik gece vardiyası ekranı
__petrolyoner.time(22)                // gece ışıklarını anında dene
__petrolyoner.reset()                 // kaydı sil, baştan başla
__petrolyoner.station.cars            // sahadaki araçlar
```

`step()` özellikle işe yarar: sekme arka plandayken tarayıcı
`requestAnimationFrame`'i durdurur, bu yüzden otomatik testte oyun bununla sürülür.
Bu kancaların tamamı sadece `pnpm dev` sırasında var, production build'e girmez.

Production build'de Three.js renderer/core kodu ayrı önbelleklenebilir parçalara
bölünür. Mobilde gerçek far spotları görünür araçlarla sınırlandırılır, piksel oranı
dengelenir ve canlı WebGL üstündeki pahalı panel blur'u kapatılır.

## Dokümanlar

- [docs/GDD.md](docs/GDD.md) — oyun tasarım dokümanı, temel döngü, ilerleme
- [docs/ROADMAP.md](docs/ROADMAP.md) — sürüm planı ve yapılacaklar

## Kurallar

- Oyun mantığına Three.js sızdırma; `src/game/` saf TypeScript kalsın.
- Para için `formatMoney()` kullan, ham sayı basma.
- Müşteri hedef tutarları `AMOUNT_OPTIONS` içinden gelir; dolum sayacının üst sınırı
  bu listenin en yüksek değerini kapsamalı.
- Keystore, imza sertifikası, `.env` asla commitlenmez.

## Yazarlar

- **Alperen Kocakaplan** — [@Pharex38](https://github.com/Pharex38)
- **Berce** — [@bercedev](https://github.com/bercedev)
