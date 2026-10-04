// Lengkapi tab spreadsheet cabang uji (idempoten, aditif saja).
// Dipakai verifikasi Fase 1. Tab bulanan dibuat on-demand oleh monthly.ts.
// Jalankan: TEST_BRANCH_SHEET_ID=<id> npm run setup:cabang --workspace=apps/api
import { BRANCH_TEMPLATE_HEADERS } from "@checklist-shift/shared";
import { env } from "./lib/env.js";
import { sheetsClient, valuesGet, valuesUpdate } from "./lib/sheets.js";
import { nowIso } from "@checklist-shift/shared";

const META_HEADERS = ["key", "value"];

async function main() {
  const spreadsheetId = env("TEST_BRANCH_SHEET_ID");
  if (!spreadsheetId) throw new Error("set TEST_BRANCH_SHEET_ID dulu");
  const api = sheetsClient();
  const meta = await api.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const have = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));
  const all: Record<string, string[]> = { _meta: META_HEADERS, ...BRANCH_TEMPLATE_HEADERS };

  const missing = Object.entries(all).filter(([t]) => !have.has(t));
  if (missing.length > 0) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId,
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
    console.log(`tab dibuat: ${missing.length}`);
  }

  for (const [title, header] of Object.entries(all)) {
    const rows = await valuesGet(spreadsheetId, `${title}!A1:Z1`);
    if ((rows[0] ?? []).length === 0) {
      await valuesUpdate(spreadsheetId, `${title}!A1`, [header]);
      console.log(`header ditulis: ${title}`);
    }
  }

  const metaRows = await valuesGet(spreadsheetId, "_meta!A2:B100");
  const keys = new Set(metaRows.map((r) => r[0]));
  const now = nowIso();
  const seed: string[][] = [];
  if (!keys.has("schema_version")) seed.push(["schema_version", "1"]);
  if (!keys.has("created_at")) seed.push(["created_at", now]);
  if (!keys.has("last_migrated_at")) seed.push(["last_migrated_at", now]);
  if (seed.length > 0) {
    const { valuesAppend } = await import("./lib/sheets.js");
    await valuesAppend(spreadsheetId, "_meta!A:B", seed);
    console.log(`_meta seed: ${seed.length}`);
  }
  console.log("setup cabang selesai");
}

main().catch((e) => {
  console.error("setup gagal:", e?.response?.data?.error?.message ?? e.message);
  process.exit(1);
});
