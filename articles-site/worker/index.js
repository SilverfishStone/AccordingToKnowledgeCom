/* The articles site's server (a Cloudflare Worker). Everything under /api/ comes here; every
   other address is a file from dist/ (see wrangler.jsonc).

   It keeps accounts, comments, messages and picture requests in a D1 database (binding DB)
   and emails Silver about new comments, messages and picture requests (binding EMAIL).

   Accounts hold only a username, a password and a picture:
   - The browser stretches the password first (PBKDF2, see community.js), so the
     expensive part runs on the visitor's device and stays inside the free plan's CPU limit.
     Here it's salted and hashed again, so the database never holds anything a password
     could be read back from.
   - A recovery code, shown once at sign-up, resets a forgotten password. Silver can issue a
     new one from /admin.
   - Sign-in is a random token in an HttpOnly cookie; only its hash is stored. */
import { EmailMessage } from "cloudflare:email";

const SESSION_DAYS = 60;
const COOKIE = "atk_session";
const DAY = 86400000;
const LIMITS = {
  username: [3, 24],
  comment: 3000,
  message: 4000,
  picture: 120000,   // characters of the data: URL (a 128 px square is ~10–40 k)
};
const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/;
const RESERVED = ["admin", "administrator", "moderator", "mod", "staff", "support", "system", "root", "deleted", "anonymous", "accordingtoknowledge"];
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      if (!env.DB) throw new HttpError(503, "Accounts aren't switched on yet.");
      await ensureSchema(env);
      return await route(request, env, ctx, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status);
      console.error(e && e.stack || e);
      return json({ error: "Something went wrong on the server. Try again in a moment." }, 500);
    }
  },
};

/* ───────── routing ───────── */
const ROUTES = [
  ["GET", /^\/api\/me$/, me],
  ["POST", /^\/api\/signup$/, signup],
  ["POST", /^\/api\/login$/, login],
  ["POST", /^\/api\/logout$/, logout],
  ["POST", /^\/api\/recover$/, recover],
  ["POST", /^\/api\/account\/password$/, changePassword],
  ["POST", /^\/api\/account\/recovery$/, rotateRecovery],
  ["POST", /^\/api\/account\/avatar$/, chooseAvatar],
  ["POST", /^\/api\/account\/picture$/, requestPicture],
  ["POST", /^\/api\/account\/logout-all$/, logoutAll],
  ["POST", /^\/api\/account\/delete$/, deleteAccount],
  ["GET", /^\/api\/picture\/(\d+)$/, picture],
  ["GET", /^\/api\/comments$/, listComments],
  ["POST", /^\/api\/comments$/, postComment],
  ["POST", /^\/api\/comments\/(\d+)\/delete$/, deleteComment],
  ["GET", /^\/api\/messages$/, myMessages],
  ["POST", /^\/api\/messages$/, sendMessage],
  ["GET", /^\/api\/admin\/overview$/, adminOverview],
  ["POST", /^\/api\/admin\/test-email$/, adminTestEmail],
  ["POST", /^\/api\/admin\/comments\/(\d+)$/, adminComment],
  ["POST", /^\/api\/admin\/pictures\/(\d+)$/, adminPicture],
  ["GET", /^\/api\/admin\/messages\/(\d+)$/, adminThread],
  ["POST", /^\/api\/admin\/messages\/(\d+)$/, adminReply],
  ["GET", /^\/api\/admin\/users$/, adminUsers],
  ["GET", /^\/api\/admin\/words$/, adminWords],
  ["POST", /^\/api\/admin\/words$/, adminSaveWords],
  ["POST", /^\/api\/admin\/users\/(\d+)$/, adminUser],
];

async function route(request, env, ctx, url) {
  const method = request.method === "HEAD" ? "GET" : request.method;
  for (const [m, re, handler] of ROUTES) {
    const match = url.pathname.match(re);
    if (!match) continue;
    if (m !== method) continue;
    // anything that changes something must come from this site, as JSON
    if (method !== "GET") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) throw new HttpError(403, "Not allowed from another site.");
      if (!(request.headers.get("Content-Type") || "").includes("application/json")) throw new HttpError(415, "Send JSON.");
    }
    const c = { request, env, ctx, url, params: match.slice(1), body: null, user: null };
    c.user = await currentUser(c);
    if (method !== "GET") c.body = await request.json().catch(() => { throw new HttpError(400, "That request wasn't valid JSON."); });
    return handler(c);
  }
  throw new HttpError(404, "No such address.");
}

