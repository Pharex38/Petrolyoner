using System;
using System.Collections.Generic;

namespace Petrolyoner.Data
{
    /// <summary>
    /// Diske yazılan kayıt verisi. JsonUtility ile serileştirildiği için
    /// sadece public alanlar ve [Serializable] tipler kullanılabilir (Dictionary desteklenmez).
    /// Alan eklerken saveVersion'ı artır ve SaveSystem.Migrate içine taşıma adımı yaz.
    /// </summary>
    [Serializable]
    public class PlayerData
    {
        public int saveVersion = CurrentVersion;

        public double money;
        public double totalEarned;

        public int prestigeCount;
        public double prestigeMultiplier = 1d;

        /// <summary>Oyunun son kapandığı an. Offline kazanç bundan hesaplanır.</summary>
        public long lastSeenUnixSeconds;

        public List<WellSaveData> wells = new List<WellSaveData>();

        public const int CurrentVersion = 1;
    }

    [Serializable]
    public class WellSaveData
    {
        public string wellId;
        public int level;

        public WellSaveData() { }

        public WellSaveData(string wellId, int level)
        {
            this.wellId = wellId;
            this.level = level;
        }
    }
}
