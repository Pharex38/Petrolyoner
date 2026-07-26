using System;
using System.Collections.Generic;
using Petrolyoner.Data;
using Petrolyoner.Save;
using UnityEngine;

namespace Petrolyoner.Core
{
    /// <summary>
    /// Oyunun tek giriş noktası: tick döngüsü, gelir hesabı, kayıt, offline kazanç.
    /// Sahnede boş bir GameObject'e eklenir ve sahneler arası korunur.
    /// </summary>
    [DisallowMultipleComponent]
    public class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        [Header("İçerik")]
        [Tooltip("Settings/ altındaki WellDefinition asset'leri buraya sürüklenir.")]
        [SerializeField] private List<WellDefinition> wellDefinitions = new List<WellDefinition>();

        [Header("Ekonomi")]
        [Tooltip("Bir varilin satış fiyatı.")]
        [SerializeField] private double barrelPrice = 1d;

        [Header("Offline kazanç")]
        [Tooltip("Offline kazancın hesaplanacağı en uzun süre (saat).")]
        [SerializeField] private double maxOfflineHours = 4d;
        [Tooltip("Offline kazanç aktif gelirin bu oranı kadar olur. Aktif oynamayı ödüllendirir.")]
        [Range(0f, 1f)]
        [SerializeField] private float offlineEfficiency = 0.5f;

        [Header("Kayıt")]
        [SerializeField] private float autoSaveIntervalSeconds = 30f;

        private PlayerData _data;
        private float _autoSaveTimer;

        /// <summary>Offline kazanç ekranı için: (kazanılan para, gerçekte geçen süre).</summary>
        public event Action<double, TimeSpan> OfflineEarningsGranted;

        /// <summary>Sadece kesikli değişimlerde tetiklenir (yükseltme, ödül). Her kare AKMAZ —
        /// sürekli artan para sayacı için UI, Money'yi Update içinde okumalı.</summary>
        public event Action<double> MoneyChanged;

        public PlayerData Data => _data;
        public double Money => _data?.money ?? 0d;
        public IReadOnlyList<WellDefinition> WellDefinitions => wellDefinitions;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);

            _data = SaveSystem.Load() ?? CreateNewGame();
            GrantOfflineEarnings();
        }

        private void Update()
        {
            var income = GetIncomePerSecond();
            if (income > 0d)
            {
                var earned = income * Time.deltaTime;
                _data.money += earned;
                _data.totalEarned += earned;
            }

            _autoSaveTimer += Time.deltaTime;
            if (_autoSaveTimer >= autoSaveIntervalSeconds)
            {
                _autoSaveTimer = 0f;
                SaveGame();
            }
        }

        // Mobilde OnApplicationQuit çoğu zaman hiç çağrılmaz; asıl güvenilir nokta pause.
        private void OnApplicationPause(bool paused)
        {
            if (paused) SaveGame();
        }

        private void OnApplicationQuit() => SaveGame();

        // ---------- Ekonomi ----------

        /// <summary>Tüm kuyuların toplam saniyelik geliri (prestij çarpanı dahil).</summary>
        public double GetIncomePerSecond()
        {
            if (_data == null) return 0d;

            var barrelsPerSecond = 0d;
            for (var i = 0; i < _data.wells.Count; i++)
            {
                var well = _data.wells[i];
                var definition = GetDefinition(well.wellId);
                if (definition == null) continue;

                barrelsPerSecond += definition.GetProduction(well.level);
            }

            return barrelsPerSecond * barrelPrice * _data.prestigeMultiplier;
        }

        public double GetUpgradeCost(string wellId)
        {
            var definition = GetDefinition(wellId);
            if (definition == null) return double.PositiveInfinity;

            return definition.GetUpgradeCost(GetLevel(wellId));
        }

        public int GetLevel(string wellId)
        {
            var save = FindWellSave(wellId);
            return save?.level ?? 0;
        }

        public bool CanAfford(double cost) => _data != null && _data.money >= cost;

        /// <summary>Parası yetiyorsa kuyuyu bir seviye yükseltir. Yetmezse false döner.</summary>
        public bool TryUpgradeWell(string wellId)
        {
            var definition = GetDefinition(wellId);
            if (definition == null)
            {
                Debug.LogWarning($"[GameManager] Bilinmeyen kuyu: {wellId}");
                return false;
            }

            var save = FindWellSave(wellId);
            if (save == null)
            {
                save = new WellSaveData(wellId, 0);
                _data.wells.Add(save);
            }

            var cost = definition.GetUpgradeCost(save.level);
            if (_data.money < cost) return false;

            _data.money -= cost;
            save.level++;
            MoneyChanged?.Invoke(_data.money);
            return true;
        }

        /// <summary>Reklam ödülü, offline kazanç gibi kesikli para eklemeleri için.</summary>
        public void AddMoney(double amount)
        {
            if (amount <= 0d || _data == null) return;

            _data.money += amount;
            _data.totalEarned += amount;
            MoneyChanged?.Invoke(_data.money);
        }

        // ---------- Kayıt ----------

        public void SaveGame()
        {
            if (_data == null) return;

            _data.lastSeenUnixSeconds = CurrentUnixSeconds();
            SaveSystem.Save(_data);
        }

        private PlayerData CreateNewGame()
        {
            var data = new PlayerData
            {
                money = 0d,
                lastSeenUnixSeconds = CurrentUnixSeconds()
            };

            // İlk kuyu bedava ve açık gelir, oyuncu ilk saniyeden gelir görsün.
            if (wellDefinitions.Count > 0 && wellDefinitions[0] != null)
            {
                data.wells.Add(new WellSaveData(wellDefinitions[0].WellId, 1));
            }

            return data;
        }

        private void GrantOfflineEarnings()
        {
            if (_data.lastSeenUnixSeconds <= 0L)
            {
                _data.lastSeenUnixSeconds = CurrentUnixSeconds();
                return;
            }

            var now = CurrentUnixSeconds();
            var elapsedSeconds = now - _data.lastSeenUnixSeconds;
            _data.lastSeenUnixSeconds = now;

            // Cihaz saati geri alınmışsa kazanç verme (basit istismar koruması).
            if (elapsedSeconds <= 0L) return;

            var cappedSeconds = Math.Min(elapsedSeconds, (long)(maxOfflineHours * 3600d));
            var earnings = GetIncomePerSecond() * cappedSeconds * offlineEfficiency;
            if (earnings <= 0d) return;

            AddMoney(earnings);
            OfflineEarningsGranted?.Invoke(earnings, TimeSpan.FromSeconds(elapsedSeconds));
        }

        // ---------- Yardımcılar ----------

        private WellDefinition GetDefinition(string wellId)
        {
            for (var i = 0; i < wellDefinitions.Count; i++)
            {
                var definition = wellDefinitions[i];
                if (definition != null && definition.WellId == wellId) return definition;
            }

            return null;
        }

        private WellSaveData FindWellSave(string wellId)
        {
            for (var i = 0; i < _data.wells.Count; i++)
            {
                if (_data.wells[i].wellId == wellId) return _data.wells[i];
            }

            return null;
        }

        private static long CurrentUnixSeconds() => DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    }
}
