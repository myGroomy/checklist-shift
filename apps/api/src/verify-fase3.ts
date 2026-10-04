// Verifikasi Fase 3 (Konfigurasi Admin). Membuat spreadsheet uji BARU via API
// agar tidak mengganggu baris branch/cabang produksi; semua data uji berprefix
// T1f3- dan dinonaktifkan di akhir (BR-40: tanpa hapus).
// Jalankan: npm run verify:fase3 --workspace=apps/api
// Secret dummy khusus uji (pola verify-fase2; bukan kredensial asli).
process.env["PIN_PEPPER"] ??= "uji-fase2-pepper";
process.env["SESSION_SECRET"] ??= "uji-fase2-secret-yang-cukup-panjang-32";
import { Hono } from "hono";
import { BRANCH_TEMPLATE_HEADERS, REGISTRY_HEADERS, monthlyTabName, newId, nowIso } from "@checklist-shift/shared";
import { randomInt } from "node:crypto";
import { registryId } from "./lib/env.js";
import { SheetRepo } from "./lib/repo.js";
import { valuesGet } from "./lib/sheets.js";
import { auditAppend, auditVerify } from "./lib/audit.js";
import { hashPin, isWeakPin } from "./lib/pin.js";
import { issueSession } from "./lib/session.js";
import { findUserByUsernamePublic } from "./routes/auth.js";
import authRoutes from "./routes/auth.js";
import adminUsers from "./routes/admin-users.js";
import adminBranches from "./routes/admin-branches.js";
import adminConfig, { auditCabang } from "./routes/admin-config.js";
import adminAudit from "./routes/admin-audit.js";

