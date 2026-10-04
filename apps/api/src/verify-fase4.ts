// Verifikasi Fase 4 (Siklus Shift + Checklist Bersama). Fixture mandiri penuh.
// Secret di bawah DUMMY khusus uji (bukan kredensial asli).
// Jalankan: npm run verify:fase4 --workspace=apps/api
process.env["PIN_PEPPER"] ??= "uji-fase4-pepper";
process.env["SESSION_SECRET"] ??= "uji-fase4-secret-yang-cukup-panjang-32";

import { Hono } from "hono";
import {
  BRANCH_TEMPLATE_HEADERS,
  REGISTRY_HEADERS,
  monthlyTabName,
  newId,
  nowIso,
  wallTimeIn,
} from "@checklist-shift/shared";
import { registryId } from "./lib/env.js";
import { SheetRepo } from "./lib/repo.js";
import { sheetsClient, valuesAppend, valuesGet, valuesUpdate } from "./lib/sheets.js";
import { hashPin } from "./lib/pin.js";
import { revokeAllSessions } from "./lib/session.js";
import { cacheGet } from "./lib/redis.js";
import {
  ShiftSudahAda,
  bacaShift,
  bukaShift,
  gabungShift,
  hitungTiming,
  parseSnapshotCell,
} from "./lib/shift.js";
import authRoutes from "./routes/auth.js";
import shiftRoutes from "./routes/shift.js";
import checklistRoutes from "./routes/checklist.js";