/* ───────── database ───────── */
// Each entry is one step; steps already run are skipped (the number reached is kept in meta).
const MIGRATIONS = [
  [
    `CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pass_salt TEXT NOT NULL, pass_hash TEXT NOT NULL,
      recovery_salt TEXT NOT NULL, recovery_hash TEXT NOT NULL,
      avatar TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', banned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL)`,
    `CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
    `CREATE INDEX sessions_user ON sessions (user_id)`,
    `CREATE TABLE pictures (user_id INTEGER PRIMARY KEY, approved TEXT, pending TEXT, updated_at INTEGER NOT NULL)`,
    `CREATE TABLE comments (id INTEGER PRIMARY KEY, slug TEXT NOT NULL, user_id INTEGER NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE INDEX comments_slug ON comments (slug, status, created_at)`,
    `CREATE INDEX comments_status ON comments (status, created_at)`,
    `CREATE INDEX comments_user ON comments (user_id)`,
    `CREATE TABLE messages (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, from_admin INTEGER NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER)`,
    `CREATE INDEX messages_user ON messages (user_id, created_at)`,
    `CREATE TABLE limits (key TEXT PRIMARY KEY, win INTEGER NOT NULL, count INTEGER NOT NULL, expires INTEGER NOT NULL)`,
  ],
];
let schemaReady = null;
function ensureSchema(env) {
  return (schemaReady ||= (async () => {
    const db = env.DB;
    await db.prepare("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)").run();
    const row = await db.prepare("SELECT value FROM meta WHERE key = 'schema'").first();
    const done = row ? Number(row.value) : 0;
    for (let i = done; i < MIGRATIONS.length; i++) {
      await db.batch([
        ...MIGRATIONS[i].map((sql) => db.prepare(sql)),
        db.prepare("INSERT INTO meta (key, value) VALUES ('schema', ?1) ON CONFLICT (key) DO UPDATE SET value = ?1").bind(String(i + 1)),
      ]);
    }
  })().catch((e) => { schemaReady = null; throw e; }));
}
const one = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
const all = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results || [];
const run = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).run();

/* ───────── small helpers ───────── */
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function sameHex(a, b) {   // compare without stopping at the first difference
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const hashSecret = (salt, secret) => sha256(`${salt}:${secret}`);

function newRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return chars.match(/.{4}/g).join("-");
}
const normalCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function text(v, name, max, min = 1) {
  const s = typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "";
  if (s.length < min) throw new HttpError(400, `${name} can't be empty.`);
  if (s.length > max) throw new HttpError(400, `${name} is too long (${s.length} of ${max} characters).`);
  return s;
}
function prehash(v, what = "password") {
  if (typeof v !== "string" || !/^[0-9a-f]{64}$/.test(v)) throw new HttpError(400, `That ${what} wasn't sent properly. Reload the page and try again.`);
  return v;
}

// n tries per `seconds` for one key; IP addresses are only ever stored hashed
async function limit(c, what, max, seconds, who) {
  const now = Date.now(), win = Math.floor(now / 1000 / seconds);
  const ip = c.request.headers.get("CF-Connecting-IP") || "local";
  const key = `${what}:${who ?? (await sha256("ip:" + ip)).slice(0, 24)}`;
  const row = await one(c.env,
    `INSERT INTO limits (key, win, count, expires) VALUES (?1, ?2, 1, ?3)
     ON CONFLICT (key) DO UPDATE SET count = CASE WHEN win = ?2 THEN count + 1 ELSE 1 END, win = ?2, expires = ?3
     RETURNING count`, key, win, (win + 1) * seconds * 1000);
  if (Math.random() < 0.02) await run(c.env, "DELETE FROM limits WHERE expires < ?1", now);
  if (row && row.count > max) throw new HttpError(429, "That's too many tries for now. Wait a little and try again.");
}

async function turnstile(c, token) {
  if (!c.env.TURNSTILE_SECRET) return;   // not set up: rate limits only
  const form = new FormData();
  form.append("secret", c.env.TURNSTILE_SECRET);
  form.append("response", String(token || ""));
  const ip = c.request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form }).then((x) => x.json()).catch(() => null);
  if (!r || !r.success) throw new HttpError(400, "The \"are you human\" check didn't pass. Try it again.");
}

/* ───────── the flagged-words list (edited in /admin, kept in meta) ─────────
   One word or phrase per line. Matching ignores case and accents and only matches whole words,
   so "ass" doesn't catch "class". End an entry with * to also match longer words ("idiot*"
   catches "idiots" and "idiotic"). */
