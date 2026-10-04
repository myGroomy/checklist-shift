import { valuesAppend, valuesGet, valuesUpdate } from "./sheets.js";

// Repository generik satu tab: validasi header, peta id->baris dari kolom A,
// tulis append/update dengan verifikasi sel A{row} (§9: bangun ulang + ulangi 1x bila geser).
export class SheetRepo {
  private rowmap = new Map<string, number>();
  private headerChecked = false;

  constructor(
    private spreadsheetId: string,
    private tab: string,
    private header: string[],
  ) {}

  private colLetter(i: number): string {
    let n = i + 1;
    let s = "";
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  async headerOk(): Promise<boolean> {
    const rows = await valuesGet(this.spreadsheetId, `${this.tab}!A1:Z1`);
    const got = rows[0] ?? [];
    return this.header.every((h, i) => got[i] === h);
  }

  async assertHeader(): Promise<void> {
    // Header divalidasi sekali per instance (saat koneksi/startup, §2.2).
    if (this.headerChecked) return;
    if (!(await this.headerOk())) {
      throw new Error(`header tab ${this.tab} tidak sesuai skema`);
    }
    this.headerChecked = true;
  }

  async rebuildMap(): Promise<void> {
    const rows = await valuesGet(this.spreadsheetId, `${this.tab}!A2:A100000`);
    this.rowmap.clear();
    rows.forEach((r, i) => {
      if (r[0]) this.rowmap.set(r[0], i + 2);
    });
  }

  async rowOf(id: string): Promise<number | null> {
    const hit = this.rowmap.get(id);
    if (hit !== undefined) return hit;
    await this.rebuildMap();
    return this.rowmap.get(id) ?? null;
  }

  toRow(obj: Record<string, string>): string[] {
    return this.header.map((h) => obj[h] ?? "");
  }

  async append(obj: Record<string, string>): Promise<number> {
    await this.assertHeader();
    const id = obj[this.header[0]];
    if (!id) throw new Error("kolom A (id/key) wajib diisi");
    await valuesAppend(this.spreadsheetId, `${this.tab}!A:${this.colLetter(this.header.length - 1)}`, [
      this.toRow(obj),
    ]);
    // Read-after-write Sheets bisa lag saat paralel: poll terbatas sampai baris terlihat.
    for (let i = 0; i < 6; i++) {
      await this.rebuildMap();
      const row = this.rowmap.get(id);
      if (row) return row;
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error("baris append tidak ditemukan setelah tulis");
  }

  async update(id: string, patch: Record<string, string>): Promise<void> {
    await this.assertHeader();
    for (let attempt = 0; attempt < 2; attempt++) {
      const row = await this.rowOf(id);
      if (!row) throw new Error(`id tidak ditemukan di ${this.tab}`);
      // Verifikasi cache: sel A{row} harus cocok, bila tidak bangun ulang + ulangi 1x (§9).
      const check = await valuesGet(this.spreadsheetId, `${this.tab}!A${row}`);
      if ((check[0]?.[0] ?? "") !== id) {
        this.rowmap.clear();
        await this.rebuildMap();
        if (attempt === 0) continue;
        throw new Error(`peta baris ${this.tab} tidak konsisten`);
      }
      // Implementasi terverifikasi: satu values.update per baris penuh.
      const current = await valuesGet(
        this.spreadsheetId,
        `${this.tab}!A${row}:${this.colLetter(this.header.length - 1)}${row}`,
      );
      const base = Object.fromEntries(this.header.map((h, i) => [h, current[0]?.[i] ?? ""]));
      const merged = this.toRow(base);
      for (const [k, v] of Object.entries(patch)) {
        const i = this.header.indexOf(k);
        if (i < 0) throw new Error(`kolom tak dikenal: ${k}`);
        merged[i] = v;
      }
      await valuesUpdate(
        this.spreadsheetId,
        `${this.tab}!A${row}:${this.colLetter(this.header.length - 1)}${row}`,
        [merged],
      );
      return;
    }
  }

  async get(id: string): Promise<Record<string, string> | null> {
    await this.assertHeader();
    const row = await this.rowOf(id);
    if (!row) return null;
    const rows = await valuesGet(
      this.spreadsheetId,
      `${this.tab}!A${row}:${this.colLetter(this.header.length - 1)}${row}`,
    );
    const vals = rows[0] ?? [];
    return Object.fromEntries(this.header.map((h, i) => [h, vals[i] ?? ""]));
  }
}
