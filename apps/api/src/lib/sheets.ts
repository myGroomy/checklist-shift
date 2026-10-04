import { google, sheets_v4 } from "googleapis";
import { serviceAccount } from "./env.js";

// Klien Sheets: batch-first + retry/backoff untuk 429/5xx (DATABASE_SCHEMA §12.2).
// Satu aksi pengguna = maksimal satu panggilan tulis (batchUpdate).

let sheets: sheets_v4.Sheets | null = null;

export function sheetsClient(): sheets_v4.Sheets {
  if (sheets) return sheets;
  const sa = serviceAccount();
  if (!sa) throw new Error("env service account belum lengkap");
  const auth = new google.auth.JWT({
    email: sa.email,
    key: sa.key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  sheets = google.sheets({ version: "v4", auth });
  return sheets;
}

const RETRYABLE = new Set([429, 500, 502, 503]);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const status = (e as { code?: number })?.code ?? (e as { response?: { status?: number } })?.response?.status;
      if (status !== undefined && !RETRYABLE.has(status)) throw e;
      // Kuota 429: jendela 60 dtk, jadi backoff 20 dtk bertingkat.
      const wait = status === 429 ? 20000 * (i + 1) : 400 * 2 ** i + Math.floor(Math.random() * 200);
      await sleep(wait);
    }
  }
  console.error(`[sheets] ${label} gagal setelah ${tries}x`);
  throw last;
}

// Tulis dengan RAW agar Sheets tidak mengubah teks jadi tanggal/angka/formula (§2.2).
export async function batchUpdate(
  spreadsheetId: string,
  requests: sheets_v4.Schema$Request[],
): Promise<void> {
  const api = sheetsClient();
  await withRetry("batchUpdate", () =>
    api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } }),
  );
}

export async function valuesGet(
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const api = sheetsClient();
  const res = await withRetry("valuesGet", () =>
    api.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: "UNFORMATTED_VALUE",
    }),
  );
  return ((res.data.values ?? []) as unknown[][]).map((row) => row.map(String));
}

export async function valuesAppend(
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<void> {
  const api = sheetsClient();
  await withRetry("valuesAppend", () =>
    api.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values },
    }),
  );
}

// Append banyak baris dalam SATU panggilan (di-chunk 100). WAJIB dipakai untuk
// tulis berdampingan ke tab yang sama: append paralel terpisah saling menimpa
// posisi insert dan baris hilang (terbukti di verifikasi Fase 1: 4/20 selamat).
export async function valuesAppendMany(
  spreadsheetId: string,
  range: string,
  rows: string[][],
  chunk = 100,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunk) {
    await valuesAppend(spreadsheetId, range, rows.slice(i, i + chunk));
  }
}

export async function valuesUpdate(
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<void> {
  const api = sheetsClient();
  await withRetry("valuesUpdate", () =>
    api.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values },
    }),
  );
}
