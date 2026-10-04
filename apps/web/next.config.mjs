const API_BASE = process.env["API_BASE"] ?? "http://localhost:3001";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Satu origin: browser -> /api/* (web) -> apps/api (TRD §4).
    return [{ source: "/api/:path*", destination: `${API_BASE}/api/:path*` }];
  },
  // Paket workspace berisi sumber TS — perlu ditranspile Next.
  transpilePackages: ["@checklist-shift/shared"],
  // CATATAN Fase 7: PWA (Serwist, bukan next-pwa — lihat TRD §8) + manifest
  // lengkap + ikon akan dipasang di sini. Config next-pwa sebelumnya dihapus
  // karena merusak server (require di ESM) dan bukan pilihan TRD.
};

export default nextConfig;
