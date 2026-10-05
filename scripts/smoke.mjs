// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
// Organizer steps also need SUPABASE_URL, SUPABASE_KEY (anon) and SUPABASE_SERVICE_ROLE_KEY; without them
// they are skipped, unless SMOKE_REQUIRE_ADMIN=1. The service role key is used only by this script.
// With the service role key the script deletes its matches (their tips cascade) and accounts at the end.
// Never run it against production.

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
// Already started, so tipping is closed and every tip on it is visible.
const pastMatch = { side_a: `Smoke Past A ${stamp}`, side_b: `Smoke Past B ${stamp}`, starts_at: "2020-06-15T20:45" };
// Display names follow public.mask_email(): first domain label -> first letter + ".." + last letter.
const maskedEmail = `smoke-${stamp}@e..e.com`;
const maskedOrganizerEmail = `smoke-organizer-${stamp}@e..e.com`;
const FORM = 'action="/api/matches"';

// One cookie jar per session: the employee (signup account) and the organizer.
const jar = new Map();
const organizerJar = new Map();
let organizerId = "";
let futureId = "";
let pastId = "";
// Supabase API sessions (access token + user id), one per e-mail, created on first use.
const apiSessions = new Map();

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

// Signs in through the Supabase auth API. The token stays in memory and is never printed.
async function apiSession(address) {
  const cached = apiSessions.get(address);
  if (cached) return cached;
  const result = await supabase("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email: address, password },
  });
  const session = { result, token: result.json?.access_token ?? "", userId: result.json?.user?.id ?? "" };
  if (session.token) apiSessions.set(address, session);
  return session;
}

// Narrows the /matches page to the table row of one match, so assertions cannot hit other rows
// (e.g. "1:0" inside the "21:00" kick-off time of an unrelated match). The island's serialized
// props also contain the match names, so only text after a `<tr` counts.
async function matchRow(sideA, cookies = jar) {
  const page = await request("/matches", { cookies });
  const row = page.body
    .split("<tr")
    .slice(1)
    .map((chunk) => {
      const end = chunk.indexOf("</tr>");
      return end === -1 ? chunk : chunk.slice(0, end);
    })
    .find((chunk) => chunk.includes(sideA));
  if (row === undefined) return { ...page, status: 0, location: "match row not found", body: "" };
  return { ...page, body: `<tr${row}` };
}