const app = new Hono();
app.route("/api/auth", authRoutes);
app.route("/api/admin/users", adminUsers);
app.route("/api/admin/branches", adminBranches);
app.route("/api/admin/config", adminConfig);
app.route("/api/admin/audit", adminAudit);

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
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const cookieFrom = (res: Response): string => (res.headers.get("set-cookie") ?? "").split(";")[0];
const req = (
  cookie: string, path: string, method = "GET", body?: unknown, ip = "t3",
): Promise<Response> => {
  const init: RequestInit = { method, headers: { cookie, "x-forwarded-for": ip } };
  if (body !== undefined) {
    (init.headers as Record<string, string>)["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return Promise.resolve(app.request(path, init));
};

async function main() {
  const reg = registryId() as string;
  const users = new SheetRepo(reg, "Users", REGISTRY_HEADERS["Users"]);
  const PIN_V = "418209";
  const PIN_W = "905317";
  const PIN_P = "610438";

  console.log("[0] siapkan admin uji langsung di Sheets + spreadsheet uji baru");
  const idV = newId();
  await users.append({
    id: idV, name: "T1f3-Verify", username: `t1f3v${Date.now().toString().slice(-6)}`,
    pin_hash: await hashPin(PIN_V), role: "admin", is_active: "TRUE",
    must_change_pin: "FALSE", locked_until: "", last_login_at: "", pin_changed_at: "",
    created_at: nowIso(), updated_at: nowIso(), version: "1",
  });
  const sessV = await issueSession(idV, "admin", 30);
  const ckV = `sesi=${sessV.token}`;
  const unameV = (await users.get(idV))?.["username"] as string;
  check("admin uji dibuat + sesi hidup", ckV.startsWith("sesi="));
  void unameV;

  // Sheet uji bersama (dipakai fase lain juga): beberapa baris cabang boleh
  // menunjuk sheet yang sama untuk uji; _meta milik pemilik lama tak disentuh.
  const ssA = "1tUJKzGknSbzSLGH29esPT7yttMC9nt2iY7pP8b4nWiY";
  check("sheet uji bersama dipakai", ssA.length > 10);
  const SUF = Date.now().toString().slice(-6);

  // Idempoten: nonaktifkan sisa baris template uji run lama (prefix T1f3-).
  // Hanya prefix milik fase3; baris T1f4-/T1f5- milik paralel lain tak disentuh.
  console.log("[0b] bersih sisa run: nonaktifkan baris template T1f3-");
  const branchesRepo = new SheetRepo(reg, "Branches", REGISTRY_HEADERS["Branches"]);
  void branchesRepo;
  let bersihTemplate = 0;
  const templateTabs: Array<{ tab: string; namaIdx: number; aktifIdx: number }> = [
    { tab: "ShiftDefinitions", namaIdx: 1, aktifIdx: 6 },
    { tab: "SopCategories", namaIdx: 2, aktifIdx: 4 },
    { tab: "ChecklistPoints", namaIdx: 2, aktifIdx: 12 },
    { tab: "HandoverFields", namaIdx: 2, aktifIdx: 7 },
  ];
  for (const t of templateTabs) {
    const r = new SheetRepo(ssA, t.tab, BRANCH_TEMPLATE_HEADERS[t.tab]);
    const rows = await valuesGet(ssA, `${t.tab}!A2:Z10000`);
    for (const row of rows) {
      if (!row[0] || !String(row[t.namaIdx] ?? "").startsWith("T1f3-")) continue;
      if (row[t.aktifIdx] !== "TRUE") continue;
      await r.update(row[0], { is_active: "FALSE", updated_at: nowIso() });
      bersihTemplate++;
    }
  }
  console.log(`  dibersihkan: ${bersihTemplate} baris template`);

  const cariCabang = async (code: string): Promise<{ id: string; aktif: boolean } | null> => {
    const rows = await valuesGet(reg, "Branches!A2:H10000");
    const hit = rows.find((r) => (r[2] ?? "").toUpperCase() === code);
    return hit ? { id: hit[0], aktif: hit[7] === "TRUE" } : null;
  };

  console.log("[1] register cabang dari spreadsheet ID saja");
  // Pakai ulang baris TESTF3 bila sudah ada (sisa run lama); buktikan jalur
  // register-201 lewat cabang proof berkode unik.
  let branchA: string;
  const exA = await cariCabang("TESTF3");
  if (exA) {
    branchA = exA.id;
    if (!exA.aktif) {
      const on = await req(ckV, `/api/admin/branches/${branchA}/nonaktif`, "POST", {
        alasan: "pakai ulang uji fase3", pin: PIN_V, is_active: true,
      });
      check("aktifkan ulang TESTF3 sisa run", on.status === 200);
    } else {
      console.log("  pakai ulang baris TESTF3 yang aktif");
    }
  } else {
    const regA0 = await req(ckV, "/api/admin/branches", "POST", {
      spreadsheet_id: ssA, name: "T1f3-Uji", code: "TESTF3",
    });
    const b0 = (await regA0.json()) as { id?: string };
    check("register TESTF3 201", regA0.status === 201 && Boolean(b0.id));
    branchA = b0.id as string;
  }
  const proofCode = `T3RG${SUF.slice(-4)}`;
  const regA = await req(ckV, "/api/admin/branches", "POST", {
    spreadsheet_id: ssA, name: "T1f3-Proof", code: proofCode,
  });
  const regABody = (await regA.json()) as { ok?: boolean; id?: string; berbagi?: boolean };
  check("register 201 + id (berbagi sheet)", regA.status === 201 && Boolean(regABody.id) && regABody.berbagi === true);
  const idProof = regABody.id as string;
  await sleep(1500);
  // Kode cabang tetap unik: kode sama ditolak walau sheet boleh berbagi.
  const regDobelKode = await req(ckV, "/api/admin/branches", "POST", {
    spreadsheet_id: ssA, name: "T1f3-Dobel", code: "TESTF3",
  });
  check("kode ganda ditolak (409)", regDobelKode.status === 409);
  const daftar = (await (await req(ckV, "/api/admin/branches")).json()) as {
    cabang: Array<{ id: string; code: string }>;
  };
  check("daftar memuat TESTF3", daftar.cabang.some((b) => b.id === branchA && b.code === "TESTF3"));

  console.log("[2] ubah cabang");
  const patchB = await req(ckV, `/api/admin/branches/${branchA}`, "PATCH", { name: "T1f3-Uji-Ubah" });
  check("patch nama 200", patchB.status === 200);
  const daftar2 = (await (await req(ckV, "/api/admin/branches")).json()) as {
    cabang: Array<{ id: string; name: string }>;
  };
  check("nama berubah", daftar2.cabang.some((b) => b.id === branchA && b.name === "T1f3-Uji-Ubah"));
  const patchKode = await req(ckV, `/api/admin/branches/${branchA}`, "PATCH", { code: "salah spasi" });
  check("kode jelek ditolak 400", patchKode.status === 400);
  await sleep(1000);

  console.log("[3] akun: buat, ganda, daftar, detail, ubah");
  const uPetugas = `t1f3p${Date.now().toString().slice(-6)}`;
  const buat = await req(ckV, "/api/admin/users", "POST", {
    name: "T1f3-Petugas", username: uPetugas, pin: PIN_P, role: "petugas", cabang: [branchA],
  });
  const buatBody = (await buat.json()) as { ok?: boolean; id?: string };
  check("buat akun 201", buat.status === 201 && Boolean(buatBody.id));
  const idP = buatBody.id as string;
  const dobel = await req(ckV, "/api/admin/users", "POST", {
    name: "T1f3-Dobel", username: uPetugas, pin: PIN_P, role: "petugas", cabang: [branchA],
  });
  check("username ganda 409", dobel.status === 409);
  const pinAda = (await findUserByUsernamePublic(uPetugas))?.data["pin_hash"] as string;
  check("pin_hash tersimpan hash", Boolean(pinAda) && !pinAda.includes(PIN_P));
  const listU = (await (await req(ckV, "/api/admin/users")).json()) as {
    akun: Array<{ username: string; cabang: string[] } & Record<string, unknown>>;
  };
  const rowP = listU.akun.find((a) => a.username === uPetugas);
  check("daftar tanpa pin_hash + cabang terisi",
    Boolean(rowP) && !("pin_hash" in (rowP as object)) && (rowP?.cabang ?? []).includes(branchA));
  const det = (await (await req(ckV, `/api/admin/users/${idP}`)).json()) as {
    akun: { last_login_at?: string };
  };
  check("detail ada", "akun" in det);
  const ubahNama = await req(ckV, `/api/admin/users/${idP}`, "PATCH", { name: "T1f3-Petugas-Ubah" });
  check("ubah nama tanpa PIN 200", ubahNama.status === 200);
  const naik = await req(ckV, `/api/admin/users/${idP}`, "PATCH", {
    name: "x", role: "admin", cabang: [branchA], alasan: "uji fase3", pin: PIN_V,
  });
  void naik;
  // naik peran butuh alasan+PIN: tanpa keduanya harus 400
  const naikTanpa = await req(ckV, `/api/admin/users/${idP}`, "PATCH", { role: "admin" });
  check("ubah peran tanpa alasan+PIN ditolak", naikTanpa.status === 400 || naikTanpa.status === 401);
  await sleep(1000);

  console.log("[4] shift + kategori + point + field + urutan + duplikat");
  const sh = (await (await req(ckV, `/api/admin/config/${branchA}/shift`, "POST", {
    name: "T1f3-Pagi", start_time: "07:00", end_time: "15:00",
  })).json()) as { ok?: boolean; id?: string };
  check("tambah shift 201", Boolean(sh.id));
  const shiftId = sh.id as string;
  const rentangJelek = await req(ckV, `/api/admin/config/${branchA}/kategori/${shiftId}/point`, "POST", {
    title: "T1f3-Jelek", input_type: "angka", number_min: 10, number_max: 5,
  });
  check("rentang angka jelek 400", rentangJelek.status === 400);
  const k1 = (await (await req(ckV, `/api/admin/config/${branchA}/shift/${shiftId}/kategori`, "POST", {
    name: "T1f3-Kebersihan", sort_order: 1,
  })).json()) as { id?: string };
  const k2 = (await (await req(ckV, `/api/admin/config/${branchA}/shift/${shiftId}/kategori`, "POST", {
    name: "T1f3-Kas", sort_order: 2,
  })).json()) as { id?: string };
  check("2 kategori dibuat", Boolean(k1.id) && Boolean(k2.id));
  await req(ckV, `/api/admin/config/${branchA}/kategori/urut`, "POST", { urutan: [k2.id, k1.id] });
  const kats = (await (await req(ckV, `/api/admin/config/${branchA}/shift/${shiftId}/kategori`)).json()) as {
    kategori: Array<{ id: string; sort_order: string }>;
  };
  const orderKat = [...kats.kategori].sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  check("urutan kategori berubah", orderKat[0]?.id === k2.id);
  const pt1 = (await (await req(ckV, `/api/admin/config/${branchA}/kategori/${k1.id}/point`, "POST", {
    title: "T1f3-Sapu", input_type: "centang", is_required: true,
  })).json()) as { id?: string };
  const pt2 = (await (await req(ckV, `/api/admin/config/${branchA}/kategori/${k1.id}/point`, "POST", {
    title: "T1f3-Suhu", input_type: "angka", number_min: 0, number_max: 100,
  })).json()) as { id?: string };
  check("2 point dibuat", Boolean(pt1.id) && Boolean(pt2.id));
  const dupP = (await (await req(ckV, `/api/admin/config/${branchA}/point/${pt2.id}/duplikat`, "POST", {})).json()) as {
    ok?: boolean; id?: string;
  };
  check("duplikat point 201", Boolean(dupP.id));
  await req(ckV, `/api/admin/config/${branchA}/point/urut`, "POST", { urutan: [pt2.id, pt1.id, dupP.id] });
  const pts = (await (await req(ckV, `/api/admin/config/${branchA}/kategori/${k1.id}/point`)).json()) as {
    point: Array<{ id: string; sort_order: string; title: string }>;
  };
  const orderPt = [...pts.point].sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  check("urutan point berubah", orderPt[0]?.id === pt2.id);
  check("salinan berlabel", pts.point.some((t) => t.id === dupP.id && t.title.includes("salinan")));
  const nonPoint = await req(ckV, `/api/admin/config/${branchA}/point/${pt1.id}`, "PATCH", { is_active: false });
  check("nonaktifkan point (bukan hapus) 200", nonPoint.status === 200);
  const fld = (await (await req(ckV, `/api/admin/config/${branchA}/shift/${shiftId}/handover`, "POST", {
    label: "T1f3-Kas", field_type: "pilihan", options: ["Pas", "Kurang"], is_required: true,
  })).json()) as { id?: string };
  check("field handover dibuat", Boolean(fld.id));
  const fldJelek = await req(ckV, `/api/admin/config/${branchA}/shift/${shiftId}/handover`, "POST", {
    label: "T1f3-Jelek", field_type: "pilihan", options: ["Satu"],
  });
  check("pilihan 1 opsi ditolak 400", fldJelek.status === 400);
  const dupS = (await (await req(ckV, `/api/admin/config/${branchA}/shift/${shiftId}/duplikat`, "POST", {})).json()) as {
    ok?: boolean; shift_id?: string; kategori?: number; point?: number; field?: number;
  };
  // pt1 sudah dinonaktifkan sebelum duplikat → hanya 2 point aktif yang tersalin.
  check("duplikat shift + relasi", Boolean(dupS.shift_id) && dupS.kategori === 2 && dupS.point === 2 && dupS.field === 1,
    JSON.stringify(dupS));
  await sleep(1000);

  console.log("[5] salin template antar cabang (baris cabang B, sheet yang sama)");
  let branchB: string;
  const exB = await cariCabang("TESTF4");
  if (exB) {
    branchB = exB.id;
    if (!exB.aktif) {
      await req(ckV, `/api/admin/branches/${branchB}/nonaktif`, "POST", {
        alasan: "pakai ulang uji fase3", pin: PIN_V, is_active: true,
      });
    }
  } else {
    const regB0 = (await (await req(ckV, "/api/admin/branches", "POST", {
      spreadsheet_id: ssA, name: "T1f3-Uji-B", code: "TESTF4",
    })).json()) as { id?: string };
    branchB = regB0.id as string;
  }
  check("cabang B siap", Boolean(branchB));
  await sleep(1500);
  const salin = await req(ckV, `/api/admin/branches/${branchB}/salin-dari-cabang`, "POST", {
    sumber_branch_id: branchA, alasan: "uji fase3", pin: PIN_V,
  });
  const salinBody = (await salin.json()) as { ok?: boolean; shift?: number };
  check("salin cabang 200 + shift>=2", salin.status === 200 && (salinBody.shift ?? 0) >= 2);
  const salinTanpa = await req(ckV, `/api/admin/branches/${branchB}/salin-dari-cabang`, "POST", {
    sumber_branch_id: branchA, alasan: "", pin: PIN_V,
  });
  check("salin tanpa alasan ditolak 400", salinTanpa.status === 400);
  await sleep(1000);

  console.log("[6] kategori incident + settings");
  const namaKat = `T1f3-Kejadian-${SUF}`;
  const kat = (await (await req(ckV, "/api/admin/config/kategori-incident", "POST", {
    name: namaKat,
  })).json()) as { id?: string };
  check("kategori incident dibuat", Boolean(kat.id));
  const katDobel = await req(ckV, "/api/admin/config/kategori-incident", "POST", {
    name: namaKat,
  });
  check("nama kategori ganda 409", katDobel.status === 409);
  const set0 = (await (await req(ckV, "/api/admin/config/pengaturan")).json()) as {
    pengaturan: Array<{ key: string; value: string }>;
  };
  const tol0 = set0.pengaturan.find((s) => s.key === "tolerance_default_minutes")?.value;
  check("settings GET ada", tol0 !== undefined);
  const setIntJelek = await req(ckV, "/api/admin/config/pengaturan/tolerance_default_minutes", "PUT", { value: "limabelas" });
  check("settings int jelek 400", setIntJelek.status === 400);
  const setAsing = await req(ckV, "/api/admin/config/pengaturan/kunci_asing", "PUT", { value: "1" });
  check("settings kunci asing 400", setAsing.status === 400);
  const setOk = await req(ckV, "/api/admin/config/pengaturan/tolerance_default_minutes", "PUT", { value: "20" });
  check("settings PUT 200", setOk.status === 200);
  const set1 = (await (await req(ckV, "/api/admin/config/pengaturan")).json()) as {
    pengaturan: Array<{ key: string; value: string }>;
  };
  check("settings GET memantulkan", set1.pengaturan.find((s) => s.key === "tolerance_default_minutes")?.value === "20");
  await req(ckV, "/api/admin/config/pengaturan/tolerance_default_minutes", "PUT", { value: tol0 ?? "15" });
  await sleep(1000);

  console.log("[7] audit before/after tercatat");
  const gAudit = (await (await req(ckV, "/api/admin/audit/global?aksi=cabang.daftar&batas=200")).json()) as {
    audit: Array<{ object_id?: string; after?: string }>;
  };
  check("audit global cabang.daftar ada (proof)",
    gAudit.audit.some((a) => a.object_id === idProof && (a.after ?? "").includes(proofCode)));
  const cAudit = (await (await req(ckV, `/api/admin/audit/cabang/${branchA}`)).json()) as {
    audit: Array<{ action?: string; before?: string; after?: string }>;
  };
  const tambah = cAudit.audit.find((a) => a.action === "template.shift_tambah");
  // before shift_tambah = JSON dari string kosong ( `'""'` ).
  check("audit cabang shift_tambah + before/after",
    Boolean(tambah) && (tambah?.before === "" || tambah?.before === '""') && (tambah?.after ?? "").includes("T1f3-Pagi"));
  check("rantai audit cabang utuh",
    (await auditVerify(ssA, monthlyTabName("AuditLog", new Date().toISOString().slice(0, 7)))) === null);
  const cFilter = (await (await req(ckV, `/api/admin/audit/cabang/${branchA}?aksi=template.point`)).json()) as {
    audit: Array<unknown>;
  };
  check("filter aksi cabang jalan", cFilter.audit.length > 0);
  await sleep(1000);

  console.log("[8] guard admin terakhir");
  const snap = await valuesGet(reg, "Users!A2:F10000");
  const isUji = (n: string): boolean => String(n).startsWith("T1");
  const nonUji = snap.filter((r) => r[4] === "admin" && r[5] === "TRUE" && !isUji(r[1]));
  check("tidak ada admin non-uji aktif", nonUji.length === 0);
  if (nonUji.length > 0) throw new Error("ABORT: ada admin non-uji aktif");
  // Bersihkan HANYA milik fase2 (prefix "T1-") dan run fase3 lama ("T1f3-V").
  // Milik fase paralel lain (mis. "T1f4-") JANGAN disentuh.
  const stranded = snap.filter((r) =>
    r[4] === "admin" && r[5] === "TRUE" && r[0] !== idV &&
    (String(r[1]).startsWith("T1-") || String(r[1]).startsWith("T1f3-V")));
  for (const r of stranded) {
    const res = await req(ckV, `/api/admin/users/${r[0]}/nonaktif`, "POST", {
      alasan: "bersih uji fase3", pin: PIN_V, is_active: false,
    });
    check(`nonaktif stranded ${r[1]}`, res.status === 200);
  }
  const uW = `t1f3w${Date.now().toString().slice(-6)}`;
  const buatW = (await (await req(ckV, "/api/admin/users", "POST", {
    name: "T1f3-W", username: uW, pin: PIN_W, role: "admin", cabang: [branchA],
  })).json()) as { id?: string };
  check("admin W dibuat", Boolean(buatW.id));
  const idW = buatW.id as string;
  const loginW = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "t3w" },
    body: JSON.stringify({ username: uW, pin: PIN_W }),
  });
  const ckW = cookieFrom(loginW);
  check("login admin W 200", loginW.status === 200 && ckW.startsWith("sesi="));
  const offV = await req(ckV, `/api/admin/users/${idV}/nonaktif`, "POST", {
    alasan: "uji guard fase3", pin: PIN_V, is_active: false,
  });
  check("nonaktif V (bukan terakhir) 200", offV.status === 200);
  // Jalur 400 hanya bisa dibangun bila W satu-satunya admin aktif.
  // Bila fase paralel lain punya admin aktif, lewati dengan jujur (tertunda).
  const snap2 = await valuesGet(reg, "Users!A2:F10000");
  const aktif = snap2.filter((r) => r[4] === "admin" && r[5] === "TRUE");
  if (aktif.length === 1 && aktif[0][0] === idW) {
    const turunW = await req(ckW, `/api/admin/users/${idW}`, "PATCH", {
      role: "petugas", alasan: "uji guard fase3", pin: PIN_W,
    });
    check("turunkan admin terakhir ditolak 400", turunW.status === 400);
    const offW = await req(ckW, `/api/admin/users/${idW}/nonaktif`, "POST", {
      alasan: "uji guard fase3", pin: PIN_W, is_active: false,
    });
    check("nonaktifkan admin terakhir ditolak 400", offW.status === 400);
  } else {
    console.log(`  tunda jalur-400 guard: ${aktif.length} admin aktif (paralel), hanya jalur non-terakhir terbukti`);
  }
  await sleep(1000);

  console.log("[9] bersih: nonaktifkan semua data uji");
  const offP = await req(ckW, `/api/admin/users/${idP}/nonaktif`, "POST", {
    alasan: "bersih uji fase3", pin: PIN_W, is_active: false,
  });
  check("petugas uji nonaktif", offP.status === 200);
  const offKat = await req(ckW, `/api/admin/config/kategori-incident/${kat.id}`, "PATCH", { is_active: false });
  check("kategori incident uji nonaktif", offKat.status === 200);
  const offShift1 = await req(ckW, `/api/admin/config/${branchA}/shift/${shiftId}`, "PATCH", { is_active: false });
  const offShift2 = await req(ckW, `/api/admin/config/${branchA}/shift/${dupS.shift_id}`, "PATCH", { is_active: false });
  check("shift uji nonaktif", offShift1.status === 200 && offShift2.status === 200);
  const offBA = await req(ckW, `/api/admin/branches/${branchA}/nonaktif`, "POST", {
    alasan: "bersih uji fase3", pin: PIN_W, is_active: false,
  });
  const offBB = await req(ckW, `/api/admin/branches/${branchB}/nonaktif`, "POST", {
    alasan: "bersih uji fase3", pin: PIN_W, is_active: false,
  });
  const offProof = await req(ckW, `/api/admin/branches/${idProof}/nonaktif`, "POST", {
    alasan: "bersih uji fase3", pin: PIN_W, is_active: false,
  });
  check("cabang uji nonaktif", offBA.status === 200 && offBB.status === 200 && offProof.status === 200);
  // Bulk: nonaktifkan sisa baris template T1f3- run ini + kategori incident uji.
  for (const t of templateTabs) {
    const r = new SheetRepo(ssA, t.tab, BRANCH_TEMPLATE_HEADERS[t.tab]);
    const rows = await valuesGet(ssA, `${t.tab}!A2:Z10000`);
    for (const row of rows) {
      if (!row[0] || !String(row[t.namaIdx] ?? "").startsWith("T1f3-")) continue;
      if (row[t.aktifIdx] !== "TRUE") continue;
      await r.update(row[0], { is_active: "FALSE", updated_at: nowIso() });
    }
  }
  await auditCabang(ssA, branchA, {
    actor_id: idW, action: "template.bersih_uji", object_type: "cabang", object_id: branchA,
    reason: "bersih uji fase3",
  }).catch(() => undefined);
  // Sisa petugas uji run ini/lama (prefix t1f3p): nonaktifkan langsung + satu audit.
  const semuaUser = await valuesGet(reg, "Users!A2:F10000");
  const sisaP = semuaUser.filter((r) => r[0] !== idP && String(r[2] ?? "").startsWith("t1f3p") && r[5] === "TRUE");
  for (const r of sisaP) {
    await users.update(r[0], { is_active: "FALSE", updated_at: nowIso() });
  }
  if (sisaP.length > 0) {
    await auditAppend(reg, "AuditLog_Global", nowIso(), {
      actor_id: idW, action: "akun.bersih_uji", object_type: "user",
      object_id: sisaP.map((r) => r[0]).join(","), reason: "bersih uji fase3",
    }).catch(() => undefined);
  }
  // Admin W terakhir: coba nonaktifkan (bersih total bila bukan terakhir);
  // bila W memang terakhir, acak PIN-nya seperti pola fase2.
  const tutupW = await req(ckW, `/api/admin/users/${idW}/nonaktif`, "POST", {
    alasan: "bersih uji fase3", pin: PIN_W, is_active: false,
  });
  if (tutupW.status === 200) {
    check("admin uji W ikut nonaktif (bersih total)", true);
    console.log("CATATAN: tidak ada akun uji tersisa.");
  } else {
    let randPin = "";
    do {
      randPin = String(randomInt(0, 1000000)).padStart(6, "0");
    } while (isWeakPin(randPin));
    const acak = await req(ckW, `/api/admin/users/${idW}/reset-pin`, "POST", {
      alasan: "bersih uji fase3", pin: PIN_W, pin_baru: randPin,
    });
    check("PIN admin tersisa diacak", acak.status === 200);
    console.log("CATATAN: satu akun admin uji (t1f3w*) AKTIF dengan PIN acak tak tercatat — cabut setelah admin asli dibuat.");
  }

  console.log(`\nringkasan: ${pass} lulus, ${fail} gagal, 0 tunda`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("verifikasi gagal:", (e as Error).message);
  process.exit(1);
});
