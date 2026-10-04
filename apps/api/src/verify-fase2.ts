// Verifikasi Fase 2. Tanpa Redis: jalur sesi/lockout/rate-limit WAJIB fail closed.
// Secret di bawah DUMMY khusus uji (bukan kredensial asli).
// Jalankan: npm run verify:fase2 --workspace=apps/api
process.env["PIN_PEPPER"] ??= "uji-fase2-pepper";
process.env["SESSION_SECRET"] ??= "uji-fase2-secret-yang-cukup-panjang-32";

import { Hono } from "hono";
import { REGISTRY_HEADERS, newId, nowIso } from "@checklist-shift/shared";
import { randomInt } from "node:crypto";
import { app } from "./index.js";
import { registryId } from "./lib/env.js";
import { SheetRepo } from "./lib/repo.js";
import { valuesGet } from "./lib/sheets.js";
import { auditVerify } from "./lib/audit.js";
import { hashPin, isWeakPin, pinFormatOk, verifyPin } from "./lib/pin.js";
import { isSessionLive, issueSession, signJwt, verifyJwt } from "./lib/session.js";
import { requireAuth, type AuthEnv } from "./lib/authz.js";
import { findUserByUsernamePublic } from "./routes/auth.js";

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

async function main() {
  console.log("[0] bersih sisa run: nonaktifkan petugas uji stranded (prefix t1u)");
  const reg0 = registryId() as string;
  const repo0 = new SheetRepo(reg0, "Users", REGISTRY_HEADERS["Users"]);
  const col0 = await valuesGet(reg0, "Users!A2:F10000");
  const days0 = 30;
  const { revokeAllSessions: revoke0 } = await import("./lib/session.js");
  const { auditAppend: audit0 } = await import("./lib/audit.js");
  let cleaned = 0;
  // Baca username dari kolom C sejajar baris; hanya prefix t1u yang disentuh.
  const colC = await valuesGet(reg0, "Users!C2:C10000");
  for (let i = 0; i < col0.length; i++) {
    if (!String(colC[i]?.[0] ?? "").startsWith("t1u")) continue;
    if (col0[i]?.[5] !== "TRUE") continue;
    const id = col0[i][0];
    await revoke0(id, days0).catch(() => undefined);
    await repo0.update(id, { is_active: "FALSE", updated_at: nowIso() });
    await audit0(reg0, "AuditLog_Global", nowIso(), {
      actor_id: id, action: "akun.nonaktifkan", object_type: "user",
      object_id: id, reason: "bersih sisa run uji fase2",
    });
    cleaned++;
  }
  console.log(`  dibersihkan: ${cleaned}`);

  console.log("[1] format + PIN lemah (murni, tanpa env)");
  check("6 digit diterima", pinFormatOk("482917"));
  check("5 digit ditolak", !pinFormatOk("12345"));
  check("huruf ditolak", !pinFormatOk("12ab56"));
  check("123456 lemah", isWeakPin("123456"));
  check("000000 lemah", isWeakPin("000000"));
  check("naik berurutan lemah", isWeakPin("234567"));
  check("acak kuat", !isWeakPin("482917"));

  console.log("[2] hash argon2 + pepper");
  const h = await hashPin("482917");
  check("hash bukan plaintext", !h.includes("482917") && h.startsWith("$argon2"));
  check("verify benar", await verifyPin("482917", h));
  check("verify salah ditolak", !(await verifyPin("719284", h)));

  console.log("[3] JWT round-trip");
  const key = new TextEncoder().encode("uji-fase2-secret-yang-cukup-panjang-32");
  const uid = newId();
  const { token } = await signJwt(uid, newId(), "petugas", 30, key);
  const claims = await verifyJwt(token, key);
  check("klaim utuh", claims.sub === uid && claims.role === "petugas");
  let tamperRejected = false;
  try {
    await verifyJwt(token.slice(0, -2) + "xx", key);
  } catch {
    tamperRejected = true;
  }
  check("token diutak-atik ditolak", tamperRejected);

  console.log("[4] Redis ada: sesi terbit + hidup (fail-closed tanpa Redis terbukti di run pra-Redis)");
  // Butuh user asli aktif: sesi user tak dikenal ditolak loadPrincipal.
  const reg4 = registryId() as string;
  const repo4 = new SheetRepo(reg4, "Users", REGISTRY_HEADERS["Users"]);
  const uid4 = newId();
  await repo4.append({
    id: uid4, name: "T1-sesi", username: `t1sesi${Date.now().toString().slice(-6)}`,
    pin_hash: await hashPin("482917"), role: "petugas", is_active: "TRUE",
    must_change_pin: "FALSE", locked_until: "", last_login_at: "", pin_changed_at: "",
    created_at: nowIso(), updated_at: nowIso(), version: "1",
  });
  const live = await issueSession(uid4, "petugas", 30);
  check("issueSession berhasil", Boolean(live.token));
  const lc = await verifyJwt(live.token, key);
  check("sesi tercatat hidup", await isSessionLive(lc.sub, lc.sid, lc.iat));

  console.log("[5] middleware: tanpa token 401, token palsu 401, token valid 200");
  const appT = new Hono<AuthEnv>();
  appT.use(requireAuth);
  appT.get("/x", (c) => c.json({ ok: true }));
  const r1 = await appT.request("/x");
  check("tanpa token 401", r1.status === 401);
  const rBad = await appT.request("/x", { headers: { cookie: "sesi=palsu" } });
  check("token palsu 401", rBad.status === 401);
  const s2 = await issueSession(uid4, "petugas", 30);
  const r2 = await appT.request("/x", { headers: { cookie: `sesi=${s2.token}` } });
  check("token valid 200", r2.status === 200);
  // Akun dinonaktifkan setelah sesi terbit -> sesi ditolak (loadPrincipal).
  await repo4.update(uid4, { is_active: "FALSE", updated_at: nowIso() });
  const r3 = await appT.request("/x", { headers: { cookie: `sesi=${s2.token}` } });
  check("nonaktif menolak sesi lama (401)", r3.status === 401);

  console.log("[6] lookup username di registry");
  const reg = registryId() as string;
  const repo6 = new SheetRepo(reg, "Users", REGISTRY_HEADERS["Users"]);
  const uname = `t1uji${Date.now().toString().slice(-6)}`;
  const tu = newId();
  await repo6.append({
    id: tu, name: "T1-Uji Fase2", username: uname, pin_hash: await hashPin("482917"),
    role: "petugas", is_active: "FALSE", must_change_pin: "TRUE",
    locked_until: "", last_login_at: "", pin_changed_at: "",
    created_at: nowIso(), updated_at: nowIso(), version: "1",
  });
  const found = await findUserByUsernamePublic(uname);
  check("username ditemukan", found?.data["id"] === tu);
  check("akun uji nonaktif", found?.data["is_active"] === "FALSE");

  console.log("[7] login end-to-end (Redis aktif)");
  const usersRepo = new SheetRepo(reg, "Users", REGISTRY_HEADERS["Users"]);
  const repo = usersRepo;
  const suf = Date.now().toString().slice(-6);
  const mkUser = (suffix: string, role: "admin" | "petugas", pin: string, mustChange: boolean) =>
    repo.append({
      id: newId(), name: `T1-${suffix}`, username: `t1${suffix}${suf}`, pin_hash: "",
      role, is_active: "TRUE", must_change_pin: mustChange ? "TRUE" : "FALSE",
      locked_until: "", last_login_at: "", pin_changed_at: "",
      created_at: nowIso(), updated_at: nowIso(), version: "1",
    }).then(async () => {
      const f = await findUserByUsernamePublic(`t1${suffix}${suf}`);
      await repo.update(f?.data["id"] as string, { pin_hash: await hashPin(pin) });
      return `t1${suffix}${suf}`;
    });

  const PIN_U1 = "482917";
  const u1 = await mkUser("u1", "petugas", PIN_U1, false);
  const u3 = await mkUser("u3", "petugas", "739164", true);

  const cookieFrom = (res: Response): string => (res.headers.get("set-cookie") ?? "").split(";")[0];
  const apiLogin = (username: string, pin: string, ip: string) =>
    app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ username, pin }),
    });
  const authed = (cookie: string, path: string, method = "GET", body?: unknown, ip = "t7") => {
    const init: RequestInit = { method, headers: { cookie, "x-forwarded-for": ip } };
    if (body !== undefined) {
      (init.headers as Record<string, string>)["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return app.request(path, init);
  };

  const loginU1 = await apiLogin(u1, PIN_U1, "t7a");
  const loginU1Body = (await loginU1.json()) as { must_change_pin?: boolean; role?: string };
  const ckU1 = cookieFrom(loginU1);
  check("login 200 + cookie", loginU1.status === 200 && ckU1.startsWith("sesi="));
  check("must_change_pin false", loginU1Body.must_change_pin === false);
  const siapa = await authed(ckU1, "/api/auth/siapa");
  check("/siapa 200 + peran", siapa.status === 200 && ((await siapa.json()) as { role?: string }).role === "petugas");
  const afterLogin = await findUserByUsernamePublic(u1);
  check("last_login_at terisi", Boolean(afterLogin?.data["last_login_at"]));
  const loginU3 = (await (await apiLogin(u3, "739164", "t7b")).json()) as { must_change_pin?: boolean };
  check("must_change_pin true untuk PIN awal", loginU3.must_change_pin === true);

  console.log("[8] lockout 5x + buka kunci admin");
  const PIN_U2 = "915238";
  const u2 = await mkUser("u2", "petugas", PIN_U2, false);
  const tries: number[] = [];
  for (let i = 0; i < 4; i++) tries.push((await apiLogin(u2, "719284", "t8")).status);
  check("4x salah = 401", tries.every((s) => s === 401));
  check("salah ke-5 = 423 terkunci", (await apiLogin(u2, "719284", "t8")).status === 423);
  check("PIN benar tetap 423 saat terkunci", (await apiLogin(u2, PIN_U2, "t8")).status === 423);

  const PIN_A1 = "618342";
  const a1 = await mkUser("a1", "admin", PIN_A1, false);
  const loginA1 = await apiLogin(a1, PIN_A1, "t8b");
  const ckA1 = cookieFrom(loginA1);
  check("login admin 200", loginA1.status === 200 && ckA1.startsWith("sesi="));
  const u2id = (await findUserByUsernamePublic(u2))?.data["id"] as string;
  const unlock2 = await authed(ckA1, `/api/admin/users/${u2id}/buka-kunci`, "POST", { alasan: "uji fase2", pin: PIN_A1 }, "t8c");
  check("buka kunci 200", unlock2.status === 200);
  check("login berhasil setelah dibuka", (await apiLogin(u2, PIN_U2, "t8d")).status === 200);
  const unlockNoAlasan = await authed(ckA1, `/api/admin/users/${u2id}/buka-kunci`, "POST", { alasan: "", pin: PIN_A1 }, "t8e");
  check("tanpa alasan ditolak 400", unlockNoAlasan.status === 400);

  console.log("[9] ganti-pin");
  const gantiSalah = await authed(ckU1, "/api/auth/ganti-pin", "POST", { pin_lama: "000000", pin_baru: "274591" });
  check("PIN lama salah 400", gantiSalah.status === 400);
  const gantiLemah = await authed(ckU1, "/api/auth/ganti-pin", "POST", { pin_lama: PIN_U1, pin_baru: "123456" });
  check("PIN lemah 400", gantiLemah.status === 400);
  const PIN_U1B = "274591";
  const gantiOk = await authed(ckU1, "/api/auth/ganti-pin", "POST", { pin_lama: PIN_U1, pin_baru: PIN_U1B });
  check("ganti PIN 200", gantiOk.status === 200);
  check("PIN lama tak berlaku", (await apiLogin(u1, PIN_U1, "t9")).status === 401);
  const loginBaru = await apiLogin(u1, PIN_U1B, "t9");
  const ckU1b = cookieFrom(loginBaru);
  check("PIN baru berlaku", loginBaru.status === 200);

  console.log("[10] logout + paksa logout mencabut sesi");
  check("logout 200", (await authed(ckU1b, "/api/auth/logout", "POST")).status === 200);
  check("sesi mati setelah logout", (await authed(ckU1b, "/api/auth/siapa")).status === 401);
  const fresh = cookieFrom(await apiLogin(u1, PIN_U1B, "t10"));
  const paksa = await authed(ckA1, `/api/admin/users/${(await findUserByUsernamePublic(u1))?.data["id"]}/paksa-logout`, "POST", { alasan: "uji fase2", pin: PIN_A1 }, "t10b");
  check("paksa logout 200", paksa.status === 200);
  check("sesi mati setelah paksa logout", (await authed(fresh, "/api/auth/siapa")).status === 401);

  console.log("[11] reset PIN + audit tertulis");
  const PIN_U1C = "381546";
  const reset = await authed(ckA1, `/api/admin/users/${(await findUserByUsernamePublic(u1))?.data["id"]}/reset-pin`, "POST", { alasan: "uji fase2", pin: PIN_A1, pin_baru: PIN_U1C }, "t11");
  check("reset PIN 200", reset.status === 200);
  check("PIN reset berlaku", (await apiLogin(u1, PIN_U1C, "t11b")).status === 200);
  const tail = await valuesGet(reg, "AuditLog_Global!A2:N100000");
  const meId = (await findUserByUsernamePublic(u1))?.data["id"];
  check("audit reset_pin tertulis", tail.some((r) => r[4] === "akun.reset_pin" && r[6] === meId));
  check("rantai audit global utuh", (await auditVerify(reg, "AuditLog_Global")) === null);

  console.log("[12] rate limit login");
  const rc: number[] = [];
  const rlIp = `t12${suf}`;
  for (let i = 0; i < 21; i++) rc.push((await apiLogin(`t1takada${suf}`, "482917", rlIp)).status);
  check("20x 401 lalu 429", rc.slice(0, 20).every((s) => s === 401) && rc[20] === 429);

  console.log("[13] guard admin terakhir (self-cleaning, aman)");
  const PIN_A2 = "502839";
  const a2 = await mkUser("a2", "admin", PIN_A2, false);
  const ckA2 = cookieFrom(await apiLogin(a2, PIN_A2, "t13b"));
  const a2id = (await findUserByUsernamePublic(a2))?.data["id"] as string;
  // Pengaman: abort bila ada admin AKTIF non-uji (jangan pernah sentuh akun asli).
  const snap = await valuesGet(reg, "Users!A2:F10000");
  const activeAdmins = snap.filter((r) => r[4] === "admin" && r[5] === "TRUE");
  const realOnes = activeAdmins.filter((r) => !String(r[1]).startsWith("T1-"));
  check("tidak ada admin non-uji aktif", realOnes.length === 0);
  if (realOnes.length > 0) throw new Error("ABORT: ada admin non-uji aktif, uji guard dibatalkan");
  // Bersihkan admin uji stranded (termasuk run lama), sisakan a2 sebagai tersisa-terakhir.
  const a1id0 = (await findUserByUsernamePublic(a1))?.data["id"] as string;
  for (const r of activeAdmins) {
    const id = r[0];
    if (id === a2id) continue;
    const res = await authed(ckA2, `/api/admin/users/${id}/nonaktif`, "POST", { alasan: "bersih uji fase2", pin: PIN_A2, is_active: false }, "t13c");
    check(`nonaktif admin uji ${id === a1id0 ? "(bukan terakhir, 200)" : "(stranded, 200)"}`, res.status === 200);
  }
  const nonaktifA2 = await authed(ckA2, `/api/admin/users/${a2id}/nonaktif`, "POST", { alasan: "uji fase2", pin: PIN_A2, is_active: false }, "t13d");
  check("admin terakhir tersisa ditolak (400)", nonaktifA2.status === 400);

  console.log("[14] bersih: nonaktifkan akun uji petugas");
  for (const un of [u1, u2, u3]) {
    const id = (await findUserByUsernamePublic(un))?.data["id"] as string;
    const r = await authed(ckA2, `/api/admin/users/${id}/nonaktif`, "POST", { alasan: "bersih uji fase2", pin: PIN_A2, is_active: false }, "t14");
    check(`nonaktif ${un}`, r.status === 200);
  }
  const a1id = (await findUserByUsernamePublic(a1))?.data["id"] as string;
  check("a1 sudah nonaktif", ((await usersRepo.get(a1id))?.["is_active"] ?? "") === "FALSE");

  // TERAKHIR: acak PIN admin tersisa agar tak ada akun uji aktif yang PIN-nya diketahui.
  // (reset-pin mencabut sesi pemohon, jadi ini harus paling akhir.)
  let randPin = "";
  do {
    randPin = String(randomInt(0, 1000000)).padStart(6, "0");
  } while (isWeakPin(randPin));
  const randReset = await authed(ckA2, `/api/admin/users/${a2id}/reset-pin`, "POST", { alasan: "bersih uji fase2", pin: PIN_A2, pin_baru: randPin }, "t13e");
  check("PIN admin tersisa diacak", randReset.status === 200);

  console.log(`\nringkasan: ${pass} lulus, ${fail} gagal, 0 tunda`);
  console.log("CATATAN: satu akun admin uji (t1a2*) AKTIF dengan PIN acak tak tercatat — cabut setelah admin asli dibuat (Fase 3).");
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("verifikasi gagal:", (e as Error).message);
  process.exit(1);
});
