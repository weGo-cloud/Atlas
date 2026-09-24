export type AuthErrorCode = "INVALID_CREDENTIALS" | "REPOSITORY_ERROR";

export type AuthServiceError = {
  code: AuthErrorCode;
  message: string;
};

export type AuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AuthServiceError };

export function okAuth<T>(data: T): AuthResult<T> {
  return { ok: true, data };
}

export function failAuth(error: AuthServiceError): AuthResult<never> {
  return { ok: false, error };
}
