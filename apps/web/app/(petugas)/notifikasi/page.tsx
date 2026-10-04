// Petugas Notifikasi Page
"use client";

import { useState } from "react";
import { Bell, CheckCircle, AlertTriangle, AlertCircle, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";

interface Notification {
  id: string;
  type: "shift_reminder" | "handover_unread" | "incident_open" | "shift_closed" | "incident_resolved" | "mention";
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  action_url?: string;
}

const mockNotifications: Notification[] = [
  {
    id: "1",
    type: "shift_reminder",
    title: "Shift Pagi akan dimulai",
    message: "Shift Pagi outlet Cabang Utama akan dimulai dalam 30 menit",
    read: false,
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    action_url: "/checklist",
  },
  {
    id: "2",
    type: "handover_unread",
    title: "Handover belum dibaca",
    message: "Shift Malam kemarin telah meninggalkan handover untuk Anda",
    read: false,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    action_url: "/checklist",
  },
  {
    id: "3",
    type: "incident_open",
    title: "Incident baru: Kebocoran Gas",
    message: "Budi Santoso melaporkan incident tingkat tinggi di area dapur",
    read: true,
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    action_url: "/incident/inc_123",
  },
  {
    id: "4",
    type: "shift_closed",
    title: "Shift Pagi sudah ditutup",
    message: "Laporan shift Pagi Cabang Utama telah terkunci dan siap dibagikan",
    read: true,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    action_url: "/report/shift_456",
  },
];

export default function NotifikasiPage() {
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const loading = false;
  

  const filteredNotifications = filter === "unread"
    ? notifications.filter((n) => !n.read)
    : notifications;

  const formatTimeAgo = (iso: string) => {
    try {
      const date = parseISO(iso);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Baru saja";
      if (diffMins < 60) return `${diffMins} menit lalu`;
      if (diffHours < 24) return `${diffHours} jam lalu`;
      if (diffDays < 7) return `${diffDays} hari lalu`;
      return format(date, "dd MMM yyyy", { locale: localeId });
    } catch {
      return iso;
    }
  };

  const getIcon = (type: Notification["type"]) => {
    switch (type) {
      case "shift_reminder": return <Clock className="w-5 h-5 text-blue-500" />;
      case "handover_unread": return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case "incident_open": return <AlertCircle className="w-5 h-5 text-red-500" />;
      case "shift_closed": return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "incident_resolved": return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "mention": return <Bell className="w-5 h-5 text-purple-500" />;
      default: return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  const handleMarkRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Notifikasi</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{unreadCount} belum dibaca</p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Tandai semua dibaca
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "all"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Semua
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "unread"
              ? "bg-amber-600 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Belum Dibaca {unreadCount > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/20 text-white rounded-full">{unreadCount}</span>}
        </button>
      </div>

      {/* Notification List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse p-4 rounded-xl border bg-white dark:bg-gray-800">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
            {filter === "unread" ? "Tidak ada notifikasi belum dibaca" : "Belum ada notifikasi"}
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            {filter === "unread" ? "Semua notifikasi sudah dibaca" : "Notifikasi akan muncul di sini"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notif) => (
            <div
              key={notif.id}
              className={`p-4 rounded-xl border bg-white dark:bg-gray-800 transition-colors ${
                !notif.read ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20" : "border-gray-200 dark:border-gray-700"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getIcon(notif.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={`font-medium text-gray-900 dark:text-gray-100 ${!notif.read ? "" : "opacity-70"}`}>
                      {notif.title}
                    </h3>
                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {formatTimeAgo(notif.created_at)}
                    </span>
                  </div>
                  <p className={`text-sm text-gray-600 dark:text-gray-300 mt-1 ${!notif.read ? "" : "opacity-70"}`}>
                    {notif.message}
                  </p>
                  {!notif.read && (
                    <button
                      onClick={() => handleMarkRead(notif.id)}
                      className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Tandai dibaca
                    </button>
                  )}
                </div>
                {!notif.read && (
                  <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}