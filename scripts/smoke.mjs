// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
// Organizer steps also need SUPABASE_URL, SUPABASE_KEY (anon) and SUPABASE_SERVICE_ROLE_KEY; without them
// they are skipped, unless SMOKE_REQUIRE_ADMIN=1. The service role key is used only by this script.
// With the service role key the script deletes its match and accounts at the end. Never run it against production.

import { randomUUID } from "node:crypto";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const requireAdmin = process.env.SMOKE_REQUIRE_ADMIN === "1";
const stamp = Date.now();
const email = `smoke-${stamp}@example.com`;
const organizerEmail = `smoke-organizer-${stamp}@example.com`;
// New password every run, so leftover smoke accounts cannot be signed into.
const password = `Smoke-${randomUUID()}`;
const match = { side_a: `Smoke A ${stamp}`, side_b: `Smoke B ${stamp}`, starts_at: "2030-06-15T20:45" };
const FORM = 'action="/api/matches"';

// One cookie jar per session: the employee (signup account) and the organizer.
const jar = new Map();
const organizerJar = new Map();
let organizerId = "";

function cookieHeader(cookies) {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response, cookies) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) cookies.delete(name.trim());
    else cookies.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form, cookies = jar } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(cookies),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(response, cookies);
  return { status: response.status, location: response.headers.get("location") ?? "", body: await response.text() };
}

// Direct Supabase call. Only status and a short error message are ever printed, never keys or tokens.
async function supabase(path, { method = "GET", key = SUPABASE_KEY, token = key, body, prefer } = {}) {
  const response = await fetch(SUPABASE_URL + path, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON body
  }
  const message = response.ok ? "" : String(json?.msg ?? json?.message ?? json?.error_description ?? json?.error ?? "");
  return { status: response.status, location: message.slice(0, 120), json };
}

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "matches redirects anonymous user",
    () => request("/matches", { cookies: new Map() }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "add match redirects anonymous user",
    () => request("/api/matches", { method: "POST", form: match, cookies: new Map() }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "employee signs in again",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/", notLocation: "?error=" },
  ],
  ["matches renders for employee without form", () => request("/matches"), { status: 200, notContains: FORM }],
  [
    "add match rejected for employee",
    () => request("/api/matches", { method: "POST", form: match }),
    { status: 302, location: "/matches?error=" },
  ],
  ["employee match not saved", () => request("/matches"), { status: 200, notContains: match.side_a }],
];

const organizerSteps = [
  [
    "admin creates organizer account",
    async () => {
      const result = await supabase("/auth/v1/admin/users", {
        method: "POST",
        key: SUPABASE_SERVICE_ROLE_KEY,
        body: { email: organizerEmail, password, email_confirm: true },
      });
      organizerId = result.json?.id ?? "";
      return { ...result, status: organizerId ? result.status : 0 };
    },
    { status: 200 },
  ],
  [
    "admin grants organizer role",
    async () => {
      const result = await supabase(`/rest/v1/profiles?user_id=eq.${organizerId}`, {
        method: "PATCH",
        key: SUPABASE_SERVICE_ROLE_KEY,
        body: { role: "organizer" },
        prefer: "return=representation",
      });
      // An empty array means no profile row was updated.
      return { ...result, status: result.json?.length === 1 ? result.status : 0 };
    },
    { status: 200 },
  ],
  [
    "organizer signs in",
    () =>
      request("/api/auth/signin", {
        method: "POST",
        form: { email: organizerEmail, password },
        cookies: organizerJar,
      }),
    { status: 302, location: "/", notLocation: "?error=" },
  ],
  [
    "matches renders form for organizer",
    () => request("/matches", { cookies: organizerJar }),
    { status: 200, contains: FORM },
  ],
  [
    "organizer adds match",
    () => request("/api/matches", { method: "POST", form: match, cookies: organizerJar }),
    { status: 302, location: "/matches", notLocation: "?error=" },
  ],
  ["employee sees organizer match", () => request("/matches"), { status: 200, contains: match.side_a }],
  [
    "RLS rejects direct insert by employee",
    async () => {
      const signin = await supabase("/auth/v1/token?grant_type=password", {
        method: "POST",
        body: { email, password },
      });
      const token = signin.json?.access_token;
      if (!token) return { ...signin, status: 0 };
      return supabase("/rest/v1/matches", { method: "POST", token, body: match });
    },
    { status: [401, 403] },
  ],
  [
    "cleanup removes smoke data",
    async () => {
      // The smoke match first, then both smoke accounts (their profiles cascade).
      const removed = await supabase(`/rest/v1/matches?side_a=eq.${encodeURIComponent(match.side_a)}`, {
        method: "DELETE",
        key: SUPABASE_SERVICE_ROLE_KEY,
      });
      if (removed.status < 200 || removed.status >= 300) return removed;
      const signin = await supabase("/auth/v1/token?grant_type=password", {
        method: "POST",
        body: { email, password },
      });
      for (const id of [organizerId, signin.json?.user?.id].filter(Boolean)) {
        const result = await supabase(`/auth/v1/admin/users/${id}`, {
          method: "DELETE",
          key: SUPABASE_SERVICE_ROLE_KEY,
        });
        if (result.status !== 200) return result;
      }
      return { status: 200, location: "" };
    },
    { status: 200 },
  ],
];

function check(actual, expected) {
  const statuses = [expected.status].flat();
  return (
    statuses.includes(actual.status) &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.notLocation === undefined || !actual.location.includes(expected.notLocation)) &&
    (expected.contains === undefined || actual.body.includes(expected.contains)) &&
    (expected.notContains === undefined || !actual.body.includes(expected.notContains))
  );
}

let failed = 0;
async function run(list) {
  for (const [name, step, expected] of list) {
    const actual = await step();
    const ok = check(actual, expected);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
    if (!ok) {
      failed++;
      const body = [
        expected.contains && `containing ${JSON.stringify(expected.contains)}`,
        expected.notContains && `not containing ${JSON.stringify(expected.notContains)}`,
      ].filter(Boolean);
      console.log(`      expected ${[expected.status].flat().join("|")} ${expected.location ?? ""} ${body.join(", ")}`);
    }
  }
}

await run(steps);

if (SUPABASE_URL && SUPABASE_KEY && SUPABASE_SERVICE_ROLE_KEY) {
  await run(organizerSteps);
} else {
  const verdict = requireAdmin ? "FAIL" : "SKIP";
  for (const [name] of organizerSteps) {
    console.log(`${verdict}  ${name}  -> needs SUPABASE_URL, SUPABASE_KEY and SUPABASE_SERVICE_ROLE_KEY`);
  }
  if (requireAdmin) failed += organizerSteps.length;
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
