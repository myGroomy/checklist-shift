// Verifikasi Fase 6 (Laporan, Berbagi, Operasi Admin).
// Fixture MANDIRI prefix T1f6- di sheet cabang uji (default sheet lama
// 1tUJKzGknSbzSLGH29esPT7yttMC9nt2iY7pP8b4nWiY, bisa dioverride
// TEST_BRANCH_SHEET_ID); baris Branches TESTF6 dinonaktifkan di akhir.
// Jalankan: [TEST_BRANCH_SHEET_ID=<id>] npm run verify:fase6 --workspace=apps/api
// Secret dummy khusus uji (seperti verify-fase5); bukan kredensial asli.
process.env["PIN_PEPPER"] ??= "uji-fase6-pepper";
process.env["SESSION_SECRET"] ??= "uji-fase6-secret-yang-cukup-panjang-32";

import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { Hono } from "hono";
import {
  BRANCH_TEMPLATE_HEADERS,
  MONTHLY_HEADERS,
  REGISTRY_HEADERS,
  monthlyTabName,
  newId,
  nowIso,
} from "@checklist-shift/shared";
import { registryId } from "./lib/env.js";
import { SheetRepo } from "./lib/repo.js";
import { ensureMonthlyTab } from "./lib/monthly.js";
import { hashPin } from "./lib/pin.js";
import { tzParts } from "./lib/close.js";
import authRoutes from "./routes/auth.js";
import handoverRoutes from "./routes/handover.js";
import closeRoutes from "./routes/close.js";
import shareRoutes, { publikApp } from "./routes/share.js";
import opsRoutes from "./routes/ops.js";
import reportRoutes from "./routes/report.js";
import type { AuthEnv } from "./lib/authz.js";

let pass = 0;
let failN = 0;
function check(name: string, ok: boolean, extra = ""): void {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    failN++;
    console.log(`  GAGAL ${name} ${extra}`);
  }
}

function fill(header: string[], patch: Record<string, string>): Record<string, string> {
  const o: Record<string, string> = {};
  for (const h of header) o[h] = patch[h] ?? "";
  return o;
}
const T = (): string => nowIso();

