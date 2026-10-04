import { MONTHLY_HEADERS, monthlyTabName } from "@checklist-shift/shared";
import { sheetsClient, valuesGet, valuesUpdate } from "./sheets.js";

// Tab volume tinggi dipecah per bulan; dibuat otomatis saat pertama dibutuhkan,
// di bawah lock pemanggil (DATABASE_SCHEMA §5.5, §7 lock:tab).
export async function ensureMonthlyTab(
  spreadsheetId: string,
  base: string,
  month: string,
): Promise<string> {
  const header = MONTHLY_HEADERS[base];
  if (!header) throw new Error(`tab bulanan tak dikenal: ${base}`);
  const name = monthlyTabName(base, month);
  const api = sheetsClient();
  const meta = await api.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === name);
  if (!exists) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: name,
                gridProperties: { rowCount: 1000, columnCount: header.length, frozenRowCount: 1 },
              },
            },
          },
        ],
      },
    });
    await valuesUpdate(spreadsheetId, `${name}!A1`, [header]);
  } else {
    const rows = await valuesGet(spreadsheetId, `${name}!A1:Z1`);
    const got = rows[0] ?? [];
    if (!header.every((h, i) => got[i] === h)) {
      throw new Error(`header tab ${name} tidak sesuai skema`);
    }
  }
  return name;
}
