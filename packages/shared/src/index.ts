// Kontrak minimal Fase 0 antara apps/web dan apps/api.
// Skema Zod per tab menyusul di Fase 1 (DATABASE_SCHEMA.md).

export const HEALTH_PATH = "/api/health" as const;
export * from "./auth.js";
export * from "./schemas.js";
export * from "./ids.js";
export * from "./time.js";
export * from "./admin.js";
export * from "./offline.js";

export type HealthStatus = "ok" | "degraded";

export interface HealthResponse {
  status: HealthStatus;
  service: "checklist-shift-api";
  checks: {
    registry: "ok" | "skipped" | "error";
  };
  detail?: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export function toApiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}