const SS = "1tUJKzGknSbzSLGH29esPT7yttMC9nt2iY7pP8b4nWiY";
const TZ = "Asia/Jakarta";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = ""): void {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  GAGAL ${name} ${extra}`);
  }
}

async function ensureBranchTabs(ss: string): Promise<void> {
  const api = sheetsClient();
  const meta = await api.spreadsheets.get({ spreadsheetId: ss, fields: "sheets.properties.title" });
  const have = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));
  const all: Record<string, string[]> = { _meta: ["key", "value"], ...BRANCH_TEMPLATE_HEADERS };
  const missing = Object.entries(all).filter(([t]) => !have.has(t));
  if (missing.length > 0) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId: ss,
      requestBody: {
        requests: missing.map(([title, header]) => ({
          addSheet: {
            properties: {
              title,
              gridProperties: { rowCount: 1000, columnCount: header.length, frozenRowCount: 1 },
            },
          },
        })),
      },
    });
  }
  for (const [title, header] of Object.entries(all)) {
    const rows = await valuesGet(ss, `${title}!A1:Z1`);
    if ((rows[0] ?? []).length === 0) await valuesUpdate(ss, `${title}!A1`, [header]);
  }
}

async function main() {
  const suf = Date.now().toString().slice(-6);
  const reg = registryId() as string;
  const usersRepo = new SheetRepo(reg, "Users", REGISTRY_HEADERS["Users"]);
  const branchesRepo = new SheetRepo(reg, "Branches", REGISTRY_HEADERS["Branches"]);
  const ubaRange = "UserBranchAccess!A2:G10000";

  console.log("[0] bersih sisa run: nonaktifkan petugas uji stranded (prefix t4u)");
  const snap0 = await valuesGet(reg, "Users!A2:F10000");
  const colC0 = await valuesGet(reg, "Users!C2:C10000");
  let cleaned = 0;
  for (let i = 0; i < snap0.length; i++) {
    if (!String(colC0[i]?.[0] ?? "").startsWith("t4u")) continue;
    if (snap0[i]?.[5] !== "TRUE") continue;
    const id = snap0[i][0];
    await revokeAllSessions(id, 30).catch(() => undefined);
    await usersRepo.update(id, { is_active: "FALSE", updated_at: nowIso() });
    cleaned++;
  }
  console.log(`  dibersihkan: ${cleaned}`);
  await ensureBranchTabs(SS);
  console.log("  tab cabang dipastikan ada");

  console.log("[1] label waktu murni (batas toleransi, tanpa kuota)");
  const t = (target: string, tol: number | null, wall: string) =>
    hitungTiming(target, tol, 15, wall);
  check("tepat di +15", t("10:00", 15, "10:15").label === "tepat_waktu");
  check("tepat di -15", t("10:00", 15, "09:45").label === "tepat_waktu");
  check("terlambat di +16", t("10:00", 15, "10:16").label === "terlambat"
    && t("10:00", 15, "10:16").delta === 16);
  check("lebih awal di -16", t("10:00", 15, "09:44").label === "lebih_awal");
  check("toleransi kosong pakai default", t("10:00", null, "10:15").label === "tepat_waktu");

  console.log("[2] fixture: cabang + 2 pengguna + akses");
  const branchId = newId();
  await branchesRepo.append({
    id: branchId, name: `T1f4-Cabang Uji ${suf}`, code: `T1F4${suf.slice(-4)}`,
    address: "", timezone: TZ, spreadsheet_id: SS, schema_version: "1",
    is_active: "TRUE", created_at: nowIso(), updated_at: nowIso(),
  });
  const metaRows = await valuesGet(SS, "_meta!A2:B100");
  if (!metaRows.some((r) => r[0] === "branch_id")) {
    await valuesAppend(SS, "_meta!A:B", [["branch_id", branchId]]);
  }
  const mkUser = async (tag: string, pin: string, denganAkses: boolean): Promise<{ id: string; username: string }> => {
    const id = newId();
    const username = `t4${tag}${suf}`;
    await usersRepo.append({
      id, name: `T1f4-${tag}`, username, pin_hash: await hashPin(pin),
      role: "petugas", is_active: "TRUE", must_change_pin: "FALSE",
      locked_until: "", last_login_at: "", pin_changed_at: "",
      created_at: nowIso(), updated_at: nowIso(), version: "1",
    });
    if (denganAkses) {
      await valuesAppend(reg, ubaRange, [[newId(), id, branchId, id, "TRUE", nowIso(), nowIso()]]);
    }
    return { id, username };
  };
  const u1 = await mkUser("u1", "357289", true);
  const u2 = await mkUser("u2", "846215", true);
  const u3 = await mkUser("u3", "713942", false);
  check("cabang + 3 pengguna dibuat", Boolean(branchId && u1.id && u2.id && u3.id));

  console.log("[3] fixture: definisi + 1 kategori + 3 butir");
  const brepo = (tab: string): SheetRepo =>
    new SheetRepo(SS, tab, BRANCH_TEMPLATE_HEADERS[tab]);
  const defId = newId();
  const catId = newId();
  const [p1, p2, p3] = [newId(), newId(), newId()];
  const t0 = wallTimeIn(TZ);
  const tMinus60 = wallTimeIn(TZ, new Date(Date.now() - 60 * 60000));
  await brepo("ShiftDefinitions").append({
    id: defId, name: `T1f4 Pagi ${suf}`, start_time: "00:00", end_time: "23:59",
    crosses_midnight: "FALSE", sort_order: "1", is_active: "TRUE",
    created_at: nowIso(), updated_at: nowIso(), version: "1",
  });
  await brepo("SopCategories").append({
    id: catId, shift_definition_id: defId, name: "T1f4 Kebersihan",
    sort_order: "1", is_active: "TRUE", created_at: nowIso(), updated_at: nowIso(), version: "1",
  });
  const mkPoint = (id: string, o: Record<string, string>): Promise<number> =>
    brepo("ChecklistPoints").append({
      id, sop_category_id: catId, ...o, sort_order: o["sort_order"] ?? "1",
      is_active: "TRUE", created_at: nowIso(), updated_at: nowIso(), version: "1",
    });
  await mkPoint(p1, {
    title: "T1f4 Pel lantai", instruction: "", input_type: "centang",
    is_required: "TRUE", target_time: t0, tolerance_minutes: "15",
    active_days: "", number_min: "", number_max: "", sort_order: "1",
  });
  await mkPoint(p2, {
    title: "T1f4 Suhu freezer", instruction: "", input_type: "angka",
    is_required: "FALSE", target_time: tMinus60, tolerance_minutes: "15",
    active_days: "", number_min: "1", number_max: "5", sort_order: "2",
  });
  await mkPoint(p3, {
    title: "T1f4 Catatan", instruction: "", input_type: "teks",
    is_required: "TRUE", target_time: "", tolerance_minutes: "",
    active_days: "", number_min: "", number_max: "", sort_order: "3",
  });
  check("template uji tertulis", true);

  console.log("[4] BR-01: dua buka bersamaan via lib (lock Redis riil)");
  const race = await Promise.allSettled([
    bukaShift({ branchId, shiftDefId: defId, userId: u1.id, isTest: true }),
    bukaShift({ branchId, shiftDefId: defId, userId: u2.id, isTest: true }),
  ]);
  const menang = race.filter((r) => r.status === "fulfilled");
  const kalahCount = race.filter((r) => r.status === "rejected");
  check("tepat satu pemenang", menang.length === 1 && kalahCount.length === 1,
    JSON.stringify(race.map((r) => r.status)));
  let shiftId = "";
  let pjId = "";
  if (menang[0]?.status === "fulfilled") {
    shiftId = menang[0].value.shiftId;
    check("di dalam jam (flag FALSE)", menang[0].value.openedOutsideHours === false);
  }
  const alasanKalah = kalahCount[0]?.status === "rejected" ? kalahCount[0].reason : null;
  if (alasanKalah instanceof ShiftSudahAda) {
    if (!shiftId) shiftId = alasanKalah.shiftId;
    check("yang kalah mendapat shift yang sama", alasanKalah.shiftId === shiftId);
  } else {
    // Kalah karena lock sibuk: cari shift lalu gabung (jalur BR-01 yang sah).
    check("kalah karena lock sibuk (sah)", String(alasanKalah?.message ?? "").startsWith("lock sibuk"));
    const found = await valuesGet(SS, "ShiftInstances!A2:Z100000");
    const iDef = BRANCH_TEMPLATE_HEADERS["ShiftInstances"].indexOf("shift_definition_id");
    const hitRow = found.find((r) => r[iDef] === defId && r[4] === "berjalan");
    if (!shiftId) shiftId = hitRow?.[0] ?? "";
  }
  check("shift_id ditemukan", shiftId.length === 26, shiftId);
  const srow = await brepo("ShiftInstances").get(shiftId);
  pjId = srow?.["pj_user_id"] ?? "";
  check("PJ salah satu dari dua", pjId === u1.id || pjId === u2.id, pjId);
  const pecundang = pjId === u1.id ? u2 : u1;
  const g1 = await gabungShift({ branchId, shiftId, userId: pecundang.id });
  check("pecundang bergabung", g1.sudah === false);
  const g2 = await gabungShift({ branchId, shiftId, userId: pecundang.id });
  check("gabung idempoten", g2.sudah === true);
  check("cache shift terisi", (await cacheGet(
    `shift:${branchId}:${defId}:${srow?.["shift_date"]}:TRUE`)) === shiftId);

  console.log("[4b] jalur ShiftSudahAda deterministik: sekuensial + HTTP /buka kedua");
  const tapp = new Hono();
  tapp.route("/api/auth", authRoutes);
  tapp.route("/api/shift", shiftRoutes);
  tapp.route("/api/checklist", checklistRoutes);
  let ipN = 0;
  const ip = (): string => `t4-${suf}-${ipN++}`;
  const apiLogin = (username: string, pin: string) =>
    tapp.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip() },
      body: JSON.stringify({ username, pin }),
    });
  const cookieFrom = (res: Response): string => (res.headers.get("set-cookie") ?? "").split(";")[0];
  const get = (ck: string, path: string): Promise<Response> =>
    Promise.resolve(tapp.request(path, { headers: { cookie: ck, "x-forwarded-for": ip() } }));
  const post = (ck: string, path: string, body: unknown): Promise<Response> =>
    Promise.resolve(tapp.request(path, {
      method: "POST",
      headers: { cookie: ck, "content-type": "application/json", "x-forwarded-for": ip() },
      body: JSON.stringify(body),
    }));
  const ck1 = cookieFrom(await apiLogin(u1.username, "357289"));
  const ck2 = cookieFrom(await apiLogin(u2.username, "846215"));
  const ck3 = cookieFrom(await apiLogin(u3.username, "713942"));
  check("login u1+u2+u3", ck1.startsWith("sesi=") && ck2.startsWith("sesi=") && ck3.startsWith("sesi="));

  const def2 = newId();
  await brepo("ShiftDefinitions").append({
    id: def2, name: `T1f4 Sore ${suf}`, start_time: "00:00", end_time: "23:59",
    crosses_midnight: "FALSE", sort_order: "2", is_active: "TRUE",
    created_at: nowIso(), updated_at: nowIso(), version: "1",
  });
  const s2a = await bukaShift({ branchId, shiftDefId: def2, userId: u1.id, isTest: true });
  let sekuensialKalah = false;
  try {
    await bukaShift({ branchId, shiftDefId: def2, userId: u2.id, isTest: true });
  } catch (e) {
    sekuensialKalah = e instanceof ShiftSudahAda && e.shiftId === s2a.shiftId;
  }
  check("buka ulang sekuensial → ShiftSudahAda", sekuensialKalah);
  const b2 = (await (await post(ck2, "/api/shift/buka", {
    branch_id: branchId, shift_definition_id: def2,
  })).json()) as { ok?: boolean; bergabung?: boolean; shift_id?: string };
  check("petugas buka shift nyata (tanpa is_test)", b2.ok === true && b2.bergabung !== true,
    JSON.stringify(b2));
  const b2b = (await (await post(ck1, "/api/shift/buka", {
    branch_id: branchId, shift_definition_id: def2,
  })).json()) as { ok?: boolean; bergabung?: boolean; shift_id?: string };
  check("POST /buka kedua → bergabung:true",
    b2b.ok === true && b2b.bergabung === true && b2b.shift_id === b2.shift_id, JSON.stringify(b2b));
  const b3sep = (b2.shift_id ?? "") !== s2a.shiftId;
  check("tanpa is_test tidak menabrak shift uji", b3sep);
  await brepo("ShiftDefinitions").update(def2, { is_active: "FALSE", updated_at: nowIso() });

  console.log("[5] snapshot: kanonik + hash + isi");
  const snap = parseSnapshotCell(srow?.["template_snapshot"] ?? "");
  check("1 kategori 3 butir", snap.categories.length === 1 && snap.categories[0].points.length === 3);
  check("hash 64 hex", /^[0-9a-f]{64}$/.test(srow?.["snapshot_hash"] ?? ""));
  const { hash: ulang } = (await import("./lib/shift.js")).snapshotHash(snap);
  check("hash cocok dengan isi", ulang === srow?.["snapshot_hash"]);

  console.log("[6] HTTP end-to-end checklist (pakai sesi [4b])");

  const daftar = (await (await get(ck1, `/api/checklist/${shiftId}?branch_id=${branchId}`)).json()) as {
    kategori?: Array<{ butir: Array<{ state: string }> }>;
  };
  check("GET 3 butir belum", (daftar.kategori?.[0]?.butir.length ?? 0) === 3
    && (daftar.kategori?.[0]?.butir.every((b) => b.state === "belum") ?? false));

  const cid = (n: string): string => `T1F4CID${suf}${n}`.slice(0, 26).padEnd(26, "0");

  const a1 = await post(ck1, `/api/checklist/${shiftId}/aksi?branch_id=${branchId}`, {
    point_ref: p1, action: "selesai", client_action_id: cid("1"),
  });
  const a1b = (await a1.json()) as { timing_label?: string; state?: string };
  check("u1 selesai p1 tepat_waktu", a1.status === 200 && a1b.timing_label === "tepat_waktu",
    `st=${a1.status} ${JSON.stringify(a1b)}`);

  const a2 = await post(ck2, `/api/checklist/${shiftId}/aksi?branch_id=${branchId}`, {
    point_ref: p1, action: "selesai", client_action_id: cid("2"),
  });
  const a2b = (await a2.json()) as { error?: { message?: string } };
  check("BR-12: u2 kalah 409 + nama u1", a2.status === 409
    && (a2b.error?.message ?? "").includes("T1f4-u1"), `st=${a2.status} ${JSON.stringify(a2b)}`);
  const month = (srow?.["tab_month"] ?? "") as string;
  const logCol = await valuesGet(SS, `${monthlyTabName("EntryLogs", month)}!A2:P100000`);
  const kalahRow = logCol.find((r) => r[12] === cid("2"));
  check("log ditolak_kalah tertulis", kalahRow?.[5] === "ditolak_kalah" && kalahRow?.[7] === u1.id);

  const a3 = await post(ck2, `/api/checklist/${shiftId}/aksi?branch_id=${branchId}`, {
    point_ref: p1, action: "batal", client_action_id: cid("3"),
  });
  const a3b = (await a3.json()) as { state?: string; error?: { code?: string; message?: string } };
  check("u2 batal milik u1 (BR-13)", a3.status === 200 && a3b.state === "belum",
    `st=${a3.status} ${JSON.stringify(a3b)}`);

  const a4 = await post(ck1, `/api/checklist/${shiftId}/aksi?branch_id=${branchId}`, {
    point_ref: p1, action: "selesai", client_action_id: cid("4"),
  });
  check("u1 selesai lagi setelah batal", a4.status === 200);

  const a5 = await post(ck2, `/api/checklist/${shiftId}/aksi?branch_id=${branchId}`, {
    point_ref: p2, action: "selesai", value: "9", client_action_id: cid("5"),
  });
  const a5b = (await a5.json()) as { di_luar_rentang?: boolean; timing_label?: string };
  check("angka 9 di luar rentang tapi diterima + terlambat",
    a5.status === 200 && a5b.di_luar_rentang === true && a5b.timing_label === "terlambat",
    `st=${a5.status} ${JSON.stringify(a5b)}`);

  const a6 = await post(ck1, `/api/checklist/${shiftId}/aksi?branch_id=${branchId}`, {
    point_ref: p3, action: "skip", client_action_id: cid("6"),
  });
  check("skip tanpa alasan 400", a6.status === 400);
  const a7 = await post(ck1, `/api/checklist/${shiftId}/aksi?branch_id=${branchId}`, {
    point_ref: p3, action: "skip", skip_reason: "T1f4 alat rusak", client_action_id: cid("7"),
  });
  check("skip beralasan 200", a7.status === 200);

  const a4ulang = await post(ck1, `/api/checklist/${shiftId}/aksi?branch_id=${branchId}`, {
    point_ref: p1, action: "selesai", client_action_id: cid("4"),
  });
  check("retry cid sama idempoten 200", a4ulang.status === 200);
  const logCol2 = await valuesGet(SS, `${monthlyTabName("EntryLogs", month)}!M2:M100000`);
  check("cid4 hanya satu baris log", logCol2.filter((r) => r[0] === cid("4")).length === 1);

  const ring = await bacaShift(branchId, shiftId);
  check("progress wajib 2/2", ring.progress.wajib_total === 2 && ring.progress.wajib_selesai === 2,
    JSON.stringify(ring.progress));
  check("peserta u1+u2 tercatat", ring.peserta.some((x) => x.user_id === u1.id)
    && ring.peserta.some((x) => x.user_id === u2.id), JSON.stringify(ring.peserta.map((x) => x.user_id)));
  const detail = (await (await get(ck1, `/api/shift/${shiftId}?branch_id=${branchId}`)).json()) as {
    peserta?: Array<{ nama?: string }>;
  };
  check("GET shift peserta bernama", (detail.peserta?.length ?? 0) >= 2
    && (detail.peserta?.every((x) => (x.nama ?? "").length > 0) ?? false));

  const iso = await get(ck3, `/api/checklist/${shiftId}?branch_id=${branchId}`);
  check("tanpa akses cabang 403", iso.status === 403);

  console.log("[7] bersih: nonaktifkan cabang + definisi + pengguna uji");
  await branchesRepo.update(branchId, { is_active: "FALSE", updated_at: nowIso() });
  await brepo("ShiftDefinitions").update(defId, { is_active: "FALSE", updated_at: nowIso() });
  for (const u of [u1, u2, u3]) {
    await revokeAllSessions(u.id, 30).catch(() => undefined);
    await usersRepo.update(u.id, { is_active: "FALSE", updated_at: nowIso() });
  }
  check("cabang nonaktif", (await branchesRepo.get(branchId))?.["is_active"] === "FALSE");

  console.log(`\nringkasan: ${pass} lulus, ${fail} gagal, 0 tunda`);
  console.log("CATATAN: shift uji berjalan (is_test) dibiarkan terbuka — tutup/void milik Fase 5-6.");
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("verifikasi gagal:", (e as Error).message);
  process.exit(1);
});
