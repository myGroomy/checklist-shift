// Verifikasi Fase 1 (IMPLEMENTATION_PLAN): CRUD tiap tab, header salah ditolak,
// 20 tulis paralel, hash chain mendeteksi edit manual, Redis mati = fail closed.
// Hanya append/update; tidak ada baris dihapus (BR-40). Baris uji diawali "T1-".
// Jalankan: TEST_BRANCH_SHEET_ID=<id> npm run verify:fase1 --workspace=apps/api
import {
  BRANCH_TEMPLATE_HEADERS,
  MONTHLY_HEADERS,
  REGISTRY_HEADERS,
  monthlyTabName,
  newId,
  nowIso,
} from "@checklist-shift/shared";
import { registryId } from "./lib/env.js";
import { valuesGet, valuesUpdate } from "./lib/sheets.js";
import { SheetRepo } from "./lib/repo.js";
import { auditAppend, auditVerify } from "./lib/audit.js";
import { ensureMonthlyTab } from "./lib/monthly.js";
import { invalidateBranch, resolveBranch } from "./lib/branch.js";
import { requireRedis } from "./lib/redis.js";

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

function fill(header: string[], patch: Record<string, string>): Record<string, string> {
  const o: Record<string, string> = {};
  for (const h of header) o[h] = patch[h] ?? "";
  return o;
}

const T = () => nowIso();

