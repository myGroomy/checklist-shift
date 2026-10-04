// Helper env terpusat. Nilai tidak pernah di-log atau dikembalikan ke klien.
export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function unquote(v: string): string {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  return v;
}

export function registryId(): string | undefined {
  return (
    env("REGISTRY_SPREADSHEET_ID") ??
    env("REGISTRY_SPREADSHEETS_ID") ??
    env("REGISTRY")
  );
}

export function serviceAccount(): { email: string; key: string } | null {
  const email = env("GOOGLE_SA_EMAIL") ?? env("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  let key = env("GOOGLE_SA_PRIVATE_KEY") ?? env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  if (!email || !key) return null;
  key = unquote(key);
  if (key.includes("\\n")) key = key.replace(/\\n/g, "\n");
  return { email, key };
}

export function redisConfig(): { url: string; token: string } | null {
  const url = env("UPSTASH_REDIS_REST_URL");
  const token = env("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) return null;
  return { url, token };
}
