// Petugas Layout Shell - Header + Bottom Nav
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, useLogout } from "@/lib/hooks/useAuth";
import { Home, ClipboardCheck, AlertTriangle, FileText, LogOut, User, ChevronDown, Bell, Settings } from "lucide-react";
import { ConnectionIndicator } from "@/components/pwa/ConnectionIndicator";
import { SyncQueueDrawer } from "@/components/pwa/SyncQueueDrawer";

const navigation = [
  { name: "Home", href: "/home", icon: Home },
  { name: "Checklist", href: "/checklist", icon: ClipboardCheck },
  { name: "Incident", href: "/incident", icon: AlertTriangle },
  { name: "Laporan", href: "/report", icon: FileText },
];

export default function PetugasLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user } = useAuth();
  const { mutate: logout } = useLogout();
  const [profileOpen, setProfileOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  // Tutup dropdown/profile saat navigasi
  useEffect(() => {
    setProfileOpen(false);
  }, [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 safe-top safe-bottom">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-md mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Title */}
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
              Checklist Shift
            </h1>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors touch-target"
                aria-expanded={profileOpen}
                aria-haspopup="true"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block">
                  {user?.name ?? "Petugas"}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 animate-slide-down">
                    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role}</p>
                    </div>
                    <Link
                      href="/akun"
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => setProfileOpen(false)}
                    >
                      <Settings className="w-4 h-4" /> Akun
                    </Link>
                    <Link
                      href="/notifikasi"
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => setProfileOpen(false)}
                    >
                      <Bell className="w-4 h-4" /> Notifikasi
                    </Link>
                    <button
                      onClick={() => logout()}
                      className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <LogOut className="w-4 h-4" /> Keluar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Connection Indicator */}
      <ConnectionIndicator />

      {/* Main Content */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        <div className="max-w-md mx-auto px-4 py-4">
          {children}
        </div>
      </main>

      {/* Bottom Nav (Mobile only) */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-700 safe-bottom">
        <div className="grid grid-cols-4">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-3 px-2 transition-colors touch-target ${
                isActive(item.href)
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              <item.icon className="w-6 h-6" aria-hidden="true" />
              <span className="text-xs font-medium">{item.name}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Sync Queue Drawer */}
      <SyncQueueDrawer open={queueOpen} onClose={() => setQueueOpen(false)} />

      {/* Floating sync button */}
      {/* Temporarily disabled to avoid conflict with ConnectionIndicator */}
      {/* {(() => {
        // Import useSync here would cause issues, skip for now
        return null;
      })()} */}
    </div>
  );
}