// Utilitas kalibrasi waktu server (BR-23)
// Memastikan semua timestamp aksi menggunakan jam server, bukan jam HP

import { getServerTimeNow, getServerTimeIso, calibrateServerTime, isCalibrationValid, initTimeCalibration, loadCalibrationFromDB } from "@/lib/offline/sync";

// Re-export untuk kemudahan
export {
  getServerTimeNow,
  getServerTimeIso,
  calibrateServerTime,
  isCalibrationValid,
  initTimeCalibration,
  loadCalibrationFromDB,
};

// Helper: format waktu untuk label ketepatan (tepat_waktu/lebih_awal/terlambat)
export function formatTimingLabel(label: "tepat_waktu" | "lebih_awal" | "terlambat"): string {
  switch (label) {
    case "tepat_waktu":
      return "Tepat waktu";
    case "lebih_awal":
      return "Lebih awal";
    case "terlambat":
      return "Terlambat";
    default:
      return label;
  }
}

// Helper: hitung delta menit dari target time
export function calculateTimingDelta(targetTime: string, toleranceMinutes: number, serverTime: Date = getServerTimeNow()): number {
  const [targetHour, targetMin] = targetTime.split(":").map(Number);
  const targetMs = (targetHour * 60 + targetMin) * 60 * 1000; // ms dari tengah malam

  const serverHour = serverTime.getHours();
  const serverMin = serverTime.getMinutes();
  const serverMs = (serverHour * 60 + serverMin) * 60 * 1000;

  return Math.round((serverMs - targetMs) / 60000); // delta dalam menit
}

// Helper: tentukan label ketepatan
export function determineTimingLabel(
  targetTime: string,
  toleranceMinutes: number,
  serverTime: Date = getServerTimeNow()
): "tepat_waktu" | "lebih_awal" | "terlambat" {
  const delta = calculateTimingDelta(targetTime, toleranceMinutes, serverTime);
  if (Math.abs(delta) <= toleranceMinutes) return "tepat_waktu";
  return delta < 0 ? "lebih_awal" : "terlambat";
}