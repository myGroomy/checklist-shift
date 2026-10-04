export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b">
        <div className="max-w-md mx-auto px-4 py-4">
          <h1 className="text-xl font-semibold text-center">Checklist Shift</h1>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center space-y-8">
          <div className="p-6 rounded-2xl bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
            <svg className="w-16 h-16 mx-auto text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-gray-100">Selamat Datang</h2>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              Aplikasi SOP shift karyawan F&B. Checklist bersama, handover, incident, dan laporan shift terkunci.
            </p>
          </div>

          <div className="space-y-3">
            <a href="/checklist" className="block w-full px-6 py-4 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors touch-target">
              Buka Checklist
            </a>
            <a href="/incident/baru" className="block w-full px-6 py-4 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors touch-target">
              Buat Incident
            </a>
            <a href="/report" className="block w-full px-6 py-4 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors touch-target">
              Lihat Laporan
            </a>
          </div>

          <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Versi 0.1.0 (Fase 7 - PWA & Offline)
            </p>
          </div>
        </div>
      </div>

      <footer className="p-4 text-center text-sm text-gray-500 dark:text-gray-400 border-t safe-bottom">
        © 2025 Checklist Shift — PWA Mobile-First
      </footer>
    </main>
  );
}