async function flaggedList(env) {
  const row = await one(env, "SELECT value FROM meta WHERE key = 'flagged_words'");
  try { return row ? JSON.parse(row.value) : []; } catch { return []; }
}
const fold = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
async function flaggedWord(env, textToCheck) {
  const hay = fold(textToCheck);
  for (const entry of await flaggedList(env)) {
    const e = fold(entry).trim();
    if (!e) continue;
    const wild = e.endsWith("*"), core = escRe(wild ? e.slice(0, -1).trim() : e).replace(/\s+/g, "\\s+");
    if (!core) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${core}${wild ? "" : "(?![\\p{L}\\p{N}])"}`, "u");
    if (re.test(hay)) return entry.trim();
  }
  return null;
}

/* ───────── articles and avatars (read from the site's own files) ───────── */
let articleCache = null;
async function articles(c) {
  if (articleCache && articleCache.at > Date.now() - 60000) return articleCache.map;
  const res = await c.env.ASSETS.fetch(new Request(new URL("/articles/index.json", c.url)));
  const list = res.ok ? await res.json() : [];
  const map = new Map((Array.isArray(list) ? list : []).map((a) => [a.slug, a]));
  articleCache = { at: Date.now(), map };
  return map;
}
let avatarCache = null;
async function avatarIds(c) {
  if (avatarCache) return avatarCache;
  const res = await c.env.ASSETS.fetch(new Request(new URL("/assets/avatars/index.json", c.url)));
  const list = res.ok ? await res.json() : [];
  avatarCache = new Set(list.map((a) => a.id));
  return avatarCache;
}

/* ───────── sessions ───────── */
function cookieValue(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
const sessionCookie = (token, maxAge) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

async function currentUser(c) {
  const token = cookieValue(c.request, COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const u = await one(c.env,
    `SELECT u.id, u.username, u.avatar, u.role, u.banned, p.updated_at AS picture_at
     FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN pictures p ON p.user_id = u.id
     WHERE s.token_hash = ?1 AND s.expires_at > ?2`, await sha256(token), Date.now());
  if (!u || u.banned) return null;
  return u;
}
async function startSession(c, userId) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await run(c.env, "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)",
    await sha256(token), userId, now, now + SESSION_DAYS * DAY);
  if (Math.random() < 0.05) await run(c.env, "DELETE FROM sessions WHERE expires_at < ?1", now);
  return sessionCookie(token, SESSION_DAYS * 86400);
}
function need(c, admin = false) {
  if (!c.user) throw new HttpError(401, "Sign in first.");
  if (admin && c.user.role !== "admin") throw new HttpError(403, "Only Silver can do that.");
  return c.user;
}
// what the site is told about an account
const publicUser = (u) => u && ({
  id: u.id, username: u.username, avatar: u.avatar, role: u.role === "admin" ? "admin" : "user",
  picture: u.avatar === "custom" && u.picture_at ? `/api/picture/${u.id}?v=${u.picture_at}` : null,
});

async function checkPassword(c, userId, given) {
  const row = await one(c.env, "SELECT pass_salt, pass_hash FROM users WHERE id = ?1", userId);
  if (!row || !sameHex(await hashSecret(row.pass_salt, prehash(given)), row.pass_hash)) throw new HttpError(403, "That password isn't right.");
}
async function setRecovery(env, userId) {
  const code = newRecoveryCode(), salt = randomHex(16);
  await run(env, "UPDATE users SET recovery_salt = ?1, recovery_hash = ?2 WHERE id = ?3", salt, await hashSecret(salt, normalCode(code)), userId);
  return code;
}

/* ───────── email to Silver ───────── */
// Sends one alert. Tries the classic way first (a raw message through Email Routing), then
// Cloudflare's newer message format, and records how it went in meta so /admin can show it.
async function sendAlert(env, origin, subject, lines) {
  if (!env.EMAIL || !env.ALERT_TO) throw Object.assign(new Error("Email alerts aren't set up (no EMAIL binding)."), { code: "NOT_SET_UP" });
  const from = env.ALERT_FROM || "alerts@accordingtoknowledge.com";
  const text = [...lines, "", `Review it: ${origin}/admin`].join("\n");
  const b64 = (s) => { let out = ""; for (const b of enc.encode(s)) out += String.fromCharCode(b); return btoa(out); };
  const raw = [
    `From: According To Knowledge <${from}>`,
    `To: <${env.ALERT_TO}>`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomHex(12)}@${from.split("@")[1]}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(text).replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
  const errors = [];
  try {
    await env.EMAIL.send(new EmailMessage(from, env.ALERT_TO, raw));
    return "classic";
  } catch (e) { errors.push(`classic: ${e && (e.code ? e.code + " " : "") + e.message}`); }
  try {
    await env.EMAIL.send({ from: { email: from, name: "According To Knowledge" }, to: env.ALERT_TO, subject, text });
    return "new";
  } catch (e) { errors.push(`new: ${e && (e.code ? e.code + " " : "") + e.message}`); }
  throw new Error(errors.join(" | "));
}
async function recordEmail(env, status) {
  await run(env, "INSERT INTO meta (key, value) VALUES ('email_status', ?1) ON CONFLICT (key) DO UPDATE SET value = ?1", JSON.stringify(status)).catch(() => {});
}
function notify(c, subject, lines) {
  if (!c.env.EMAIL || !c.env.ALERT_TO) return;
  c.ctx.waitUntil(sendAlert(c.env, c.url.origin, subject, lines)
    .then((how) => recordEmail(c.env, { ok: true, at: Date.now(), how, subject }))
    .catch((e) => { console.error("alert email failed:", e); return recordEmail(c.env, { ok: false, at: Date.now(), error: String(e.message || e), subject }); }));
}
const excerpt = (s, n = 400) => (s.length > n ? s.slice(0, n) + "…" : s);

/* ───────── account ───────── */
async function me(c) {
  if (!c.user) return json({ user: null });
  const unread = c.user.role === "admin"
    ? await one(c.env, "SELECT COUNT(*) AS n FROM messages WHERE from_admin = 0 AND read_at IS NULL")
    : await one(c.env, "SELECT COUNT(*) AS n FROM messages WHERE user_id = ?1 AND from_admin = 1 AND read_at IS NULL", c.user.id);
  const out = { user: publicUser(c.user), unread: unread ? unread.n : 0 };
  if (c.user.role === "admin") {
    const p = await one(c.env, "SELECT (SELECT COUNT(*) FROM comments WHERE status = 'pending') AS comments, (SELECT COUNT(*) FROM pictures WHERE pending IS NOT NULL) AS pictures");
    out.pending = p;
  }
  // their own picture: approved (so they can switch back to it) and/or waiting for approval
  const p = await one(c.env, "SELECT approved IS NOT NULL AS has, pending IS NOT NULL AS waiting, updated_at FROM pictures WHERE user_id = ?1", c.user.id);
  out.pictureWaiting = !!(p && p.waiting);
  out.ownPicture = p && p.has ? `/api/picture/${c.user.id}?v=${p.updated_at}` : null;
  return json(out);
}

async function signup(c) {
  const b = c.body;
  const username = String(b.username || "").trim();
  if (!USERNAME_RE.test(username)) throw new HttpError(400, "Usernames are 3 to 24 letters, numbers, dots, dashes or underscores, starting with a letter or number.");
  await limit(c, "signup", 5, 3600);
  await turnstile(c, b.turnstile);
  const isAdmin = c.env.ADMIN_USERNAME && username.toLowerCase() === c.env.ADMIN_USERNAME.toLowerCase();
  if (isAdmin) {
    if (!c.env.ADMIN_CODE) throw new HttpError(403, "That username is taken.");
    if (!b.adminCode) throw new HttpError(403, "That username is reserved. Enter the admin code to claim it.", { needAdminCode: true });
    if (!sameHex(await sha256(String(b.adminCode)), await sha256(c.env.ADMIN_CODE))) throw new HttpError(403, "That admin code isn't right.", { needAdminCode: true });
  } else if (RESERVED.includes(username.toLowerCase())) throw new HttpError(400, "That username is reserved. Pick another.");
  if (!isAdmin && await flaggedWord(c.env, username.replace(/[_.-]+/g, " "))) throw new HttpError(400, "That username isn't allowed. Pick another.");
  const pass = prehash(b.password);
  const avatars = [...(await avatarIds(c))];
  const avatar = avatars.includes(b.avatar) ? b.avatar : avatars[0] || "default";
  const salt = randomHex(16), code = newRecoveryCode(), rsalt = randomHex(16);
  const row = await one(c.env,
    `INSERT INTO users (username, pass_salt, pass_hash, recovery_salt, recovery_hash, avatar, role, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT (username) DO NOTHING RETURNING id`,
    username, salt, await hashSecret(salt, pass), rsalt, await hashSecret(rsalt, normalCode(code)), avatar, isAdmin ? "admin" : "user", Date.now());
  if (!row) throw new HttpError(409, "That username is taken. Pick another.");
  const cookie = await startSession(c, row.id);
  const user = await one(c.env, "SELECT id, username, avatar, role FROM users WHERE id = ?1", row.id);
  return json({ user: publicUser(user), recoveryCode: code }, 200, { "Set-Cookie": cookie });
}

async function login(c) {
  const username = String(c.body.username || "").trim();
  await limit(c, "login-ip", 30, 900);
  await limit(c, "login-user", 10, 900, username.toLowerCase().slice(0, 40));
  const u = await one(c.env, "SELECT id, username, avatar, role, banned, pass_salt, pass_hash FROM users WHERE username = ?1", username);
  const given = prehash(c.body.password);
  // the same work whether or not the account exists
  const ok = sameHex(await hashSecret(u ? u.pass_salt : "none", given), u ? u.pass_hash : "x");
  if (!u || !ok) throw new HttpError(403, "That username and password don't match.");
  if (u.banned) throw new HttpError(403, "This account has been suspended.");
  const cookie = await startSession(c, u.id);
  const full = await currentUserById(c.env, u.id);
  return json({ user: publicUser(full) }, 200, { "Set-Cookie": cookie });
}
const currentUserById = (env, id) => one(env,
  "SELECT u.id, u.username, u.avatar, u.role, u.banned, p.updated_at AS picture_at FROM users u LEFT JOIN pictures p ON p.user_id = u.id WHERE u.id = ?1", id);

async function logout(c) {
  const token = cookieValue(c.request, COOKIE);
  if (token) await run(c.env, "DELETE FROM sessions WHERE token_hash = ?1", await sha256(token));
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}

async function recover(c) {
  const username = String(c.body.username || "").trim();
  await limit(c, "recover-ip", 10, 3600);
  await limit(c, "recover-user", 5, 3600, username.toLowerCase().slice(0, 40));
  const u = await one(c.env, "SELECT id, banned, recovery_salt, recovery_hash FROM users WHERE username = ?1", username);
  const ok = u && sameHex(await hashSecret(u.recovery_salt, normalCode(c.body.code)), u.recovery_hash);
  if (!ok) throw new HttpError(403, "That username and recovery code don't match.");
  if (u.banned) throw new HttpError(403, "This account has been suspended.");
  const pass = prehash(c.body.password, "new password"), salt = randomHex(16);
  await run(c.env, "UPDATE users SET pass_salt = ?1, pass_hash = ?2 WHERE id = ?3", salt, await hashSecret(salt, pass), u.id);
  await run(c.env, "DELETE FROM sessions WHERE user_id = ?1", u.id);   // sign out everywhere else
  const code = await setRecovery(c.env, u.id);                         // the old code is used up
  const cookie = await startSession(c, u.id);
  return json({ user: publicUser(await currentUserById(c.env, u.id)), recoveryCode: code }, 200, { "Set-Cookie": cookie });
}

async function changePassword(c) {
  const u = need(c);
  await limit(c, "password", 10, 3600, "u" + u.id);
  await checkPassword(c, u.id, c.body.current);
  const pass = prehash(c.body.password, "new password"), salt = randomHex(16);
  await run(c.env, "UPDATE users SET pass_salt = ?1, pass_hash = ?2 WHERE id = ?3", salt, await hashSecret(salt, pass), u.id);
  // other devices have to sign in again with the new password
  const token = cookieValue(c.request, COOKIE);
  await run(c.env, "DELETE FROM sessions WHERE user_id = ?1 AND token_hash != ?2", u.id, await sha256(token || ""));
  return json({ ok: true });
}

async function rotateRecovery(c) {
  const u = need(c);
  await limit(c, "password", 10, 3600, "u" + u.id);
  await checkPassword(c, u.id, c.body.current);
  return json({ recoveryCode: await setRecovery(c.env, u.id) });
}

async function chooseAvatar(c) {
  const u = need(c);
  const id = String(c.body.avatar || "");
  if (id === "custom") {
    const p = await one(c.env, "SELECT approved FROM pictures WHERE user_id = ?1", u.id);
    if (!p || !p.approved) throw new HttpError(400, "Your own picture hasn't been approved yet.");
  } else if (!(await avatarIds(c)).has(id)) throw new HttpError(400, "That picture isn't one of the choices.");
  await run(c.env, "UPDATE users SET avatar = ?1 WHERE id = ?2", id, u.id);
  return json({ user: publicUser(await currentUserById(c.env, u.id)) });
}

async function requestPicture(c) {
  const u = need(c);
  await limit(c, "picture", 5, 86400, "u" + u.id);
  const img = String(c.body.image || "");
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(img)) throw new HttpError(400, "That picture couldn't be read. Try a PNG or JPEG.");
  if (img.length > LIMITS.picture) throw new HttpError(400, "That picture is too big. Try a smaller one.");
  await run(c.env,
    `INSERT INTO pictures (user_id, pending, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT (user_id) DO UPDATE SET pending = ?2`, u.id, img, Date.now());
  notify(c, `Picture request from ${u.username}`, [`${u.username} asked to use their own profile picture.`]);
  return json({ ok: true });
}

async function logoutAll(c) {
  const u = need(c);
  await run(c.env, "DELETE FROM sessions WHERE user_id = ?1", u.id);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}

async function removeUser(env, id) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM comments WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM messages WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM pictures WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(id),
  ]);
}
async function deleteAccount(c) {
  const u = need(c);
  if (u.role === "admin") throw new HttpError(400, "The admin account can't delete itself here.");
  await limit(c, "password", 10, 3600, "u" + u.id);
  await checkPassword(c, u.id, c.body.current);
  await removeUser(c.env, u.id);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}

async function picture(c) {
  const id = Number(c.params[0]);
  const p = await one(c.env, "SELECT approved, pending FROM pictures WHERE user_id = ?1", id);
  // a pending picture is only shown to Silver (to review) and its owner
  const canSeePending = c.user && (c.user.role === "admin" || c.user.id === id) && c.url.searchParams.get("pending") === "1";
  const src = canSeePending ? p && p.pending : p && p.approved;
  if (!src) throw new HttpError(404, "No picture.");
  const [, mime, data] = src.match(/^data:([^;]+);base64,(.*)$/);
  const bin = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
  return new Response(bin, { headers: { "Content-Type": mime, "Cache-Control": canSeePending ? "no-store" : "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}

/* ───────── comments ───────── */
const commentRow = (r, me) => ({
  id: r.id, body: r.body, created: r.created_at, status: r.status, mine: !!me && r.user_id === me.id,
  user: publicUser({ id: r.user_id, username: r.username, avatar: r.avatar, role: r.role, picture_at: r.picture_at }),
});
const COMMENT_SELECT = `SELECT c.id, c.slug, c.body, c.created_at, c.status, c.user_id, u.username, u.avatar, u.role, p.updated_at AS picture_at
  FROM comments c JOIN users u ON u.id = c.user_id LEFT JOIN pictures p ON p.user_id = u.id`;

async function listComments(c) {
  const slug = c.url.searchParams.get("slug") || "";
  const me = c.user, admin = me && me.role === "admin";
  const rows = await all(c.env,
    `${COMMENT_SELECT} WHERE c.slug = ?1 AND (c.status = 'approved' OR (c.status = 'pending' AND (c.user_id = ?2 OR ?3 = 1)))
     ORDER BY c.created_at`, slug, me ? me.id : -1, admin ? 1 : 0);
  return json({ comments: rows.map((r) => commentRow(r, me)) });
}

async function postComment(c) {
  const u = need(c);
  const slug = String(c.body.slug || "");
  const art = (await articles(c)).get(slug);
  if (!art) throw new HttpError(404, "That article doesn't exist.");
  const body = text(c.body.body, "Your comment", LIMITS.comment);
  await limit(c, "comment", 10, 3600, "u" + u.id);
  // comments go up straight away, unless they use a word from Silver's list (set in /admin)
  const hit = u.role === "admin" ? null : await flaggedWord(c.env, body);
  const status = hit ? "pending" : "approved";
  const row = await one(c.env, "INSERT INTO comments (slug, user_id, body, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id",
    slug, u.id, body, status, Date.now());
  if (u.role !== "admin") {
    notify(c, hit ? `Comment held for review on “${art.title}”` : `New comment on “${art.title}”`, [
      `${u.username} commented on “${art.title}”${hit ? ` (held because it contains “${hit}”)` : ""}:`, "", excerpt(body),
      "", hit ? "It won't show until you approve it." : `It's live: ${c.url.origin}/article/${slug}#comments`,
    ]);
  }
  const r = await one(c.env, `${COMMENT_SELECT} WHERE c.id = ?1`, row.id);
  return json({ comment: commentRow(r, u) });
}