// Reads the id of a smoke match through the service role.
async function matchId(sideA) {
  const result = await supabase(`/rest/v1/matches?select=id&side_a=eq.${encodeURIComponent(sideA)}`, {
    key: SUPABASE_SERVICE_ROLE_KEY,
  });
  return Array.isArray(result.json) && result.json.length === 1 ? String(result.json[0].id) : "";
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
  [
    "match page redirects anonymous user",
    () => request("/matches/1", { cookies: new Map() }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "save tip redirects anonymous user",
    () =>
      request("/api/tips", {
        method: "POST",
        form: { match_id: "1", score_a: "1", score_b: "0" },
        cookies: new Map(),
      }),
    { status: 302, location: "/auth/signin" },
  ],
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
    "organizer adds started match",
    () => request("/api/matches", { method: "POST", form: pastMatch, cookies: organizerJar }),
    { status: 302, location: "/matches", notLocation: "?error=" },
  ],
  [
    "admin reads smoke match ids",
    async () => {
      futureId = await matchId(match.side_a);
      pastId = await matchId(pastMatch.side_a);
      return { status: futureId && pastId ? 200 : 0, location: "" };
    },
    { status: 200 },
  ],
  [
    "employee saves tip",
    () => request("/api/tips", { method: "POST", form: { match_id: futureId, score_a: "97", score_b: "3" } }),
    () => ({ status: 302, location: `/matches/${futureId}`, notLocation: "?error=" }),
  ],
  ["list shows saved tip", () => matchRow(match.side_a), { status: 200, contains: 'data-tip="97:3"' }],
  [
    "employee corrects tip",
    () => request("/api/tips", { method: "POST", form: { match_id: futureId, score_a: "98", score_b: "4" } }),
    () => ({ status: 302, location: `/matches/${futureId}`, notLocation: "?error=" }),
  ],
  [
    "list shows corrected tip",
    () => matchRow(match.side_a),
    { status: 200, contains: 'data-tip="98:4"', notContains: 'data-tip="97:3"' },
  ],
  [
    "tip rejected after kick-off",
    () => request("/api/tips", { method: "POST", form: { match_id: pastId, score_a: "1", score_b: "1" } }),
    () => ({ status: 302, location: `/matches/${pastId}?error=` }),
  ],
  [
    "RLS rejects direct tip after kick-off",
    async () => {
      const { result, token } = await apiSession(email);
      if (!token) return { ...result, status: 0 };
      return supabase("/rest/v1/tips", {
        method: "POST",
        token,
        body: { match_id: Number(pastId), score_a: 1, score_b: 1 },
      });
    },
    { status: [401, 403] },
  ],
  [
    "RLS hides other tips before kick-off",
    async () => {
      const { result, token } = await apiSession(organizerEmail);
      if (!token) return { ...result, status: 0 };
      const tips = await supabase(`/rest/v1/tips?select=score_a,score_b&match_id=eq.${futureId}`, { token });
      // Only a successful empty array passes; an error must not look like "no tips".
      const empty = Array.isArray(tips.json) && tips.json.length === 0;
      return { ...tips, status: empty ? tips.status : 0 };
    },
    { status: 200 },
  ],
  [
    "RLS blocks changing other tips",
    async () => {
      const organizer = await apiSession(organizerEmail);
      const employee = await apiSession(email);
      if (!organizer.token) return { ...organizer.result, status: 0 };
      if (!employee.userId) return { ...employee.result, status: 0 };
      const filter = `match_id=eq.${futureId}&user_id=eq.${employee.userId}`;
      const patched = await supabase(`/rest/v1/tips?${filter}`, {
        method: "PATCH",
        token: organizer.token,
        body: { score_a: 0, score_b: 0 },
        prefer: "return=representation",
      });
      if (!Array.isArray(patched.json) || patched.json.length !== 0) return { ...patched, status: 0 };
      const stored = await supabase(`/rest/v1/tips?select=score_a,score_b&${filter}`, {
        key: SUPABASE_SERVICE_ROLE_KEY,
      });
      const tip = Array.isArray(stored.json) && stored.json.length === 1 ? stored.json[0] : null;
      const intact = tip?.score_a === 98 && tip?.score_b === 4;
      return { status: intact ? patched.status : 0, location: intact ? "" : "employee tip not 98:4" };
    },
    { status: 200 },
  ],
  [
    "match page hides other tips before kick-off",
    () => request(`/matches/${futureId}`, { cookies: organizerJar }),
    { status: 200, notContains: maskedEmail },
  ],
  [
    "admin adds organizer tip after kick-off",
    () =>
      supabase("/rest/v1/tips", {
        method: "POST",
        key: SUPABASE_SERVICE_ROLE_KEY,
        body: { match_id: Number(pastId), user_id: organizerId, score_a: 1, score_b: 0 },
      }),
    { status: 201 },
  ],
  [
    "list shows only own tip after kick-off",
    // The organizer's 1:0 is readable after kick-off, but the list filters by user.
    () => matchRow(pastMatch.side_a),
    { status: 200, contains: 'data-tip=""', notContains: 'data-tip="1:0"' },
  ],
  [
    "match page shows masked tips after kick-off",
    () => request(`/matches/${pastId}`),
    { status: 200, contains: maskedOrganizerEmail },
  ],
  [
    "RLS rejects direct insert by employee",
    async () => {
      const { result, token } = await apiSession(email);
      if (!token) return { ...result, status: 0 };
      return supabase("/rest/v1/matches", { method: "POST", token, body: match });
    },
    { status: [401, 403] },
  ],
  [
    "cleanup removes smoke data",
    async () => {
      // Both smoke matches first (their tips cascade), then both smoke accounts (their profiles cascade).
      for (const sideA of [match.side_a, pastMatch.side_a]) {
        const removed = await supabase(`/rest/v1/matches?side_a=eq.${encodeURIComponent(sideA)}`, {
          method: "DELETE",
          key: SUPABASE_SERVICE_ROLE_KEY,
        });
        if (removed.status < 200 || removed.status >= 300) return removed;
      }
      const employee = await apiSession(email);
      for (const id of [organizerId, employee.userId].filter(Boolean)) {
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
  for (const [name, step, expectation] of list) {
    const actual = await step();
    // Expectations built from ids read at run time are functions.
    const expected = typeof expectation === "function" ? expectation() : expectation;
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