async function main() {
  const reg = registryId();
  const branchSheet = process.env["TEST_BRANCH_SHEET_ID"];
  if (!reg || !branchSheet) throw new Error("env registry / TEST_BRANCH_SHEET_ID belum lengkap");

  console.log("[1] CRUD tiap tab registry");
  for (const [tab, header] of Object.entries(REGISTRY_HEADERS)) {
    const repo = new SheetRepo(reg, tab, header);
    if (tab === "AuditLog_Global") {
      // Append-only + hash chain: tulis mentah merusak rantai. Diuji via auditAppend di [6].
      check(`${tab} header ok`, await repo.headerOk());
      continue;
    }
    const keyCol = header[0];
    const key = tab === "Settings" ? `t1_probe_${tab}` : newId();
    const row = fill(header, {
      [keyCol]: key,
      name: `T1-${tab}`,
      key: key,
      value: "probe",
      value_type: "string",
      action: "fase1.probe",
      actor_id: "t1",
      object_type: tab,
      prev_hash: "x",
      hash: "y",
      created_at: T(),
      updated_at: T(),
    });
    try {
      await repo.append(row);
      const got = await repo.get(key);
      check(`${tab} tulis+baca`, got?.[keyCol] === key);
      if (header.includes("updated_at")) {
        await repo.update(key, { updated_at: T() });
        check(`${tab} update`, true);
      }
    } catch (e) {
      check(`${tab} tulis+baca`, false, String((e as Error)?.message ?? e));
    }
  }

  console.log("[2] header salah ditolak");
  try {
    const bad = new SheetRepo(reg, "Settings", ["kolom", "palsu"]);
    await bad.append({ kolom: "x", palsu: "y" });
    check("header salah ditolak", false);
  } catch {
    check("header salah ditolak", true);
  }

  console.log("[3] resolver cabang + nonaktif di akhir");
  const branchRepo = new SheetRepo(reg, "Branches", REGISTRY_HEADERS["Branches"]);
  const testBranchId = newId();
  await branchRepo.append(
    fill(REGISTRY_HEADERS["Branches"], {
      id: testBranchId, name: "T1-Cabang Uji Fase 1", code: "TEST01",
      timezone: "Asia/Jakarta", spreadsheet_id: branchSheet,
      schema_version: "1", is_active: "TRUE", created_at: T(), updated_at: T(),
    }),
  );
  const resolved = await resolveBranch(testBranchId);
  check("resolveBranch", resolved === branchSheet);
  await invalidateBranch(testBranchId);
  check("invalidateBranch", true);

  console.log("[4] tab cabang + tab bulanan on-demand");
  for (const [tab, header] of Object.entries(BRANCH_TEMPLATE_HEADERS)) {
    const repo = new SheetRepo(branchSheet, tab, header);
    check(`${tab} header ok`, await repo.headerOk());
  }
  const month = T().slice(0, 7);
  const entriesTab = await ensureMonthlyTab(branchSheet, "Entries", month);
  check("ensureMonthlyTab", entriesTab === monthlyTabName("Entries", month));
  const entryRepo = new SheetRepo(branchSheet, entriesTab, MONTHLY_HEADERS["Entries"]);
  const eid = newId();
  await entryRepo.append(
    fill(MONTHLY_HEADERS["Entries"], {
      id: eid, shift_instance_id: newId(), point_ref: newId(), state: "selesai",
      value: "TRUE", out_of_range: "FALSE", created_at: T(), updated_at: T(), version: "1",
    }),
  );
  check("Entries tulis+baca", (await entryRepo.get(eid))?.["id"] === eid);

  console.log("[5] 20 tulis bersamaan via satu batch (append paralel mentah saling menimpa)");
  const ids = Array.from({ length: 20 }, () => newId());
  const { valuesAppendMany } = await import("./lib/sheets.js");
  // 20 produsen berbarengan (jitter acak) mengantre baris, SATU flush.
  const queue: string[][] = [];
  await Promise.all(
    ids.map(
      (id) =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            queue.push(
              entryRepo.toRow(
                fill(MONTHLY_HEADERS["Entries"], {
                  id, shift_instance_id: newId(), point_ref: newId(), state: "selesai",
                  value: "TRUE", out_of_range: "FALSE", created_at: T(), updated_at: T(), version: "1",
                }),
              ),
            );
            resolve();
          }, Math.floor(Math.random() * 50)),
        ),
    ),
  );
  await valuesAppendMany(branchSheet, `${entriesTab}!A:O`, queue);
  const found = await Promise.all(ids.map((id) => entryRepo.get(id)));
  // Read-after-write bisa lag: poll sampai semua terlihat (maks ~100 dtk).
  let hits = found;
  for (let i = 0; i < 10 && hits.some((r) => r === null); i++) {
    await new Promise((r) => setTimeout(r, 10000));
    hits = await Promise.all(ids.map((id) => entryRepo.get(id)));
    console.log(`    ...ditemukan ${hits.filter(Boolean).length}/20`);
  }
  check("20 tulis paralel utuh", hits.every((r) => r !== null));

  console.log("[6] hash chain: utuh, edit terdeteksi, pulih");
  // Pakai tab audit bulanan baru di sheet cabang agar rantai terkontrol dari genesis.
  const auditTab = await ensureMonthlyTab(branchSheet, "AuditLog", month);
  const at = T();
  const aid = await auditAppend(branchSheet, auditTab, at, {
    actor_id: "t1", action: "fase1.probe", object_type: "probe", reason: "uji",
  });
  check("audit append+verify utuh", (await auditVerify(branchSheet, auditTab)) === null);
  // Simulasi edit manual: ubah kolom reason baris itu.
  const all = await valuesGet(branchSheet, `${auditTab}!A2:N100000`);
  const idx = all.findIndex((r) => r[0] === aid);
  const reasonCol = MONTHLY_HEADERS["AuditLog"].indexOf("reason"); // K
  const origReason = all[idx][reasonCol] ?? "";
  const colLetter = String.fromCharCode(65 + reasonCol);
  await valuesUpdate(branchSheet, `${auditTab}!${colLetter}${idx + 2}`, [["T1-DIEDIT-MANUAL"]]);
  const broken = await auditVerify(branchSheet, auditTab);
  check("edit manual terdeteksi", broken === idx + 2, `dapat:${broken} harap:${idx + 2}`);
  await valuesUpdate(branchSheet, `${auditTab}!${colLetter}${idx + 2}`, [[origReason]]);
  check("rantai pulih setelah restore", (await auditVerify(branchSheet, auditTab)) === null);

  console.log("[7] Redis mati = fail closed");
  try {
    requireRedis();
    check("fail closed tanpa redis", false, "(redis ternyata tersedia)");
  } catch {
    check("fail closed tanpa redis", true);
  }

  console.log("[8] nonaktifkan cabang uji (arsip, bukan hapus)");
  await branchRepo.update(testBranchId, { is_active: "FALSE", updated_at: T() });
  let rejected = false;
  try {
    await resolveBranch(testBranchId);
  } catch {
    rejected = true;
  }
  check("cabang nonaktif ditolak resolver", rejected);

  console.log(`\nringkasan: ${pass} lulus, ${fail} gagal`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("verifikasi gagal:", e?.response?.data?.error?.message ?? (e as Error).message);
  process.exit(1);
});