async function deleteComment(c) {
  const u = need(c);
  const r = await one(c.env, "SELECT user_id FROM comments WHERE id = ?1", Number(c.params[0]));
  if (!r) throw new HttpError(404, "That comment is already gone.");
  if (r.user_id !== u.id && u.role !== "admin") throw new HttpError(403, "That isn't your comment.");
  await run(c.env, "DELETE FROM comments WHERE id = ?1", Number(c.params[0]));
  return json({ ok: true });
}

/* ───────── messages (each account has one conversation with Silver) ───────── */
const messageRow = (m) => ({ id: m.id, body: m.body, created: m.created_at, fromAdmin: !!m.from_admin, read: !!m.read_at });

async function myMessages(c) {
  const u = need(c);
  if (u.role === "admin") return json({ admin: true, messages: [] });
  const rows = await all(c.env, "SELECT * FROM messages WHERE user_id = ?1 ORDER BY created_at", u.id);
  await run(c.env, "UPDATE messages SET read_at = ?1 WHERE user_id = ?2 AND from_admin = 1 AND read_at IS NULL", Date.now(), u.id);
  return json({ messages: rows.map(messageRow) });
}

async function sendMessage(c) {
  const u = need(c);
  if (u.role === "admin") throw new HttpError(400, "Reply to people from /admin.");
  const body = text(c.body.body, "Your message", LIMITS.message);
  await limit(c, "message", 20, 86400, "u" + u.id);
  const row = await one(c.env, "INSERT INTO messages (user_id, from_admin, body, created_at) VALUES (?1, 0, ?2, ?3) RETURNING *", u.id, body, Date.now());
  notify(c, `Message from ${u.username}`, [`${u.username} sent you a message:`, "", excerpt(body, 1500)]);
  return json({ message: messageRow(row) });
}