async function main(): Promise<void> {
  const reg = registryId();
  const branchSheet = process.env["TEST_BRANCH_SHEET_ID"] ?? "1tUJKzGknSbzSLGH29esPT7yttMC9nt2iY7pP8b4nWiY";
  if (!reg || !branchSheet) throw new Error("env registry / TEST_BRANCH_SHEET_ID belum lengkap");

  const testApp = new Hono<AuthEnv>();
  // Urutan mount PENTING: publikApp dulu agar GET /publik/r/:token lolos
  // sebelum middleware ALL /api/* (requireAuth) milik app lain (lihat share.ts).
  testApp.route("/api", publikApp);
  testApp.route("/api/auth", authRoutes);
  testApp.route("/api", handoverRoutes);
  testApp.route("/api", closeRoutes);
  testApp.route("/api", shareRoutes);
  testApp.route("/api", opsRoutes);
  testApp.route("/api", reportRoutes);

  const suf = Date.now().toString().slice(-6);
  let ipN = 0;
  const ip = (): string => `t6f${suf}${ipN++}`;
  const cookieFrom = (res: Response): string => (res.headers.get("set-cookie") ?? "").split(";")[0];
  const login = async (username: string, pin: string): Promise<string> => {
    const res = await testApp.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip() },
      body: JSON.stringify({ username, pin }),
    });
    if (res.status !== 200) throw new Error(`login ${username} gagal: ${res.status}`);
    return cookieFrom(res);
  };
  const callRaw = async (cookie: string, path: string, method = "GET", body?: unknown): Promise<Response> => {
    const init: RequestInit = { method, headers: { cookie, "x-forwarded-for": ip() } };
    if (cookie === "") delete (init.headers as Record<string, string>)["cookie"];
    if (body !== undefined) {
      (init.headers as Record<string, string>)["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return testApp.request(path, init);
  };
  // Kuota Sheets 60/mnt dipakai bersama agen paralel: ulangi saat 429/503.
  // GET juga diulang saat 500 (umumnya kuota yang lolos withRetry → "gagal");
  // POST tidak diulang agar tak menutup bug sebenarnya.
  const call = async (cookie: string, path: string, method = "GET", body?: unknown): Promise<Response> => {
    let res = await callRaw(cookie, path, method, body);
    for (let i = 0; i < 8 && (res.status === 429 || res.status === 503); i++) {
      console.log(`  kuota sibuk (${res.status}), tunggu 30 dtk…`);
      await new Promise((r) => setTimeout(r, 30000));
      res = await callRaw(cookie, path, method, body);
    }
    if (method === "GET") {
      for (let i = 0; i < 4 && res.status === 500; i++) {
        console.log("  baca 500 (kemungkinan kuota), tunggu 30 dtk…");
        await new Promise((r) => setTimeout(r, 30000));
        res = await callRaw(cookie, path, method, body);
      }
    }
    return res;
  };

  const now = T();
  const { month } = tzParts(now, "Asia/Jakarta");
  const todayJakarta = tzParts(now, "Asia/Jakarta").date;
  const { valuesGet, sheetsClient, valuesUpdate } = await import("./lib/sheets.js");

  console.log("[0] pastikan tab cabang + ShareTokens registry ada");
  {
    const api = sheetsClient();
    const meta = await api.spreadsheets.get({ spreadsheetId: branchSheet, fields: "sheets.properties.title" });
    const have = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));
    const all: Record<string, string[]> = { _meta: ["key", "value"], ...BRANCH_TEMPLATE_HEADERS };
    const missing = Object.entries(all).filter(([t]) => !have.has(t));
    if (missing.length > 0) {
      await api.spreadsheets.batchUpdate({
        spreadsheetId: branchSheet,
        requestBody: {
          requests: missing.map(([title, header]) => ({
            addSheet: { properties: { title, gridProperties: { rowCount: 1000, columnCount: header.length, frozenRowCount: 1 } } },
          })),
        },
      });
    }
    for (const [title, header] of Object.entries(all)) {
      const rows = await valuesGet(branchSheet, `${title}!A1:Z1`);
      if ((rows[0] ?? []).length === 0) await valuesUpdate(branchSheet, `${title}!A1`, [header]);
    }
    for (const base of ["Entries", "Handovers", "HandoverAcks", "Incidents", "IncidentNotes", "Photos", "AuditLog"]) {
      await ensureMonthlyTab(branchSheet, base, month);
    }
    const regMeta = await api.spreadsheets.get({ spreadsheetId: reg, fields: "sheets.properties.title" });
    const regHave = new Set((regMeta.data.sheets ?? []).map((s) => s.properties?.title));
    if (!regHave.has("ShareTokens")) {
      const header = REGISTRY_HEADERS["ShareTokens"];
      await api.spreadsheets.batchUpdate({
        spreadsheetId: reg,
        requestBody: { requests: [{ addSheet: { properties: { title: "ShareTokens", gridProperties: { rowCount: 1000, columnCount: header.length, frozenRowCount: 1 } } } }] },
      });
      await valuesUpdate(reg, "ShareTokens!A1", [header]);
    }
  }
  check("tab siap", true);

  console.log("[1] cabang TESTF6 + akun + kategori");
  const shiftAllRepo = new SheetRepo(branchSheet, "ShiftInstances", BRANCH_TEMPLATE_HEADERS["ShiftInstances"]);
  const defRows = await valuesGet(branchSheet, "ShiftDefinitions!A2:B10000");
  const t1f6DefIds = new Set(defRows.filter((r) => String(r[1] ?? "").startsWith("T1f6-")).map((r) => r[0]));
  if (t1f6DefIds.size > 0) {
    const sRows = await valuesGet(branchSheet, "ShiftInstances!A2:F100000");
    let voided = 0;
    for (const r of sRows) {
      if (t1f6DefIds.has(r[1]) && r[4] === "berjalan") {
        await shiftAllRepo.update(r[0], { status: "void", void_reason: "bersih sisa run uji fase6", void_at: T(), updated_at: T() });
        voided++;
      }
    }
    console.log(`  sisa run di-void: ${voided}`);
  }
  const branchRepo = new SheetRepo(reg, "Branches", REGISTRY_HEADERS["Branches"]);
  const bRows = await valuesGet(reg, "Branches!A2:H10000");
  const bHit = bRows.find((r) => r[2] === "TESTF6");
  let branchId: string;
  if (bHit) {
    branchId = bHit[0];
    await branchRepo.update(branchId, { spreadsheet_id: branchSheet, is_active: "TRUE", updated_at: now });
  } else {
    branchId = newId();
    await branchRepo.append(fill(REGISTRY_HEADERS["Branches"], {
      id: branchId, name: "T1f6-Cabang Uji", code: "TESTF6", timezone: "Asia/Jakarta",
      spreadsheet_id: branchSheet, schema_version: "1", is_active: "TRUE",
      created_at: now, updated_at: now,
    }));
  }
  // Satu cabang aktif per sheet: nonaktifkan baris uji lain yang menunjuk sheet
  // sama agar resolusi cabang (findShift) tidak ambigu. Hanya kode TEST*/T1*.
  // TIDAK menyentuh cabang non-uji.
  {
    const all = await valuesGet(reg, "Branches!A2:H100000");
    for (const r of all) {
      const code = String(r[2] ?? "");
      const sameSheet = String(r[5] ?? "") === branchSheet;
      const isTestCode = code === "TESTF6" || code.startsWith("TEST") || code.startsWith("T1");
      if (r[0] !== branchId && sameSheet && r[7] === "TRUE" && isTestCode) {
        await branchRepo.update(r[0], { is_active: "FALSE", updated_at: T() });
        console.log(`  cabang uji ganda dinonaktifkan: ${code}`);
      }
    }
  }
  const usersRepo = new SheetRepo(reg, "Users", REGISTRY_HEADERS["Users"]);
  const mkUser = async (tag: string, role: "admin" | "petugas", pin: string): Promise<{ id: string; username: string }> => {
    const username = `t1f6${tag}${suf}`;
    const colC = await valuesGet(reg, "Users!C2:C10000");
    const colA = await valuesGet(reg, "Users!A2:A10000");
    const idx = colC.findIndex((r) => r[0] === username);
    if (idx >= 0 && colA[idx]?.[0]) {
      const id = colA[idx][0];
      await usersRepo.update(id, { pin_hash: await hashPin(pin), is_active: "TRUE", role, updated_at: T() });
      return { id, username };
    }
    const id = newId();
    await usersRepo.append(fill(REGISTRY_HEADERS["Users"], {
      id, name: `T1f6-${tag}`, username, pin_hash: await hashPin(pin),
      role, is_active: "TRUE", must_change_pin: "FALSE",
      created_at: now, updated_at: now, version: "1",
    }));
    return { id, username };
  };
  const PIN_PJ = "482917";
  const PIN_P2 = "739164";
  const PIN_ADM = "618342";
  const pj = await mkUser("pj", "petugas", PIN_PJ);
  const p2 = await mkUser("p2", "petugas", PIN_P2);
  const adm = await mkUser("adm", "admin", PIN_ADM);
  const px = await mkUser("px", "petugas", "271839"); // tanpa akses cabang
  const accessRepo = new SheetRepo(reg, "UserBranchAccess", REGISTRY_HEADERS["UserBranchAccess"]);
  for (const u of [pj, p2]) {
    await accessRepo.append(fill(REGISTRY_HEADERS["UserBranchAccess"], {
      id: newId(), user_id: u.id, branch_id: branchId, granted_by: adm.id,
      is_active: "TRUE", created_at: now, updated_at: now,
    }));
  }
  const catRepo = new SheetRepo(reg, "IncidentCategories", REGISTRY_HEADERS["IncidentCategories"]);
  const cRows = await valuesGet(reg, "IncidentCategories!A2:E10000");
  const cHit = cRows.find((r) => r[1] === "T1f6-Kategori Uji");
  let catId: string;
  if (cHit) {
    catId = cHit[0];
    await catRepo.update(catId, { is_active: "TRUE", updated_at: now });
  } else {
    catId = newId();
    await catRepo.append(fill(REGISTRY_HEADERS["IncidentCategories"], {
      id: catId, name: "T1f6-Kategori Uji", sort_order: "99", is_active: "TRUE",
      created_at: now, updated_at: now,
    }));
  }
  check("cabang TESTF6 + akun + kategori siap", true);

  console.log("[2] fixture 4 definisi + snapshot + shift S1 berjalan");
  const mkTemplate = async (label: string): Promise<{ defId: string; pt1: string; pt2: string; hf1: string; snapB64: string; snapHash: string }> => {
    const defId = newId();
    const sopId = newId();
    const pt1 = newId();
    const pt2 = newId();
    const hf1 = newId();
    await new SheetRepo(branchSheet, "ShiftDefinitions", BRANCH_TEMPLATE_HEADERS["ShiftDefinitions"]).append(
      fill(BRANCH_TEMPLATE_HEADERS["ShiftDefinitions"], {
        id: defId, name: `T1f6-${label}`, start_time: "07:00", end_time: "15:00",
        crosses_midnight: "FALSE", sort_order: "1", is_active: "TRUE",
        created_at: now, updated_at: now, version: "1",
      }));
    await new SheetRepo(branchSheet, "SopCategories", BRANCH_TEMPLATE_HEADERS["SopCategories"]).append(
      fill(BRANCH_TEMPLATE_HEADERS["SopCategories"], {
        id: sopId, shift_definition_id: defId, name: "T1f6-Kebersihan",
        sort_order: "1", is_active: "TRUE", created_at: now, updated_at: now, version: "1",
      }));
    for (const [pid, title] of [[pt1, `T1f6-${label}-Wajib1`], [pt2, `T1f6-${label}-Wajib2`]]) {
      await new SheetRepo(branchSheet, "ChecklistPoints", BRANCH_TEMPLATE_HEADERS["ChecklistPoints"]).append(
        fill(BRANCH_TEMPLATE_HEADERS["ChecklistPoints"], {
          id: pid, sop_category_id: sopId, title, input_type: "centang",
          is_required: "TRUE", sort_order: "1", is_active: "TRUE",
          created_at: now, updated_at: now, version: "1",
        }));
    }
    await new SheetRepo(branchSheet, "HandoverFields", BRANCH_TEMPLATE_HEADERS["HandoverFields"]).append(
      fill(BRANCH_TEMPLATE_HEADERS["HandoverFields"], {
        id: hf1, shift_definition_id: defId, label: "T1f6-Kas awal", field_type: "teks",
        is_required: "TRUE", sort_order: "1", is_active: "TRUE",
        created_at: now, updated_at: now, version: "1",
      }));
    const snapObj = {
      v: 1,
      shift: { id: defId, name: `T1f6-${label}`, start_time: "07:00", end_time: "15:00", crosses_midnight: false },
      settings: { tolerance_default_minutes: 15, timezone: "Asia/Jakarta" },
      categories: [{
        id: sopId, name: "T1f6-Kebersihan", sort_order: 1,
        points: [
          { point_ref: pt1, title: `T1f6-${label}-Wajib1`, input_type: "centang", is_required: true, sort_order: 1 },
          { point_ref: pt2, title: `T1f6-${label}-Wajib2`, input_type: "centang", is_required: true, sort_order: 2 },
        ],
      }],
      handover_fields: [{ id: hf1, label: "T1f6-Kas awal", field_type: "teks", is_required: true, sort_order: 1 }],
    };
    const snapJson = JSON.stringify(snapObj);
    return {
      defId, pt1, pt2, hf1,
      snapB64: Buffer.from(gzipSync(snapJson)).toString("base64"),
      snapHash: createHash("sha256").update(snapJson).digest("hex"),
    };
  };
  const mkShift = async (t: { defId: string; snapB64: string; snapHash: string }, ownerId: string): Promise<string> => {
    const sid = newId();
    await shiftAllRepo.append(fill(BRANCH_TEMPLATE_HEADERS["ShiftInstances"], {
      id: sid, shift_definition_id: t.defId, shift_date: todayJakarta, tab_month: month,
      status: "berjalan", pj_user_id: ownerId, opened_by: ownerId, opened_at: now,
      opened_outside_hours: "FALSE", is_incomplete: "FALSE", no_incident_confirmed: "FALSE",
      is_test: "TRUE", snapshot_encoding: "gzip_b64", template_snapshot: t.snapB64,
      snapshot_hash: t.snapHash, created_at: now, updated_at: now, version: "1",
    }));
    await new SheetRepo(branchSheet, "Participants", BRANCH_TEMPLATE_HEADERS["Participants"]).append(
      fill(BRANCH_TEMPLATE_HEADERS["Participants"], {
        id: newId(), shift_instance_id: sid, user_id: ownerId,
        first_action_at: now, first_action_type: "buka_shift", created_at: now,
      }));
    return sid;
  };
  const tA = await mkTemplate("ShiftA");
  const tB = await mkTemplate("ShiftB");
  const tC = await mkTemplate("ShiftC");
  const tD = await mkTemplate("ShiftD");
  const s1 = await mkShift(tA, pj.id);
  const entryTab = monthlyTabName("Entries", month);
  const entryRepo = new SheetRepo(branchSheet, entryTab, MONTHLY_HEADERS["Entries"]);
  for (const pref of [tA.pt1, tA.pt2]) {
    await entryRepo.append(fill(MONTHLY_HEADERS["Entries"], {
      id: newId(), shift_instance_id: s1, point_ref: pref, state: "selesai",
      value: "TRUE", out_of_range: "FALSE", completed_by: pj.id, completed_at: now,
      created_at: now, updated_at: now, version: "1",
    }));
  }
  const ckPj = await login(pj.username, PIN_PJ);
  const ckP2 = await login(p2.username, PIN_P2);
  const ckAdm = await login(adm.username, PIN_ADM);
  const ckPx = await login(px.username, "271839");
  check("login pj/p2/adm/px", Boolean(ckPj && ckP2 && ckAdm && ckPx));
  const hOk = await call(ckPj, `/api/shift/${s1}/handover`, "POST",
    { values: { [tA.hf1]: "100000" }, free_text: "T1f6 serah terima", photo_ids: [] });
  check("handover S1 201", hOk.status === 201, `dapat ${hOk.status}`);
  const rTutup = await call(ckPj, `/api/shift/${s1}/tutup`, "POST",
    { handover: null, no_incident_confirmed: true, pin: PIN_PJ });
  const tutupBody = (await rTutup.json()) as { laporan?: { report_number?: string } };
  check("tutup S1 201", rTutup.status === 201, `dapat ${rTutup.status}`);
  const reportsRepo = new SheetRepo(branchSheet, "Reports", BRANCH_TEMPLATE_HEADERS["Reports"]);
  const allReports = await valuesGet(branchSheet, "Reports!A2:C100000");
  const r1Hit = allReports.find((r) => r[1] === s1);
  const r1Id = r1Hit?.[0] ?? "";
  check("laporan R1 ada", Boolean(r1Id) && /^TESTF6-\d{8}-\d{2}$/.test(tutupBody.laporan?.report_number ?? ""));
  // Incident fixture langsung via repo (tert-aut ke S1).
  const incId = newId();
  await new SheetRepo(branchSheet, monthlyTabName("Incidents", month), MONTHLY_HEADERS["Incidents"]).append(
    fill(MONTHLY_HEADERS["Incidents"], {
      id: incId, shift_instance_id: s1, tab_month: month, category_id: catId,
      description: "T1f6-Incident uji", occurred_at: now, reported_by: p2.id,
      reported_at: now, status: "open", outside_shift: "FALSE", link_source: "otomatis",
      is_test: "TRUE", created_at: now, updated_at: now, version: "1",
    }));
  await new SheetRepo(branchSheet, "IncidentIndex", BRANCH_TEMPLATE_HEADERS["IncidentIndex"]).append({
    incident_id: incId, tab_month: month, status: "open", category_id: catId,
    shift_instance_id: s1, outside_shift: "FALSE", reported_at: now, is_test: "TRUE", updated_at: now,
  });

  console.log("[3] bagikan + publik valid");
  const bag1 = await call(ckPj, `/api/laporan/${s1}/bagikan`, "POST", {});
  const bag1Body = (await bag1.json()) as {
    token?: { id?: string; token?: string; expires_at?: string };
    tautan?: string; pesan?: string; tautan_wa?: string;
  };
  const tok1 = String(bag1Body.token?.token ?? "");
  check("bagikan 201 + token/tautan/pesan", bag1.status === 201 && tok1.includes(".")
    && String(bag1Body.tautan ?? "").includes("/r/") && String(bag1Body.tautan_wa ?? "").startsWith("https://wa.me/"),
    `dapat ${bag1.status}`);
  check("pesan tanpa variabel mentah", !String(bag1Body.pesan ?? "").includes("{tautan}")
    && String(bag1Body.pesan ?? "").includes(String(bag1Body.tautan ?? "")));
  const pub1 = await call("", `/api/publik/r/${tok1}`);
  const pub1Text = await pub1.text();
  let pub1Body: {
    shift?: { id?: string }; checklist?: unknown[]; handover?: { free_text?: string } | null;
    incident_ids?: string[]; kontribusi?: unknown[]; addendum?: unknown[]; laporan?: { id?: string } | null;
  } = {};
  try {
    pub1Body = JSON.parse(pub1Text) as typeof pub1Body;
  } catch {
    pub1Body = {};
  }
  check("publik valid 200 + isi lengkap", pub1.status === 200 && pub1Body.shift?.id === s1
    && Array.isArray(pub1Body.checklist) && Boolean(pub1Body.handover?.free_text?.includes("T1f6"))
    && (pub1Body.incident_ids ?? []).includes(incId) && Array.isArray(pub1Body.kontribusi)
    && Array.isArray(pub1Body.addendum) && pub1Body.laporan?.id === r1Id, `dapat ${pub1.status} ${pub1Text.slice(0, 160)}`);
  const lapListRes = await call(ckPj, `/api/laporan?branch_id=${branchId}`);
  const lapListText = await lapListRes.text();
  let lapList: { laporan?: { shift_instance_id?: string }[] } = {};
  try {
    lapList = JSON.parse(lapListText) as typeof lapList;
  } catch {
    lapList = {};
  }
  check("daftar laporan memuat S1", (lapList.laporan ?? []).some((l) => l.shift_instance_id === s1),
    `dapat ${lapListRes.status} ${lapListText.slice(0, 160)}`);
  const lapFilter = (await (await call(ckPj, `/api/laporan?status=berjalan`)).json()) as { laporan?: { shift_instance_id?: string }[] };
  check("filter status=berjalan tak memuat S1", !(lapFilter.laporan ?? []).some((l) => l.shift_instance_id === s1));
  const detil = await call(ckPj, `/api/laporan/${s1}`);
  check("detail dipakai dari close.ts 200", detil.status === 200, `dapat ${detil.status}`);

  console.log("[4] token kedaluwarsa / dicabut / acak");
  const bag2 = (await (await call(ckPj, `/api/laporan/${s1}/bagikan`, "POST", {})).json()) as { token?: { id?: string; token?: string } };
  const tok2Id = String(bag2.token?.id ?? "");
  const tok2 = String(bag2.token?.token ?? "");
  const tokenRegRepo = new SheetRepo(reg, "ShareTokens", REGISTRY_HEADERS["ShareTokens"]);
  await tokenRegRepo.update(tok2Id, { expires_at: new Date(Date.parse(now) - 3600000).toISOString() });
  const pubKad = await call("", `/api/publik/r/${tok2}`);
  check("token kedaluwarsa 410", pubKad.status === 410, `dapat ${pubKad.status}`);
  const bag3 = (await (await call(ckPj, `/api/laporan/${s1}/bagikan`, "POST", {})).json()) as { token?: { id?: string; token?: string } };
  const tok3Id = String(bag3.token?.id ?? "");
  const tok3 = String(bag3.token?.token ?? "");
  const cabutTanpa = await call(ckAdm, `/api/laporan/token/${tok3Id}`, "DELETE", {});
  check("cabut admin tanpa alasan 400", cabutTanpa.status === 400, `dapat ${cabutTanpa.status}`);
  const cabutPx = await call(ckPx, `/api/laporan/token/${tok3Id}`, "DELETE", {});
  check("cabut bukan admin/pembuat 403", cabutPx.status === 403, `dapat ${cabutPx.status}`);
  const cabutOk = await call(ckAdm, `/api/laporan/token/${tok3Id}`, "DELETE", { alasan: "uji fase6" });
  check("cabut admin + alasan 200", cabutOk.status === 200, `dapat ${cabutOk.status}`);
  const pubCabut = await call("", `/api/publik/r/${tok3}`);
  check("token dicabut 410", pubCabut.status === 410, `dapat ${pubCabut.status}`);
  const pubAcak = await call("", `/api/publik/r/${newId()}.abcdefghijklmnopqrstuvwxyz0123456789AB`);
  const pubAcakBody = (await pubAcak.json()) as Record<string, unknown>;
  check("token acak 404 tanpa bocor", pubAcak.status === 404 && !("shift" in pubAcakBody) && !("laporan" in pubAcakBody), `dapat ${pubAcak.status}`);

  console.log("[5] tutup paksa (S2 tak lengkap)");
  const s2 = await mkShift(tB, pj.id);
  await entryRepo.append(fill(MONTHLY_HEADERS["Entries"], {
    id: newId(), shift_instance_id: s2, point_ref: tB.pt1, state: "selesai",
    value: "TRUE", out_of_range: "FALSE", completed_by: pj.id, completed_at: now,
    created_at: now, updated_at: now, version: "1",
  }));
  const paksaTanpa = await call(ckAdm, `/api/ops/shift/${s2}/tutup-paksa`, "POST", { pin: PIN_ADM });
  check("tutup paksa tanpa alasan 400", paksaTanpa.status === 400, `dapat ${paksaTanpa.status}`);
  const paksaPinSalah = await call(ckAdm, `/api/ops/shift/${s2}/tutup-paksa`, "POST", { alasan: "uji", pin: "000000" });
  check("tutup paksa PIN salah 401", paksaPinSalah.status === 401, `dapat ${paksaPinSalah.status}`);
  const paksaP2 = await call(ckP2, `/api/ops/shift/${s2}/tutup-paksa`, "POST", { alasan: "uji", pin: PIN_P2 });
  check("tutup paksa non-admin 403", paksaP2.status === 403, `dapat ${paksaP2.status}`);
  const paksaOk = await call(ckAdm, `/api/ops/shift/${s2}/tutup-paksa`, "POST", { alasan: "PJ pulang mendadak (uji fase6)", pin: PIN_ADM });
  const paksaBody = (await paksaOk.json()) as { is_incomplete?: boolean; laporan?: { id?: string } };
  check("tutup paksa 201 + tak lengkap", paksaOk.status === 201 && paksaBody.is_incomplete === true, `dapat ${paksaOk.status}`);
  const s2Row = await shiftAllRepo.get(s2);
  check("S2 ditutup_paksa + laporan terkunci", s2Row?.["status"] === "ditutup_paksa"
    && s2Row?.["close_type"] === "paksa" && s2Row?.["is_incomplete"] === "TRUE"
    && (await reportsRepo.get(String(paksaBody.laporan?.id ?? "")))?.["is_locked"] === "TRUE");

  console.log("[6] ganti PJ (S3) + audit tercatat");
  const s3 = await mkShift(tC, pj.id);
  // Topologi sheet uji: 16 baris Branches menunjuk satu spreadsheet yang sama;
  // findShift admin mengembalikan baris PERTAMA (urutan registry). Beri p2/pj
  // akses ke baris pertama itu agar uji positif bermakna (produksi: 1 baris =
  // 1 sheet sehingga masalah ini tidak ada).
  const semuaCabang = await valuesGet(reg, "Branches!A2:F10000");
  const pertama = semuaCabang.find((r) => r[5] === branchSheet)?.[0] ?? branchId;
  for (const u of [pj, p2]) {
    const ada = (await valuesGet(reg, "UserBranchAccess!A2:E10000"))
      .some((r) => r[1] === u.id && r[2] === pertama && r[4] === "TRUE");
    if (!ada && pertama !== branchId) {
      await accessRepo.append(fill(REGISTRY_HEADERS["UserBranchAccess"], {
        id: newId(), user_id: u.id, branch_id: pertama, granted_by: adm.id,
        is_active: "TRUE", created_at: now, updated_at: now,
      }));
    }
  }
  const gantiTanpaAkses = await call(ckAdm, `/api/ops/shift/${s3}/ganti-pj`, "POST",
    { petugas_baru_user_id: px.id, alasan: "uji", pin: PIN_ADM });
  check("ganti PJ tanpa akses cabang 403", gantiTanpaAkses.status === 403, `dapat ${gantiTanpaAkses.status}`);
  const gantiOk = await call(ckAdm, `/api/ops/shift/${s3}/ganti-pj`, "POST",
    { petugas_baru_user_id: p2.id, alasan: "PJ sakit (uji fase6)", pin: PIN_ADM });
  const gantiText = await gantiOk.text();
  let gantiBody: { dari?: string; ke?: string } = {};
  try {
    gantiBody = JSON.parse(gantiText) as typeof gantiBody;
  } catch {
    gantiBody = {};
  }
  check("ganti PJ 200 dari→ke", gantiOk.status === 200 && gantiBody.dari === pj.id && gantiBody.ke === p2.id, `dapat ${gantiOk.status} ${gantiText.slice(0, 160)}`);
  check("PJ S3 berubah", (await shiftAllRepo.get(s3))?.["pj_user_id"] === p2.id);
  const auditRows = await valuesGet(branchSheet, `${monthlyTabName("AuditLog", month)}!A2:N100000`);
  check("audit shift.ganti_pj tercatat", auditRows.some((r) => r[4] === "shift.ganti_pj" && r[6] === s3 && r[11] === "PJ sakit (uji fase6)"));

  console.log("[7] buka atas nama + ganda 409");
  const atasNama = await call(ckAdm, "/api/ops/shift/buka-atas-nama", "POST",
    { branch_id: branchId, shift_definition_id: tD.defId, petugas_user_id: p2.id, alasan: "PJ lupa membuka (uji fase6)" });
  const atasBody = (await atasNama.json()) as { shift?: { id?: string } };
  const s4 = String(atasBody.shift?.id ?? "");
  check("buka atas nama 201", atasNama.status === 201 && Boolean(s4), `dapat ${atasNama.status}`);
  const s4Row = s4 ? await shiftAllRepo.get(s4) : null;
  check("opened_by=admin pj=petugas", s4Row?.["opened_by"] === adm.id && s4Row?.["pj_user_id"] === p2.id && s4Row?.["status"] === "berjalan");
  const atasGanda = await call(ckAdm, "/api/ops/shift/buka-atas-nama", "POST",
    { branch_id: branchId, shift_definition_id: tD.defId, petugas_user_id: p2.id, alasan: "uji ganda" });
  check("buka atas nama ganda 409 (BR-01)", atasGanda.status === 409, `dapat ${atasGanda.status}`);

  console.log("[8] void S1 (ditutup): status void + laporan tak berubah");
  const hashSebelum = (await reportsRepo.get(r1Id))?.["content_hash"] ?? "";
  const voidOk = await call(ckAdm, `/api/ops/shift/${s1}/void`, "POST", { alasan: "dibuka untuk uji (uji fase6)", pin: PIN_ADM });
  check("void 200", voidOk.status === 200, `dapat ${voidOk.status}`);
  const s1Row = await shiftAllRepo.get(s1);
  check("S1 void", s1Row?.["status"] === "void" && String(s1Row?.["void_reason"] ?? "").includes("uji fase6"));
  check("laporan tak berubah", (await reportsRepo.get(r1Id))?.["content_hash"] === hashSebelum);

  console.log("[9] addendum tak mengubah isi");
  const addKosong = await call(ckAdm, `/api/laporan/${r1Id}/addendum`, "POST", { note: "" });
  check("addendum kosong 400", addKosong.status === 400, `dapat ${addKosong.status}`);
  const addOk = await call(ckAdm, `/api/laporan/${r1Id}/addendum`, "POST", { note: "T1f6-koreksi: kas awal seharusnya 150000" });
  check("addendum 201", addOk.status === 201, `dapat ${addOk.status}`);
  check("isi laporan tetap + addendum tampil di publik", (await reportsRepo.get(r1Id))?.["content_hash"] === hashSebelum
    && (await (await call("", `/api/publik/r/${tok1}`)).json() as { addendum?: { note?: string }[] }).addendum?.some((a) => String(a.note).includes("150000")) === true);

  console.log("[10] buka kunci: alasan+PIN, unlock_count, tulis tetap ditolak");
  const kunciTanpa = await call(ckAdm, `/api/laporan/${r1Id}/buka-kunci`, "POST", { pin: PIN_ADM });
  check("buka kunci tanpa alasan 400", kunciTanpa.status === 400, `dapat ${kunciTanpa.status}`);
  const kunciPinSalah = await call(ckAdm, `/api/laporan/${r1Id}/buka-kunci`, "POST", { alasan: "uji", pin: "000000" });
  check("buka kunci PIN salah 401", kunciPinSalah.status === 401, `dapat ${kunciPinSalah.status}`);
  const kunciOk = await call(ckAdm, `/api/laporan/${r1Id}/buka-kunci`, "POST", { alasan: "darurat uji fase6", pin: PIN_ADM });
  const kunciBody = (await kunciOk.json()) as { unlock_count?: number };
  check("buka kunci 200 + unlock_count 1", kunciOk.status === 200 && kunciBody.unlock_count === 1, `dapat ${kunciOk.status}`);
  const r1sesudah = await reportsRepo.get(r1Id);
  check("is_locked FALSE tercatat", r1sesudah?.["is_locked"] === "FALSE" && r1sesudah?.["last_unlocked_by"] === adm.id);
  const tulisTolak = await call(ckPj, `/api/shift/${s1}/handover`, "POST",
    { values: { [tA.hf1]: "999" }, free_text: "", photo_ids: [] });
  check("tulis setelah buka kunci tetap 409", tulisTolak.status === 409, `dapat ${tulisTolak.status}`);

  console.log("[11] bersih: void sisa berjalan + nonaktifkan");
  const sisa = await valuesGet(branchSheet, "ShiftInstances!A2:F100000");
  for (const r of sisa) {
    if (t1f6DefIds.has(r[1]) && r[4] === "berjalan") {
      await shiftAllRepo.update(r[0], { status: "void", void_reason: "bersih akhir uji fase6", void_at: T(), updated_at: T() });
    }
  }
  for (const u of [pj, p2, adm, px]) {
    await usersRepo.update(u.id, { is_active: "FALSE", updated_at: T() });
  }
  await branchRepo.update(branchId, { is_active: "FALSE", updated_at: T() });
  check("cabang TESTF6 + akun uji dinonaktifkan", (await branchRepo.get(branchId))?.["is_active"] === "FALSE");

  console.log(`\nringkasan: ${pass} lulus, ${failN} gagal`);
  if (failN > 0) process.exit(1);
}

main().catch((e) => {
  console.error("verifikasi gagal:", (e as Error).message);
  process.exit(1);
});
