using System;
using System.IO;
using Petrolyoner.Data;
using UnityEngine;

namespace Petrolyoner.Save
{
    /// <summary>
    /// Kaydı persistentDataPath altına JSON olarak yazar.
    /// Yazma önce .tmp dosyasına yapılır, sonra taşınır — oyun yazma sırasında
    /// kapanırsa kayıt bozulmaz.
    /// </summary>
    public static class SaveSystem
    {
        private const string FileName = "petrolyoner.save.json";
        private const string TempFileName = "petrolyoner.save.tmp";

        private static string SavePath => Path.Combine(Application.persistentDataPath, FileName);
        private static string TempPath => Path.Combine(Application.persistentDataPath, TempFileName);

        public static bool SaveExists() => File.Exists(SavePath);

        public static void Save(PlayerData data)
        {
            if (data == null) return;

            try
            {
                var json = JsonUtility.ToJson(data);
                File.WriteAllText(TempPath, json);

                if (File.Exists(SavePath)) File.Delete(SavePath);
                File.Move(TempPath, SavePath);
            }
            catch (Exception e)
            {
                Debug.LogError($"[SaveSystem] Kayıt yazılamadı: {e.Message}");
            }
        }

        /// <summary>Kayıt yoksa veya bozuksa null döner; çağıran yeni oyun başlatmalı.</summary>
        public static PlayerData Load()
        {
            if (!File.Exists(SavePath)) return null;

            try
            {
                var json = File.ReadAllText(SavePath);
                var data = JsonUtility.FromJson<PlayerData>(json);

                if (data == null)
                {
                    Debug.LogError("[SaveSystem] Kayıt okunamadı, yedeklenip sıfırlanıyor.");
                    BackupCorruptSave();
                    return null;
                }

                Migrate(data);
                return data;
            }
            catch (Exception e)
            {
                Debug.LogError($"[SaveSystem] Kayıt bozuk: {e.Message}");
                BackupCorruptSave();
                return null;
            }
        }

        public static void Delete()
        {
            if (File.Exists(SavePath)) File.Delete(SavePath);
        }

        /// <summary>
        /// Eski sürüm kayıtlarını güncel şemaya taşır.
        /// PlayerData'ya alan eklerken CurrentVersion'ı artır ve buraya adım ekle.
        /// </summary>
        private static void Migrate(PlayerData data)
        {
            if (data.saveVersion == PlayerData.CurrentVersion) return;

            // örnek:
            // if (data.saveVersion < 2) { data.yeniAlan = varsayilan; }

            data.saveVersion = PlayerData.CurrentVersion;
        }

        /// <summary>Bozuk kaydı silmek yerine kenara alır — oyuncu ilerlemesi destek için kurtarılabilir.</summary>
        private static void BackupCorruptSave()
        {
            try
            {
                if (!File.Exists(SavePath)) return;
                var backup = SavePath + $".corrupt-{DateTime.UtcNow:yyyyMMddHHmmss}";
                File.Move(SavePath, backup);
            }
            catch (Exception e)
            {
                Debug.LogError($"[SaveSystem] Bozuk kayıt yedeklenemedi: {e.Message}");
            }
        }
    }
}