/* ───────── admin ───────── */
async function adminOverview(c) {
  need(c, true);
  const arts = await articles(c);
  const comments = await all(c.env, `${COMMENT_SELECT} WHERE c.status = 'pending' ORDER BY c.created_at LIMIT 200`);
  const pictures = await all(c.env,
    "SELECT p.user_id, p.updated_at, u.username FROM pictures p JOIN users u ON u.id = p.user_id WHERE p.pending IS NOT NULL ORDER BY p.updated_at LIMIT 100");
  const threads = await all(c.env,
    `SELECT u.id, u.username, u.avatar, u.role, pic.updated_at AS picture_at, MAX(m.created_at) AS last,
       SUM(CASE WHEN m.from_admin = 0 AND m.read_at IS NULL THEN 1 ELSE 0 END) AS unread,
       (SELECT body FROM messages WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) AS preview
     FROM messages m JOIN users u ON u.id = m.user_id LEFT JOIN pictures pic ON pic.user_id = u.id
     GROUP BY u.id ORDER BY last DESC LIMIT 200`);
  const emailRow = await one(c.env, "SELECT value FROM meta WHERE key = 'email_status'");
  let email = null;
  try { email = emailRow ? JSON.parse(emailRow.value) : null; } catch { }
  return json({
    email: { setUp: !!(c.env.EMAIL && c.env.ALERT_TO), last: email },
    comments: comments.map((r) => ({ ...commentRow(r, null), article: { slug: r.slug, title: (arts.get(r.slug) || {}).title || r.slug } })),
    pictures: pictures.map((p) => ({ user: { id: p.user_id, username: p.username }, url: `/api/picture/${p.user_id}?pending=1&v=${p.updated_at}` })),
    threads: threads.map((t) => ({ user: publicUser(t), last: t.last, unread: t.unread, preview: excerpt(t.preview || "", 140) })),
  });
}

