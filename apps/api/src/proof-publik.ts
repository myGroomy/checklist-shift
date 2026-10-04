// Bukti perbaikan 401: publikApp di-mount dulu, tanpa cookie.
process.env["PIN_PEPPER"] ??= "uji-fase6-pepper";
process.env["SESSION_SECRET"] ??= "uji-fase6-secret-yang-cukup-panjang-32";

import { Hono } from "hono";
import { valuesGet } from "./lib/sheets.js";
import { registryId } from "./lib/env.js";
import authRoutes from "./routes/auth.js";
import closeRoutes from "./routes/close.js";
import shareRoutes, { publikApp } from "./routes/share.js";
import opsRoutes from "./routes/ops.js";
import reportRoutes from "./routes/report.js";
import type { AuthEnv } from "./lib/authz.js";

async function main(): Promise<void> {
  const app = new Hono<AuthEnv>();
  app.route("/api", publikApp);
  app.route("/api/auth", authRoutes);
  app.route("/api", closeRoutes);
  app.route("/api", shareRoutes);
  app.route("/api", opsRoutes);
  app.route("/api", reportRoutes);

  const reg = registryId() as string;
  const users = await valuesGet(reg, "Users!A2:C10000");
  const adm = users.find((r) => String(r[2] ?? "").startsWith("t1f6adm"))?.[2] ?? "";
  const login = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "proof1" },
    body: JSON.stringify({ username: adm, pin: "618342" }),
  });
  const ck = (login.headers.get("set-cookie") ?? "").split(";")[0];
  console.log("login:", login.status);
  const branches = await valuesGet(reg, "Branches!A2:F10000");
  const b = branches.find((r) => r[2] === "TESTF6");
  const ss = b?.[5] ?? "";
  const shifts = await valuesGet(ss, "ShiftInstances!A2:F100000");
  const closed = shifts.find((r) => r[4] === "ditutup_paksa");
  console.log("shift uji:", closed?.[0], closed?.[4]);
  const bag = await app.request(`/api/laporan/${closed?.[0]}/bagikan`, {
    method: "POST",
    headers: { cookie: ck, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const bagj = (await bag.json()) as { token?: { token?: string } };
  console.log("bagikan:", bag.status);
  const pub = await app.request(`/api/publik/r/${bagj.token?.token ?? "x"}`, { method: "GET" });
  console.log("publik tanpa cookie:", pub.status);
  const pubj = (await pub.json()) as { shift?: { id?: string }; laporan?: { id?: string } };
  console.log("publik shift cocok:", pubj.shift?.id === closed?.[0], "| laporan:", String(pubj.laporan?.id ?? "").slice(0, 8));
  if (pub.status !== 200) {
    console.log("DETAIL GAGAL:", JSON.stringify(pubj).slice(0, 200));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("proof gagal:", (e as Error).message);
  process.exit(1);
});
