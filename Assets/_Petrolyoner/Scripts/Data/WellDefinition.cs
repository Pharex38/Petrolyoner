using System;
using UnityEngine;

namespace Petrolyoner.Data
{
    /// <summary>
    /// Bir kuyunun ayarlanabilir tanımı. Assets/_Petrolyoner/Settings/ altında
    /// asset olarak oluşturulur (Create → Petrolyoner → Well Definition).
    /// Dengeleme buradan yapılır, koddan değil.
    /// </summary>
    [CreateAssetMenu(menuName = "Petrolyoner/Well Definition", fileName = "Well_")]
    public class WellDefinition : ScriptableObject
    {
        [Header("Kimlik")]
        [Tooltip("Kayıt dosyasına yazılan kalıcı kimlik. Yayına çıktıktan sonra ASLA değiştirme.")]
        [SerializeField] private string wellId = "well_batman";
        [SerializeField] private string displayName = "Batman Kuyusu";

        [Header("Maliyet")]
        [SerializeField] private double baseCost = 10d;
        [Tooltip("Her seviyede maliyetin çarpanı. 1.15 civarı idle oyunlarda standart.")]
        [SerializeField] private double costGrowth = 1.15d;

        [Header("Üretim")]
        [Tooltip("Seviye başına varil/saniye.")]
        [SerializeField] private double barrelsPerSecondPerLevel = 0.5d;

        public string WellId => wellId;
        public string DisplayName => displayName;
        public double BaseCost => baseCost;

        /// <summary>Mevcut seviyeden bir sonrakine geçmenin maliyeti.</summary>
        public double GetUpgradeCost(int currentLevel)
        {
            if (currentLevel < 0) currentLevel = 0;
            return baseCost * Math.Pow(costGrowth, currentLevel);
        }

        /// <summary>Verilen seviyedeki varil/saniye üretimi. Seviye 0 = kilitli, üretim yok.</summary>
        public double GetProduction(int level)
        {
            return level <= 0 ? 0d : barrelsPerSecondPerLevel * level;
        }

        private void OnValidate()
        {
            if (costGrowth <= 1d) costGrowth = 1.01d;
            if (baseCost <= 0d) baseCost = 1d;
            if (string.IsNullOrWhiteSpace(wellId)) wellId = name;
        }
    }
}