async function adminTestEmail(c) {
  need(c, true);
  await limit(c, "test-email", 5, 3600, "admin");
  try {
    const how = await sendAlert(c.env, c.url.origin, "Test alert from According To Knowledge", ["This is a test. If you can read it, email alerts work."]);
    const status = { ok: true, at: Date.now(), how, subject: "Test alert" };
    await recordEmail(c.env, status);
    return json({ ok: true, status });
  } catch (e) {
    const status = { ok: false, at: Date.now(), error: String(e.message || e), subject: "Test alert" };
    await recordEmail(c.env, status);
    return json({ ok: false, status });
  }
}

async function adminComment(c) {
  need(c, true);
  const id = Number(c.params[0]);
  const action = c.body.action;
  if (action === "approve") await run(c.env, "UPDATE comments SET status = 'approved' WHERE id = ?1", id);
  else if (action === "reject") await run(c.env, "DELETE FROM comments WHERE id = ?1", id);
  else throw new HttpError(400, "Approve or reject.");
  return json({ ok: true });
}

async function adminPicture(c) {
  need(c, true);
  const id = Number(c.params[0]);
  const action = c.body.action;
  if (action === "approve") {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE pictures SET approved = pending, pending = NULL, updated_at = ?1 WHERE user_id = ?2 AND pending IS NOT NULL").bind(Date.now(), id),
      c.env.DB.prepare("UPDATE users SET avatar = 'custom' WHERE id = ?1").bind(id),
    ]);
  } else if (action === "reject") await run(c.env, "UPDATE pictures SET pending = NULL WHERE user_id = ?1", id);
  else throw new HttpError(400, "Approve or reject.");
  return json({ ok: true });
}

