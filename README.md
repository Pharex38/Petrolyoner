# Petrolyoner

Petrol sahibi simülasyonu / idle tycoon oyunu. iOS + Android.

> **İsim geçici.** "Petrolyoner" (petrol + milyoner) çalışma adı olarak seçildi; daha iyi bir isim bulunca değişecek. İsim değişirse `Assets/_Petrolyoner/` klasörü, C# namespace'leri ve `ProjectSettings` içindeki bundle identifier güncellenmeli.

## Teknoloji

- **Unity 6000.5.1f1** (Unity 6.5)
- Hedef platformlar: Android (API 24+), iOS (15+)
- 2D, portre mod

## Kurulum

Bu repo Unity projesinin iskeletini içeriyor. Unity `Library/` klasörünü ilk açılışta kendisi üretecek.

1. **Git LFS kur** (binary asset'ler için, ilk sprite eklenmeden önce yapılmalı):
   ```bash
   brew install git-lfs
   cd Petrolyoner && git lfs install
   ```

2. **Projeyi aç:** Unity Hub → `Add` → `Add project from disk` → bu klasörü seç.

3. **Paketleri ekle** (Window → Package Manager):
   - Input System
   - 2D Sprite / 2D Animation (ihtiyaca göre)

4. **İlk sahne:** `Assets/_Petrolyoner/Scenes/` altına `Main.unity` oluştur, boş bir GameObject'e `GameManager` bileşenini ekle.

### Unity Smart Merge (opsiyonel ama önerilir)

Sahne ve prefab çakışmalarını çözmek için:

```bash
git config merge.unityyamlmerge.name "Unity Smart Merge"
git config merge.unityyamlmerge.driver '/Applications/Unity/Hub/Editor/6000.5.1f1/Unity.app/Contents/Tools/UnityYAMLMerge merge -p "$BASE" "$REMOTE" "$LOCAL" "$MERGED"'
```

## Klasör yapısı

```
Assets/_Petrolyoner/     Tüm proje asset'leri (3rd party asset'ler dışarıda kalsın)
  Scripts/
    Core/                Oyun döngüsü, ekonomi hesabı, sayı formatlama
    Data/                ScriptableObject tanımları + save veri modelleri
    Save/                Kayıt / yükleme / offline kazanç
    UI/                  Ekran ve panel kontrolcüleri
  Scenes/                Sahneler
  Prefabs/               Prefab'ler
  Art/                   Sprite ve UI görselleri
  Audio/                 Ses
  Settings/              ScriptableObject instance'ları (kuyu tanımları vb.)
docs/                    Tasarım dokümanları
```

## Dokümanlar

- [docs/GDD.md](docs/GDD.md) — oyun tasarım dokümanı, temel döngü, ilerleme
- [docs/ROADMAP.md](docs/ROADMAP.md) — sürüm planı ve yapılacaklar

## Kurallar

- `Assets/_Petrolyoner/` dışına dosya koyma; Asset Store paketleri kendi klasörlerinde kalsın.
- Keystore, `google-services.json`, imza sertifikaları **asla** commitlenmez (`.gitignore` içinde).
- Para/üretim değerleri `double` ile tutuluyor. Formatlama için `NumberFormatter.Format()` kullan, `ToString()` çağırma.
