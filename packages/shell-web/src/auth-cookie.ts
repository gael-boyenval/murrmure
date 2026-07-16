/** Cookie mirror of `murrmure_token` so same-origin iframe navigations authenticate view assets. */
export const AUTH_COOKIE_NAME = "murrmure_token";

export function syncAuthCookie(token: string | null | undefined): void {
  if (typeof document === "undefined") return;
  if (!token?.trim()) {
    document.cookie = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token.trim())}; Path=/; SameSite=Lax`;
}