async function adminThread(c) {
  need(c, true);
  const id = Number(c.params[0]);
  const u = await currentUserById(c.env, id);
  if (!u) throw new HttpError(404, "No such account.");
  const rows = await all(c.env, "SELECT * FROM messages WHERE user_id = ?1 ORDER BY created_at", id);
  await run(c.env, "UPDATE messages SET read_at = ?1 WHERE user_id = ?2 AND from_admin = 0 AND read_at IS NULL", Date.now(), id);
  return json({ user: publicUser(u), messages: rows.map(messageRow) });
}

async function adminReply(c) {
  need(c, true);
  const id = Number(c.params[0]);
  if (!(await one(c.env, "SELECT id FROM users WHERE id = ?1", id))) throw new HttpError(404, "No such account.");
  const body = text(c.body.body, "Your reply", LIMITS.message);
  const row = await one(c.env, "INSERT INTO messages (user_id, from_admin, body, created_at) VALUES (?1, 1, ?2, ?3) RETURNING *", id, body, Date.now());
  return json({ message: messageRow(row) });
}

async function adminWords(c) {
  need(c, true);
  return json({ words: await flaggedList(c.env) });
}
async function adminSaveWords(c) {
  need(c, true);
  const list = (Array.isArray(c.body.words) ? c.body.words : String(c.body.words || "").split("\n"))
    .map((w) => String(w).trim()).filter(Boolean).slice(0, 1000).map((w) => w.slice(0, 80));
  const unique = [...new Map(list.map((w) => [fold(w), w])).values()];
  await run(c.env, "INSERT INTO meta (key, value) VALUES ('flagged_words', ?1) ON CONFLICT (key) DO UPDATE SET value = ?1", JSON.stringify(unique));
  return json({ words: unique });
}

