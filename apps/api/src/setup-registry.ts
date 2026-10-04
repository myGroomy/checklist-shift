// Skrip satu-kali Fase 0: buat tab + header registry beserta seed Settings.
// Idempoten: hanya menambah tab/header/baris yang belum ada. Tidak pernah menghapus.
// Jalankan: npm run setup:registry --workspace=apps/api
import { google } from "googleapis";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function unquote(v: string): string {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  return v;
}

// Header registry persis DATABASE_SCHEMA.md §4. Kolom A = id (kecuali Settings: key).
const TABS: Record<string, string[]> = {
  Branches: ["id", "name", "code", "address", "timezone", "spreadsheet_id", "schema_version", "is_active", "created_at", "updated_at"],
  BranchArchives: ["id", "branch_id", "from_month", "to_month", "spreadsheet_id", "created_at"],
  Users: ["id", "name", "username", "pin_hash", "role", "is_active", "must_change_pin", "locked_until", "last_login_at", "pin_changed_at", "created_at", "updated_at", "version"],
  UserBranchAccess: ["id", "user_id", "branch_id", "granted_by", "is_active", "created_at", "updated_at"],
  IncidentCategories: ["id", "name", "sort_order", "is_active", "created_at", "updated_at"],
  Settings: ["key", "value", "value_type", "updated_by", "updated_at"],
  ShareTokens: ["id", "secret_hash", "branch_id", "report_id", "shift_instance_id", "expires_at", "revoked_at", "revoked_by", "created_by", "created_at"],
  PushSubscriptions: ["id", "user_id", "endpoint", "p256dh", "auth", "device_info", "revoked_at", "created_at"],
  NotificationPrefs: ["id", "user_id", "type", "enabled", "updated_at"],
  AuditLog_Global: ["id", "seq", "at", "actor_id", "action", "object_type", "object_id", "branch_id", "shift_instance_id", "before", "after", "reason", "prev_hash", "hash"],
};

const SETTINGS_SEED: Array<[string, string, string]> = [
  ["tolerance_default_minutes", "15", "int"],
  ["pin_max_attempts", "5", "int"],
  ["pin_lock_minutes", "15", "int"],
  ["session_days", "30", "int"],
  ["share_token_days", "30", "int"],
  ["incident_link_window_hours", "4", "int"],
  ["photo_max_count", "5", "int"],
  ["photo_max_size_kb", "1024", "int"],
  ["photo_retention_days", "0", "int"],
  ["public_show_photos", "TRUE", "bool"],
  ["pin_block_weak", "TRUE", "bool"],
  ["whatsapp_template", "Laporan {shift} {cabang} {tanggal} — PJ: {pj}. {ringkasan} {tautan}", "text"],
];

async function main() {
  const spreadsheetId =
    env("REGISTRY_SPREADSHEET_ID") ?? env("REGISTRY_SPREADSHEETS_ID") ?? env("REGISTRY");
  const email = env("GOOGLE_SA_EMAIL") ?? env("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  let key = env("GOOGLE_SA_PRIVATE_KEY") ?? env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  if (!spreadsheetId || !email || !key) throw new Error("env belum lengkap");
  key = unquote(key);
  if (key.includes("\\n")) key = key.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(title,sheetId,gridProperties)",
  });
  const existing = new Map(
    (meta.data.sheets ?? []).map((s) => [s.properties?.title as string, s.properties?.sheetId as number]),
  );

  const requests: Array<Record<string, unknown>> = [];
  for (const [title, header] of Object.entries(TABS)) {
    if (!existing.has(title)) {
      requests.push({
        addSheet: {
          properties: {
            title,
            gridProperties: { rowCount: 1000, columnCount: header.length, frozenRowCount: 1 },
          },
        },
      });
    }
  }
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    console.log(`tab dibuat: ${requests.length}`);
  } else {
    console.log("semua tab sudah ada");
  }

  // Isi baris 1 = header bila masih kosong (baca by nama, tulis RAW).
  for (const [title, header] of Object.entries(TABS)) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${title}!A1:Z1`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const row1 = res.data.values?.[0] ?? [];
    if (row1.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [header] },
      });
      console.log(`header ditulis: ${title}`);
    }
  }

  // Seed Settings yang belum ada kuncinya.
  const cur = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Settings!A2:A1000",
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const have = new Set((cur.data.values ?? []).flat().map(String));
  const now = new Date().toISOString();
  const missing = SETTINGS_SEED.filter(([k]) => !have.has(k));
  if (missing.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Settings!A:E",
      valueInputOption: "RAW",
      requestBody: { values: missing.map(([k, v, t]) => [k, v, t, "", now]) },
    });
    console.log(`settings seed: ${missing.length}`);
  } else {
    console.log("settings sudah lengkap");
  }
  console.log("setup registry selesai");
}

main().catch((e) => {
  console.error("setup gagal:", e?.response?.data?.error?.message ?? e.message);
  process.exit(1);
});
