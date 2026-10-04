// Tipe auth yang dipakai bersama api dan web.
export const SESSION_COOKIE = "sesi" as const;

export interface SessionClaims {
  sub: string; // user_id
  sid: string; // session id (ULID)
  role: "admin" | "petugas";
  iat: number;
  exp: number;
}

export interface LoginRequest {
  username: string;
  pin: string;
}

export interface LoginResponse {
  ok: boolean;
  must_change_pin: boolean;
  role: "admin" | "petugas";
  name: string;
}
