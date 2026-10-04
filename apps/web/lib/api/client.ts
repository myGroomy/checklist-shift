// API Client untuk fetch ke backend (apps/api via Next.js rewrites)
// Menggunakan fetch native dengan credentials include untuk cookie session

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
  requireAuth?: boolean;
}

class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function buildUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }
  return url.pathname + url.search;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params, requireAuth = true, headers, ...fetchOptions } = options;

  const url = buildUrl(path, params);

  const defaultHeaders: HeadersInit = {
    "Content-Type": "application/json",
    ...headers,
  };

  const res = await fetch(url, {
    ...fetchOptions,
    headers: defaultHeaders,
    credentials: "include", // Kirim cookie session
    cache: "no-store",
  });

  // Handle 401 - session expired
  if (res.status === 401) {
    if (requireAuth) {
      // Redirect ke login
      window.location.href = "/login?expired=1";
    }
    throw new ApiError("unauthorized", "Sesi habis, silakan login lagi", 401);
  }

  // Handle 403 - forbidden
  if (res.status === 403) {
    throw new ApiError("forbidden", "Akses ditolak", 403);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      data?.error?.code ?? "unknown",
      data?.error?.message ?? `HTTP ${res.status}`,
      res.status,
      data
    );
  }

  return data as T;
}

// HTTP Methods
export const api = {
  get: <T>(path: string, params?: Record<string, string>) =>
    request<T>(path, { method: "GET", params }),

  post: <T>(path: string, body: unknown, params?: Record<string, string>) =>
    request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      params,
    }),

  patch: <T>(path: string, body: unknown, params?: Record<string, string>) =>
    request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
      params,
    }),

  delete: <T>(path: string, params?: Record<string, string>) =>
    request<T>(path, { method: "DELETE", params }),

  // Upload file (multipart)
  upload: <T>(path: string, formData: FormData, params?: Record<string, string>) =>
    request<T>(path, {
      method: "POST",
      body: formData,
      params,
      headers: {}, // Browser set Content-Type multipart automatically
    }),
};

export { ApiError };
export type { RequestOptions };