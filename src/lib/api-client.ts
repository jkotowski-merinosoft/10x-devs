export type PostFormResult<T> = { data: T; error: null } | { data: null; error: string };

const SESSION_EXPIRED = "Sesja wygasła. Zaloguj się ponownie.";
const NETWORK_ERROR = "Brak połączenia z serwerem";

/**
 * Posts form values to an `/api/*` endpoint in JSON mode and maps network and session
 * failures to user-facing messages.
 */
export async function postForm<T>(url: string, values: Record<string, string>): Promise<PostFormResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new URLSearchParams(values),
    });
  } catch {
    return { data: null, error: NETWORK_ERROR };
  }

  // Middleware redirects an expired session to the sign-in page; fetch follows it and gets HTML.
  if (res.redirected || !res.headers.get("content-type")?.includes("application/json")) {
    return { data: null, error: SESSION_EXPIRED };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { data: null, error: SESSION_EXPIRED };
  }

  if (body !== null && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return { data: null, error: body.error };
  }
  if (!res.ok) {
    return { data: null, error: `Błąd serwera (${res.status})` };
  }

  return { data: body as T, error: null };
}