async function adminUsers(c) {
  need(c, true);
  const q = (c.url.searchParams.get("q") || "").trim().replace(/[%_\\]/g, (m) => "\\" + m);
  const rows = await all(c.env,
    `SELECT u.id, u.username, u.avatar, u.role, u.banned, u.created_at, p.updated_at AS picture_at,
       (SELECT COUNT(*) FROM comments WHERE user_id = u.id) AS comments
     FROM users u LEFT JOIN pictures p ON p.user_id = u.id
     WHERE u.username LIKE ?1 ESCAPE '\\' ORDER BY u.created_at DESC LIMIT 100`, `%${q}%`);
  return json({ users: rows.map((r) => ({ ...publicUser(r), banned: !!r.banned, created: r.created_at, comments: r.comments })) });
}

async function adminUser(c) {
  const me = need(c, true);
  const id = Number(c.params[0]);
  const u = await one(c.env, "SELECT id, role FROM users WHERE id = ?1", id);
  if (!u) throw new HttpError(404, "No such account.");
  if (u.id === me.id || u.role === "admin") throw new HttpError(400, "Not on the admin account.");
  switch (c.body.action) {
    case "recovery": return json({ recoveryCode: await setRecovery(c.env, id) });
    case "ban":
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE users SET banned = 1 WHERE id = ?1").bind(id),
        c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(id),
        c.env.DB.prepare("DELETE FROM comments WHERE user_id = ?1 AND status = 'pending'").bind(id),
      ]);
      return json({ ok: true });
    case "unban": await run(c.env, "UPDATE users SET banned = 0 WHERE id = ?1", id); return json({ ok: true });
    case "picture":   // take down an approved picture
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE pictures SET approved = NULL WHERE user_id = ?1").bind(id),
        c.env.DB.prepare("UPDATE users SET avatar = 'default' WHERE id = ?1 AND avatar = 'custom'").bind(id),
      ]);
      return json({ ok: true });
    case "delete": await removeUser(c.env, id); return json({ ok: true });
  }
  throw new HttpError(400, "Unknown action.");
}
