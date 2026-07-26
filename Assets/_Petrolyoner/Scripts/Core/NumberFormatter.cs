using System;
using System.Globalization;

namespace Petrolyoner.Core
{
    /// <summary>
    /// Idle oyun sayılarını kısaltır: 1500 → "1.5K", 2.4e9 → "2.4B".
    /// UI'da asla double.ToString() kullanma, buradan geç.
    /// </summary>
    public static class NumberFormatter
    {
        // K/M/B/T'den sonra aa, ab, ac... şeklinde devam eder (idle oyun standardı).
        private static readonly string[] ShortSuffixes = { "", "K", "M", "B", "T" };

        public static string Format(double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value)) return "0";

            var sign = value < 0d ? "-" : string.Empty;
            value = Math.Abs(value);

            if (value < 1000d)
            {
                return sign + value.ToString("0.##", CultureInfo.InvariantCulture);
            }

            var tier = (int)Math.Floor(Math.Log10(value) / 3d);
            var scaled = value / Math.Pow(1000d, tier);

            // Log10 yuvarlama hatası 1000.00 gibi bir sonuç üretebilir.
            if (scaled >= 1000d)
            {
                scaled /= 1000d;
                tier++;
            }

            return sign + scaled.ToString("0.##", CultureInfo.InvariantCulture) + GetSuffix(tier);
        }

        /// <summary>Para gösterimi, başına ₺ ekler.</summary>
        public static string FormatMoney(double value) => "₺" + Format(value);

        /// <summary>"3sa 12dk" gibi kısa süre metni — offline kazanç ekranı için.</summary>
        public static string FormatDuration(TimeSpan span)
        {
            if (span.TotalMinutes < 1d) return $"{Math.Max(1, span.Seconds)}sn";
            if (span.TotalHours < 1d) return $"{span.Minutes}dk";
            if (span.TotalDays < 1d) return $"{(int)span.TotalHours}sa {span.Minutes}dk";
            return $"{(int)span.TotalDays}g {span.Hours}sa";
        }

        private static string GetSuffix(int tier)
        {
            if (tier < ShortSuffixes.Length) return ShortSuffixes[tier];

            // aa, ab, ..., az, ba, bb, ...
            var index = tier - ShortSuffixes.Length;
            var first = (char)('a' + index / 26 % 26);
            var second = (char)('a' + index % 26);
            return string.Concat(first, second);
        }
    }
}
