# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje

Petrolyoner — akaryakıt istasyonu işletme oyunu. Three.js + TypeScript + Vite, kuş bakışı 3B,
dikey mobil ekran hedefli. İsim geçici (petrol + milyoner).

Kod yorumları, commit mesajları ve arayüz metinleri **Türkçe**; tanımlayıcılar İngilizce.
Bu karışımı koru.

## Komutlar

Paket yöneticisi **pnpm** ve `package.json` içindeki `packageManager` alanıyla sürüme
sabitlenmiş. `npm install` çalıştırma — `pnpm-lock.yaml` ile çakışan bir lock dosyası üretir.

```bash
pnpm install
pnpm dev        # http://localhost:5173, host:true (aynı ağdaki telefondan da açılır)
pnpm build      # tsc --noEmit && vite build
pnpm typecheck
```

Test altyapısı yok — test yok, lint yok. Doğrulama `pnpm typecheck` + tarayıcıda elle
denemekten ibaret. tsconfig sıkı: `strict`, `noUnusedLocals`, `noUncheckedIndexedAccess`,
`verbatimModuleSyntax` (tip importları `import type` olmalı).

## Mimarinin bel kemiği

### Katman kuralı

`src/game/` **hiçbir** dosyada Three.js import etmez ve etmemeli. Oyun mantığı motordan
bağımsızdır; görsel katman baştan yazılsa da bu klasör aynı kalır. (Proje Unity'den
Three.js'e taşındığında bu katman neredeyse birebir aktarıldı.) Yeni oyun kuralı yazarken
`src/game/` içine koy, sahne nesnesine erişme ihtiyacı duyuyorsan callback ile dışarı çık.

- `src/game/` — saf mantık: `station.ts` (servis döngüsü), `management.ts` (şirket simülasyonu),
  `fuel.ts`, `market.ts`, `slots.ts`, `traffic.ts` (sağ/sol trafik yönü), `save.ts`,
  `state.ts`, `format.ts`
- `src/scene/` — Three.js: `world.ts`, `models.ts`, `ambient.ts`
- `src/ui/` — DOM katmanı: `hud.ts`, `management-panel.ts` (sahnenin üstünde HTML overlay,
  canvas içi UI yok)
- `src/audio/sound.ts` — Web Audio ile üretilen sesler, örnek dosyası yok
- `src/main.ts` — tek bağlayıcı; tüm callback'ler burada bağlanır

### Kare döngüsü

`main.ts` içindeki `step(delta)` sabit sıra ile çalışır ve bu sıra önemlidir:

```
world.updateTraffic(delta)      → yol trafiği ilerler, giriş kapısına gelen NPC'ler haber verir
station.tick(delta, aktifSlot)  → oyun mantığı, oyun saati de burada ilerler
world.setDayPhase(...)          → saat sahneye taşınır (ışık, gökyüzü, farlar)
station.takeDayReport()         → gece yarısını geçtiysek kapanış özeti
world.syncCars / render         → mantıktaki arabalar mesh'lere yansır
hud.update / syncCarLabels      → DOM güncellenir
```

`station.tick`'in ikinci parametresi o an servis edilen pompadır; nozul açıkken müşterinin
sabrı **donar**. HUD bu bilgiyi `hud.activeServiceSlotIndex` ile verir.

### Trafik → müşteri devri

Müşteriler yoktan üretilmez. Ana yolda dolaşan gerçek bir NPC aracı istasyon girişine
ulaşınca `world.onTrafficCarAtEntrance` tetiklenir, `station.acceptTrafficCar(color)` boş
pompa varsa onu müşteriye çevirir. **Aynı mesh** pompaya taşınır, yeni araç yaratılmaz.
Ters yönde `station.canAdvanceCar`, sahne katmanına "bu araç ilerleyebilir mi" diye sorar
(rota rezervasyonu, gövde çakışmasını önler). Bu iki callback mantık ve sahneyi
birbirine bağlayan tek yerdir; sırayı bozarsan araçlar üst üste biner.

### Oyun saati ve gün

Saat `game/clock.ts` içinde tanımlı, `DAY_CYCLE_SECONDS` bir oyun gününün gerçek
süresidir. Faz **oyun katmanında** ilerler (`station.advanceClock`) ve kayda yazılır;
sahne yalnızca `world.setDayPhase()` ile aldığı değeri ışığa çevirir. Sahnenin kendi
saatini tutmasına dönme — gün sayacı kaydedilmek zorunda.

Gece yarısını geçen kare, `station.takeDayReport()` ile bir kapanış özeti üretir.
Rapor `data.dayOpening` fotoğrafından fark alınarak çıkar, sonra fotoğraf tazelenir.
`takeDayReport()` **tüketicidir**: ikinci çağrıda null döner, aynı gün iki kez
raporlanmaz. HUD paneli açıkken `hud.isGamePaused` true olur, döngü durur.

### Kayıt ve şema göçü

`SAVE_VERSION` şu an **9**, localStorage anahtarı `petrolyoner.save`.
`PlayerData`'ya alan eklerken:

1. `state.ts` içinde alanı ve `createNewGame()` varsayılanını ekle
2. `SAVE_VERSION`'ı artır
3. `save.ts` içindeki `migrate()` fonksiyonuna taşıma adımını yaz

`migrate()` savunmacıdır: gelen her alanı tip kontrolünden geçirir ve eksikse
`createNewGame()` değerine düşer, böylece eski kayıtlar kırılmaz. Yönetim durumu ayrıca
`management.ts` içindeki `normalizeManagementState()` ile normalize edilir. Bozuk kayıt
silinmez, `petrolyoner.save.corrupt.<zaman>` olarak kenara alınır.

## Trafik yönü

Sağdan/soldan trafik ayarlanabilir (`game/traffic.ts`, kayda yazılır). Yol ve istasyon
yerinde kalır; şeritlerin yönü tersine döner ve giriş/çıkış kapıları rol değiştirir.

Rotalar yeniden çizilmez: `world.ts` içindeki `flow()`, `gateIn()`, `gateOut()`
yardımcılarıyla kapıya göre olan **z ofsetleri akış yönüyle çarpılır**, x değerleri
sabit kalır. Yeni bir rota noktası eklerken bu kurala uy, yoksa soldan trafikte
araçlar kaldırımdan geçer. İstisna: yakıt tankeri, deposu z=15.2'de sabit bir yapı
olduğu için her iki yönde de alt kapıyı kullanır.

## Tuzaklar

**`pagehide` kaydı ezer.** Sayfa yenilenirken `pagehide` tetiklenip canlı durumu diske
yazar. Kaydı silip sayfayı yenileyen her akış (`__petrolyoner.reset()` gibi) önce
`savingEnabled = false` yapmak zorunda; yoksa silme işlemi sessizce geri alınır.

**Sekme arka plandayken `requestAnimationFrame` durur.** Otomatik/başsız tarayıcıda
`document.hidden === true` olduğu için oyun kendiliğinden ilerlemez. Zamanı elle sürmek
gerekir (aşağıdaki `step()`). "Ekranda para artıyor" gözlemine güvenme.

**Sipariş tutarları türetiliyor.** `AMOUNT_OPTIONS` ₺50 adımlarla ₺50–₺500 üretir.
Dolum sayacının üst sınırı bu listenin en yüksek değerini kapsamalı, yoksa hedefe
ulaşılamayan sipariş çıkar.

**iOS ana ekran uygulamasında yükseklik `%` ile kurulur, `vh`/`dvh` ile değil.**
`black-translucent` durum çubuğu stili içeriği çubuğun altına kaydırıyor ama yerleşim
görüntü alanını büyütmüyor: alan ekrandan tam `env(safe-area-inset-top)` kadar kısa
kalıyor ve fark altta siyah bant olarak görünüyor. Ölçüm (iPhone 15): ekran 852,
`innerHeight` 793, `documentElement.clientHeight` 793, üst inset 59.
Çözüm `style.css` içinde: standalone + WebKit dalında `body { height: calc(100% +
env(safe-area-inset-top)) }`. Denenip elenenler — `vh` ve `dvh` belge uzayınca kısa
değerden ekran boyuna zıplayıp 59pt taşma yapıyor; `#app`'e `position: fixed` vermek
kutuyu kısa görüntü alanına geri kırpıyor (yalnız kök arka planı banda kadar boyanıyor,
sahne boyanmıyor). `#app` akışta kalmalı.

**Mobil performans `pointer: coarse` ile ayrışıyor** (`world.ts`): piksel oranı 1.25,
gölge haritası 512, görünür far bütçesi 4 araç. Sahneye maliyetli bir şey eklerken bu
dalı da güncelle. `prefers-reduced-motion` de okunuyor.

## Denge ayarı nerede

| Konu | Dosya |
|---|---|
| Pompa yerleşimi ve açma maliyetleri | `game/slots.ts` |
| Yakıt, litre fiyatı, fiyat–talep, depo kapasitesi, tanker partisi | `game/fuel.ts` |
| Süreler, sabır, gece vardiyası, market satış tetikleri | `game/station.ts` |
| Market ürün fiyat–talep dengesi | `game/market.ts` |
| Personel, sendika, çevre, rakipler, krizler, kara borsa | `game/management.ts` |
| Pompacı ücreti, komisyonu ve tepki süresi | `game/station.ts` |
| Gün uzunluğu ve günün başlangıç saati | `game/clock.ts` |

## Dev konsol kancası

Yalnızca `pnpm dev` sırasında (`import.meta.env.DEV`), production build'e girmez:

```js
__petrolyoner.step(10)              // zamanı 10 sn ilerlet — rAF durduğunda tek yol
__petrolyoner.station.addMoney(1e5)
__petrolyoner.offline(3)            // 3 saatlik gece vardiyası ekranı
__petrolyoner.time(22)              // gece ışıklarını anında dene
__petrolyoner.view()                // kamerayı başlangıç çerçevesine döndür
__petrolyoner.reset()               // kaydı sil ve baştan başla
```

## Dokümanlar

`docs/GDD.md` oyun tasarımı ve denge gerekçeleri, `docs/ROADMAP.md` sürüm planı.
Oynanış kuralını değiştirirken GDD'yi de güncelle — sayı tablolarının çoğu oradan
takip ediliyor.
