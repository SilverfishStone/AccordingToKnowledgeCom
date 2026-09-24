/* The articles site's server (a Cloudflare Worker). Everything under /api/ comes here; every
   other address is a file from dist/ (see wrangler.jsonc).

   It keeps accounts, comments, messages, picture requests and community writing in a D1
   database (binding DB), emails Silver about new comments, messages and requests (binding
   EMAIL), and publishes Silver's own articles to the GitHub repo (secret GITHUB_TOKEN), the
   same way the editor on silverfishstone.com does.

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
  // writing
  ["GET", /^\/api\/writing$/, myWriting],
  ["POST", /^\/api\/writing$/, newWriting],
  ["POST", /^\/api\/writing\/import$/, importOfficial],
  ["GET", /^\/api\/writing\/(\d+)$/, getWriting],
  ["POST", /^\/api\/writing\/(\d+)$/, saveWriting],
  ["POST", /^\/api\/writing\/(\d+)\/(submit|withdraw|delete|unpublish|publish|keep|reload)$/, writingAction],
  ["POST", /^\/api\/writer\/request$/, requestToWrite],
  ["GET", /^\/api\/community$/, communityList],
  ["GET", /^\/api\/community\/([a-z0-9-]+)$/, communityArticle],
  ["GET", /^\/api\/people\/([A-Za-z0-9_.-]+)$/, person],
  ["GET", /^\/api\/admin\/submissions\/(\d+)$/, adminSubmission],
  ["POST", /^\/api\/admin\/submissions\/(\d+)$/, adminReview],
  ["POST", /^\/api\/admin\/writer-requests\/(\d+)$/, adminWriterRequest],
  ["POST", /^\/api\/community\/([a-z0-9-]+)\/delete$/, deleteCommunityArticle],
  ["POST", /^\/api\/admin\/articles\/([a-z0-9-]+)\/delete$/, deleteOfficialArticle],
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
  [
    // drafts: Silver's articles for the site ("official") and community writers' ("community")
    `CREATE TABLE writings (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, slug TEXT,
      title TEXT NOT NULL DEFAULT '', subtitle TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '',
      categories TEXT NOT NULL DEFAULT '[]', html TEXT NOT NULL DEFAULT '', delta TEXT NOT NULL DEFAULT '{"ops":[]}',
      words INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, source TEXT,
      state TEXT NOT NULL DEFAULT 'draft', note TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, submitted_at INTEGER)`,
    `CREATE INDEX writings_user ON writings (user_id, updated_at)`,
    `CREATE INDEX writings_state ON writings (state, submitted_at)`,
    // what readers see of community articles (a copy made when Silver approves)
    `CREATE TABLE community (
      slug TEXT PRIMARY KEY, writing_id INTEGER NOT NULL UNIQUE, user_id INTEGER NOT NULL,
      title TEXT NOT NULL, subtitle TEXT NOT NULL, summary TEXT NOT NULL, categories TEXT NOT NULL,
      html TEXT NOT NULL, words INTEGER NOT NULL, published_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE INDEX community_user ON community (user_id)`,
    `CREATE INDEX community_published ON community (published_at)`,
    `CREATE TABLE writer_requests (user_id INTEGER PRIMARY KEY, note TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  ],
  [
    // for Silver's articles: the published version ("updated" time) a draft started from, so an
    // edit made meanwhile on silverfishstone.com/write isn't quietly overwritten
    `ALTER TABLE writings ADD COLUMN base TEXT`,
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
// what a comment can be attached to: one of Silver's articles ("<slug>") or a community one ("c:<slug>")
async function commentable(c, key) {
  if (key.startsWith("c:")) {
    const row = await one(c.env, "SELECT slug, title FROM community WHERE slug = ?1", key.slice(2));
    return row && { title: row.title, path: `/community/${row.slug}` };
  }
  const a = (await articles(c)).get(key);
  return a && { title: a.title, path: `/article/${a.slug}` };
}
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
  id: u.id, username: u.username, avatar: u.avatar, role: u.role === "admin" || u.role === "writer" ? u.role : "user",
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
  if (c.user.role === "user") out.writerRequest = !!(await one(c.env, "SELECT 1 AS x FROM writer_requests WHERE user_id = ?1", c.user.id));
  if (c.user.role === "admin") out.pending.writing = (await one(c.env,
    "SELECT (SELECT COUNT(*) FROM writings WHERE state = 'submitted') + (SELECT COUNT(*) FROM writer_requests) AS n")).n;
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
    env.DB.prepare("DELETE FROM writings WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM community WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM writer_requests WHERE user_id = ?1").bind(id),
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
  const art = await commentable(c, slug);
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
      "", hit ? "It won't show until you approve it." : `It's live: ${c.url.origin}${art.path}#comments`,
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
    comments: await Promise.all(comments.map(async (r) => {
      const where = r.slug.startsWith("c:") ? await commentable(c, r.slug) : null;
      return { ...commentRow(r, null), article: where ? { path: where.path, title: where.title } : { path: `/article/${r.slug}`, title: (arts.get(r.slug) || {}).title || r.slug } };
    })),
    writerRequests: (await all(c.env,
      `SELECT r.note, r.created_at, u.id, u.username, u.avatar, u.role, p.updated_at AS picture_at
       FROM writer_requests r JOIN users u ON u.id = r.user_id LEFT JOIN pictures p ON p.user_id = u.id ORDER BY r.created_at`))
      .map((r) => ({ user: publicUser(r), note: r.note, created: r.created_at })),
    submissions: (await all(c.env,
      `SELECT w.id, w.title, w.submitted_at, u.id AS uid, u.username, u.avatar, u.role, p.updated_at AS picture_at, cm.slug AS live
       FROM writings w JOIN users u ON u.id = w.user_id LEFT JOIN pictures p ON p.user_id = u.id LEFT JOIN community cm ON cm.writing_id = w.id
       WHERE w.state = 'submitted' ORDER BY w.submitted_at`))
      .map((r) => ({ id: r.id, title: r.title || "Untitled", submitted: r.submitted_at, update: !!r.live,
        user: publicUser({ id: r.uid, username: r.username, avatar: r.avatar, role: r.role, picture_at: r.picture_at }) })),
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
    case "writer":
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE users SET role = 'writer' WHERE id = ?1").bind(id),
        c.env.DB.prepare("DELETE FROM writer_requests WHERE user_id = ?1").bind(id),
      ]);
      return json({ ok: true });
    case "unwriter": await run(c.env, "UPDATE users SET role = 'user' WHERE id = ?1 AND role = 'writer'", id); return json({ ok: true });
  }
  throw new HttpError(400, "Unknown action.");
}

/* ═════════════════ writing ═════════════════
   Two kinds of writing share one editor and one table:
   - "official": Silver's articles for the site. Drafts live here; Publish writes
     articles/<slug>.json and articles/index.json to the GitHub repo (exactly what the editor on
     silverfishstone.com writes), and both sites rebuild from that.
   - "community": approved writers' articles. Submitting sends a draft to Silver; approving
     copies it into `community`, which is what readers see. Edits to a published article wait
     for approval the same way, while the published copy stays up. */
const W = { title: 150, subtitle: 200, summary: 400, category: 40, categories: 5, html: 400000, delta: 900000, perUser: 100 };
const slugify = (t) => String(t).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
const parseJSON = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
const canWrite = (u) => !!u && (u.role === "writer" || u.role === "admin");
function needWriter(c) {
  const u = need(c);
  if (!canWrite(u)) throw new HttpError(403, "Only approved writers can do that.");
  return u;
}
async function ownWriting(c, id) {
  const w = await one(c.env, "SELECT * FROM writings WHERE id = ?1", Number(id));
  if (!w || (w.user_id !== c.user.id && c.user.role !== "admin")) throw new HttpError(404, "That piece doesn't exist.");
  return w;
}
const adminMessage = (env, userId, body) =>
  run(env, "INSERT INTO messages (user_id, from_admin, body, created_at) VALUES (?1, 1, ?2, ?3)", userId, body, Date.now());

function writingOut(w, live) {
  return {
    id: w.id, kind: w.kind, slug: w.slug, title: w.title, subtitle: w.subtitle, summary: w.summary,
    categories: parseJSON(w.categories, []), html: w.html, delta: parseJSON(w.delta, { ops: [] }), words: w.words,
    pinned: !!w.pinned, state: w.state, note: w.note, created: w.created_at, updated: w.updated_at, submitted: w.submitted_at, base: w.base || null,
    published: w.kind === "official" ? !!w.slug : !!live,
    live: live ? { slug: live.slug, published: live.published_at, updated: live.updated_at } : null,
  };
}

// what the editor sends when saving; drafts can be half-finished, so only lengths are checked
function writingFields(b) {
  const str = (v, max, name) => {
    const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
    if (s.length > max) throw new HttpError(400, `${name} is too long (${s.length} of ${max} characters).`);
    return s;
  };
  const cats = [];   // no duplicates (ignoring capitals); the first spelling wins
  for (const x of Array.isArray(b.categories) ? b.categories : []) {
    const name = String(x).replace(/\s+/g, " ").trim().slice(0, W.category);
    if (name && !cats.some((c) => c.toLowerCase() === name.toLowerCase())) cats.push(name);
  }
  cats.splice(W.categories);
  const html = typeof b.html === "string" ? b.html : "";
  if (html.length > W.html) throw new HttpError(400, "That's too long to save here (the limit is roughly 50,000 words).");
  const delta = b.delta && typeof b.delta === "object" ? JSON.stringify(b.delta) : '{"ops":[]}';
  if (delta.length > W.delta) throw new HttpError(400, "That's too long to save here (the limit is roughly 50,000 words).");
  return {
    title: str(b.title, W.title, "The title"), subtitle: str(b.subtitle, W.subtitle, "The subtitle"),
    summary: str(b.summary, W.summary, "The summary"), categories: JSON.stringify(cats),
    html, delta, words: Math.max(0, Math.min(1e6, Math.floor(Number(b.words) || 0))), pinned: b.pinned ? 1 : 0,
  };
}

async function myWriting(c) {
  const u = needWriter(c);
  const rows = await all(c.env,
    `SELECT w.id, w.kind, w.slug, w.title, w.state, w.note, w.updated_at, w.submitted_at, cm.slug AS live
     FROM writings w LEFT JOIN community cm ON cm.writing_id = w.id WHERE w.user_id = ?1 ORDER BY w.updated_at DESC`, u.id);
  return json({ writings: rows.map((r) => ({
    id: r.id, kind: r.kind, title: r.title, state: r.state, note: r.note, updated: r.updated_at,
    published: r.kind === "official" ? !!r.slug : !!r.live, slug: r.kind === "official" ? r.slug : r.live,
  })) });
}

async function newWriting(c) {
  const u = needWriter(c);
  const n = await one(c.env, "SELECT COUNT(*) AS n FROM writings WHERE user_id = ?1", u.id);
  if (n.n >= W.perUser) throw new HttpError(400, `You have ${n.n} pieces already. Delete some old drafts first.`);
  await limit(c, "new-writing", 30, 3600, "u" + u.id);
  const now = Date.now();
  const row = await one(c.env, "INSERT INTO writings (user_id, kind, created_at, updated_at) VALUES (?1, ?2, ?3, ?3) RETURNING id",
    u.id, u.role === "admin" ? "official" : "community", now);
  return json({ id: row.id });
}

// open one of the site's published articles for editing here (Silver only)
async function importOfficial(c) {
  const u = need(c, true);
  const slug = String(c.body.slug || "");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new HttpError(400, "That isn't an article address.");
  const have = await one(c.env, "SELECT id FROM writings WHERE kind = 'official' AND slug = ?1 ORDER BY updated_at DESC LIMIT 1", slug);
  if (have) return json({ id: have.id });
  // the repo is the freshest copy; the site's own files are a moment behind after a publish
  let doc = null, pinned = false;
  if (c.env.GITHUB_TOKEN && c.env.GITHUB_REPO) {
    const f = await ghGet(c.env, `articles/${slug}.json`);
    doc = f && parseJSON(f.text, null);
    const idx = await ghGet(c.env, "articles/index.json");
    pinned = !!(parseJSON(idx ? idx.text : "[]", []).find((a) => a.slug === slug) || {}).pinned;
  } else {
    const res = await c.env.ASSETS.fetch(new Request(new URL(`/articles/${slug}.json`, c.url)));
    doc = res.ok ? await res.json() : null;
    pinned = !!((await articles(c)).get(slug) || {}).pinned;
  }
  if (!doc) throw new HttpError(404, "That article's file is missing from the site.");
  const now = Date.now();
  const row = await one(c.env,
    `INSERT INTO writings (user_id, kind, slug, title, subtitle, summary, categories, html, delta, words, pinned, source, created_at, updated_at, base)
     VALUES (?1, 'official', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12, ?13) RETURNING id`,
    u.id, slug, doc.title || "", doc.subtitle || "", doc.summary || "", JSON.stringify(Array.isArray(doc.categories) ? doc.categories : []),
    String(doc.html || ""), JSON.stringify(doc.delta && doc.delta.ops ? doc.delta : { ops: [] }), Number(doc.words) || 0, pinned ? 1 : 0,
    doc.source || null, now, doc.updated || doc.published || null);
  return json({ id: row.id });
}

async function getWriting(c) {
  need(c);
  const w = await ownWriting(c, c.params[0]);
  const live = w.kind === "community" ? await one(c.env, "SELECT slug, published_at, updated_at FROM community WHERE writing_id = ?1", w.id) : null;
  const out = writingOut(w, live);
  if (w.kind === "official" && w.slug) out.site = await siteVersion(c.env, w.slug).catch(() => null);
  return json({ writing: out });
}

async function saveWriting(c) {
  const u = need(c);
  const w = await ownWriting(c, c.params[0]);
  if (w.state === "submitted" && u.role !== "admin") throw new HttpError(409, "It's waiting for review. Withdraw it to make changes.");
  await limit(c, "save", 240, 3600, "u" + u.id);
  const f = writingFields(c.body);
  const now = Date.now();
  await run(c.env,
    `UPDATE writings SET title = ?1, subtitle = ?2, summary = ?3, categories = ?4, html = ?5, delta = ?6, words = ?7, pinned = ?8, updated_at = ?9
     WHERE id = ?10`, f.title, f.subtitle, f.summary, f.categories, f.html, f.delta, f.words, w.kind === "official" ? f.pinned : 0, now, w.id);
  return json({ updated: now });
}

async function writingAction(c) {
  const u = need(c);
  const w = await ownWriting(c, c.params[0]);
  const action = c.params[1];
  const mine = w.user_id === u.id;
  switch (action) {
    case "submit": {
      if (w.kind !== "community" || !mine) throw new HttpError(400, "Only community articles are sent for review.");
      if (!canWrite(u)) throw new HttpError(403, "Only approved writers can do that.");
      if (!w.title.trim()) throw new HttpError(400, "Give it a title first.");
      if (!w.words) throw new HttpError(400, "There's nothing written yet.");
      await limit(c, "submit", 10, 86400, "u" + u.id);
      await run(c.env, "UPDATE writings SET state = 'submitted', submitted_at = ?1, note = NULL WHERE id = ?2", Date.now(), w.id);
      const live = await one(c.env, "SELECT slug FROM community WHERE writing_id = ?1", w.id);
      notify(c, `${live ? "Changes" : "Article"} to review: “${w.title}”`, [
        `${u.username} sent ${live ? "changes to their published article" : "an article"} for review: “${w.title}” (${w.words} words).`]);
      return json({ ok: true });
    }
    case "withdraw":
      await run(c.env, "UPDATE writings SET state = 'draft' WHERE id = ?1", w.id);
      return json({ ok: true });
    case "delete": {   // an official article stays on the site; only this draft goes
      const live = await one(c.env, "SELECT slug, title FROM community WHERE writing_id = ?1", w.id);
      await removeCommunity(c, w, live);
      return json({ ok: true });
    }
    case "unpublish":
      if (w.kind === "community") {
        await run(c.env, "DELETE FROM community WHERE writing_id = ?1", w.id);
        return json({ ok: true });
      }
      need(c, true);
      if (!w.slug) throw new HttpError(400, "It isn't on the site.");
      await unpublishOfficial(c, w);
      return json({ ok: true });
    case "publish":
      need(c, true);
      if (w.kind !== "official") throw new HttpError(400, "Community articles are published by approving them.");
      return json(await publishOfficial(c, w));
    case "keep": {   // "keep my draft": stop asking about this version of the site's copy
      need(c, true);
      const v = String(c.body.version || "");
      if (!v || isNaN(Date.parse(v))) throw new HttpError(400, "That isn't a version.");
      await run(c.env, "UPDATE writings SET base = ?1 WHERE id = ?2", v, w.id);
      return json({ ok: true });
    }
    case "reload": {   // "load the site's version": this draft becomes what's published; what was here is kept as a copy
      need(c, true);
      if (w.kind !== "official" || !w.slug) throw new HttpError(400, "It isn't on the site.");
      const doc = await publishedDoc(c, w.slug);
      if (!doc) throw new HttpError(404, "That article's file is missing from the site.");
      const now = Date.now();
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO writings (user_id, kind, title, subtitle, summary, categories, html, delta, words, created_at, updated_at)
          SELECT user_id, 'official', title || ' (my earlier draft)', subtitle, summary, categories, html, delta, words, ?1, ?1 FROM writings WHERE id = ?2`).bind(now, w.id),
        c.env.DB.prepare(`UPDATE writings SET title = ?1, subtitle = ?2, summary = ?3, categories = ?4, html = ?5, delta = ?6, words = ?7, source = ?8, base = ?9, updated_at = ?10 WHERE id = ?11`)
          .bind(doc.title || "", doc.subtitle || "", doc.summary || "", JSON.stringify(Array.isArray(doc.categories) ? doc.categories : []),
            String(doc.html || ""), JSON.stringify(doc.delta && doc.delta.ops ? doc.delta : { ops: [] }), Number(doc.words) || 0,
            doc.source || null, doc.updated || doc.published || null, now, w.id),
      ]);
      return json({ ok: true });
    }
  }
  throw new HttpError(400, "Unknown action.");
}

async function requestToWrite(c) {
  const u = need(c);
  if (canWrite(u)) throw new HttpError(400, "You can already write.");
  const note = text(c.body.note, "Your note", 1000, 10);
  await limit(c, "writer-request", 3, 86400, "u" + u.id);
  await run(c.env, "INSERT INTO writer_requests (user_id, note, created_at) VALUES (?1, ?2, ?3) ON CONFLICT (user_id) DO UPDATE SET note = ?2, created_at = ?3",
    u.id, note, Date.now());
  notify(c, `${u.username} asked to write`, [`${u.username} asked to write for the site:`, "", excerpt(note, 1000)]);
  return json({ ok: true });
}

// a community piece and everything hanging off it (its published copy and that copy's comments)
async function removeCommunity(c, w, live) {
  await c.env.DB.batch([
    ...(live ? [c.env.DB.prepare("DELETE FROM comments WHERE slug = ?1").bind(`c:${live.slug}`)] : []),
    c.env.DB.prepare("DELETE FROM community WHERE writing_id = ?1").bind(w.id),
    c.env.DB.prepare("DELETE FROM writings WHERE id = ?1").bind(w.id),
  ]);
  if (w.user_id !== c.user.id && w.kind === "community") {
    await adminMessage(c.env, w.user_id, `I've deleted your article “${(live && live.title) || w.title || "Untitled"}” from the site.`);
  }
}

// from a published community article's page: its writer, or Silver, can delete it
async function deleteCommunityArticle(c) {
  const u = need(c);
  const live = await one(c.env, "SELECT slug, title, writing_id, user_id FROM community WHERE slug = ?1", c.params[0]);
  if (!live) throw new HttpError(404, "That article is already gone.");
  if (live.user_id !== u.id && u.role !== "admin") throw new HttpError(403, "Only its writer can delete it.");
  const w = (await one(c.env, "SELECT id, user_id, kind, title FROM writings WHERE id = ?1", live.writing_id)) || { id: live.writing_id, user_id: live.user_id, kind: "community", title: live.title };
  await removeCommunity(c, w, live);
  return json({ ok: true });
}

// Silver deleting one of their own articles for good: off the repo (so both sites), drafts here, comments
async function deleteOfficialArticle(c) {
  need(c, true);
  const slug = c.params[0];
  ghReady(c.env);
  const title = ((await articles(c)).get(slug) || {}).title || slug;
  await removeFromRepo(c.env, slug, title);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM writings WHERE kind = 'official' AND slug = ?1").bind(slug),
    c.env.DB.prepare("DELETE FROM comments WHERE slug = ?1").bind(slug),
  ]);
  articleCache = null;
  return json({ ok: true });
}

/* ───────── the community pages ───────── */
const COMMUNITY_SELECT = `SELECT cm.slug, cm.title, cm.subtitle, cm.summary, cm.categories, cm.words, cm.published_at, cm.updated_at,
  u.id, u.username, u.avatar, u.role, p.updated_at AS picture_at
  FROM community cm JOIN users u ON u.id = cm.user_id LEFT JOIN pictures p ON p.user_id = u.id`;
const communityOut = (r) => ({
  slug: r.slug, title: r.title, subtitle: r.subtitle, summary: r.summary, categories: parseJSON(r.categories, []),
  words: r.words, published: r.published_at, updated: r.updated_at, author: publicUser(r),
});

async function communityList(c) {
  const n = Math.min(200, Math.max(1, Number(c.url.searchParams.get("limit")) || 100));
  const rows = await all(c.env, `${COMMUNITY_SELECT} WHERE u.banned = 0 ORDER BY cm.published_at DESC LIMIT ?1`, n);
  return json({ articles: rows.map(communityOut) });
}

async function communityArticle(c) {
  const r = await one(c.env, `${COMMUNITY_SELECT.replace("SELECT cm.slug,", "SELECT cm.html, cm.slug,")} WHERE cm.slug = ?1 AND u.banned = 0`, c.params[0]);
  if (!r) throw new HttpError(404, "That article doesn't exist.");
  return json({ article: { ...communityOut(r), html: r.html } });
}

async function person(c) {
  const u = await one(c.env,
    "SELECT u.id, u.username, u.avatar, u.role, u.banned, u.created_at, p.updated_at AS picture_at FROM users u LEFT JOIN pictures p ON p.user_id = u.id WHERE u.username = ?1",
    c.params[0]);
  if (!u || u.banned) throw new HttpError(404, "There's no one here by that name.");
  const rows = await all(c.env, `${COMMUNITY_SELECT} WHERE cm.user_id = ?1 ORDER BY cm.published_at DESC`, u.id);
  const comments = await one(c.env, "SELECT COUNT(*) AS n FROM comments WHERE user_id = ?1 AND status = 'approved'", u.id);
  return json({ person: { ...publicUser(u), joined: u.created_at, comments: comments.n }, articles: rows.map(communityOut) });
}

/* ───────── reviewing (Silver) ───────── */
async function adminSubmission(c) {
  need(c, true);
  const w = await one(c.env, "SELECT * FROM writings WHERE id = ?1", Number(c.params[0]));
  if (!w) throw new HttpError(404, "That piece doesn't exist.");
  const author = await currentUserById(c.env, w.user_id);
  const live = await one(c.env, "SELECT * FROM community WHERE writing_id = ?1", w.id);
  return json({
    writing: writingOut(w, live), author: publicUser(author),
    liveCopy: live ? { title: live.title, subtitle: live.subtitle, summary: live.summary, html: live.html } : null,
  });
}

async function freeCommunitySlug(env, title) {
  const base = slugify(title) || "article";
  for (let n = 1; n < 200; n++) {
    const cand = n === 1 ? base : `${base}-${n}`;
    if (!(await one(env, "SELECT 1 AS x FROM community WHERE slug = ?1", cand))) return cand;
  }
  throw new HttpError(400, "Couldn't find a free address for that title.");
}

async function adminReview(c) {
  need(c, true);
  const w = await one(c.env, "SELECT * FROM writings WHERE id = ?1", Number(c.params[0]));
  if (!w || w.kind !== "community") throw new HttpError(404, "That piece doesn't exist.");
  if (w.state !== "submitted") throw new HttpError(409, "That isn't waiting for review any more (it may have been withdrawn).");
  const now = Date.now();
  if (c.body.action === "approve") {
    const live = await one(c.env, "SELECT slug FROM community WHERE writing_id = ?1", w.id);
    const slug = live ? live.slug : await freeCommunitySlug(c.env, w.title);
    await c.env.DB.batch([
      live
        ? c.env.DB.prepare(`UPDATE community SET title = ?1, subtitle = ?2, summary = ?3, categories = ?4, html = ?5, words = ?6, updated_at = ?7 WHERE writing_id = ?8`)
          .bind(w.title, w.subtitle, w.summary, w.categories, w.html, w.words, now, w.id)
        : c.env.DB.prepare(`INSERT INTO community (slug, writing_id, user_id, title, subtitle, summary, categories, html, words, published_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`)
          .bind(slug, w.id, w.user_id, w.title, w.subtitle, w.summary, w.categories, w.html, w.words, now),
      c.env.DB.prepare("UPDATE writings SET state = 'draft', note = NULL, slug = ?1 WHERE id = ?2").bind(slug, w.id),
    ]);
    await adminMessage(c.env, w.user_id, live
      ? `I've approved your changes to “${w.title}”. They're live now: ${c.url.origin}/community/${slug}`
      : `“${w.title}” is published! Here it is: ${c.url.origin}/community/${slug}`);
    return json({ ok: true, slug });
  }
  if (c.body.action === "return") {
    const note = typeof c.body.note === "string" ? c.body.note.trim().slice(0, 2000) : "";
    await run(c.env, "UPDATE writings SET state = 'draft', note = ?1 WHERE id = ?2", note || null, w.id);
    await adminMessage(c.env, w.user_id, `I've sent “${w.title || "your article"}” back to you${note ? ` with a note:\n\n${note}` : "."}\n\nYou can change it and send it again from ${c.url.origin}/write`);
    return json({ ok: true });
  }
  throw new HttpError(400, "Approve or send back.");
}

async function adminWriterRequest(c) {
  need(c, true);
  const id = Number(c.params[0]);
  const r = await one(c.env, "SELECT user_id FROM writer_requests WHERE user_id = ?1", id);
  if (!r) throw new HttpError(404, "That request is gone.");
  if (c.body.action === "approve") {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE users SET role = 'writer' WHERE id = ?1 AND role = 'user'").bind(id),
      c.env.DB.prepare("DELETE FROM writer_requests WHERE user_id = ?1").bind(id),
    ]);
    await adminMessage(c.env, id, `You can write for the site now! Start here: ${c.url.origin}/write\n\nI read every article before it goes up.`);
    return json({ ok: true });
  }
  if (c.body.action === "reject") {
    const note = typeof c.body.note === "string" ? c.body.note.trim().slice(0, 1000) : "";
    await run(c.env, "DELETE FROM writer_requests WHERE user_id = ?1", id);
    await adminMessage(c.env, id, `Thanks for offering to write for the site. I'm not adding you as a writer right now${note ? `:\n\n${note}` : "."}`);
    return json({ ok: true });
  }
  throw new HttpError(400, "Approve or turn down.");
}

/* ───────── publishing Silver's articles to the repo ───────── */
function ghReady(env) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) throw new HttpError(503, "Publishing to the site isn't set up yet: the Worker needs a GITHUB_TOKEN secret.");
}
function ghExplain(status) {
  if (status === 401) return "GitHub rejected the site's token (expired or revoked). Make a new one and update the GITHUB_TOKEN secret.";
  if (status === 403) return "GitHub refused. The token needs “Contents: Read and write” on this repo (or GitHub's rate limit was hit).";
  if (status === 404) return "GitHub couldn't find that. Check GITHUB_REPO and that the token can see the repo.";
  if (status === 409 || status === 422) return "GitHub reported a conflict (something changed at the same time). Try again.";
  return `GitHub returned an error (${status}).`;
}
async function gh(env, path, { method = "GET", body, raw = false } = {}) {
  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, {
      method,
      headers: {
        Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "User-Agent": "accordingtoknowledge.com",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new HttpError(502, "Couldn't reach GitHub. Try again in a moment."); }
  if (!res.ok) { const e = new HttpError(res.status === 404 ? 404 : 502, ghExplain(res.status)); e.gh = res.status; throw e; }
  if (raw) return res.text();
  return res.status === 204 ? null : res.json();
}
const ghPath = (p) => "/contents/" + p.split("/").map(encodeURIComponent).join("/");
const ghBranch = (env) => env.GITHUB_BRANCH || "main";
function toB64(str) {
  const bytes = enc.encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const fromB64 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, "")), (ch) => ch.charCodeAt(0)));
async function ghGet(env, path) {
  const where = `${ghPath(path)}?ref=${encodeURIComponent(ghBranch(env))}`;
  try {
    const j = await gh(env, where);
    if (j.encoding === "base64" && j.content) return { sha: j.sha, text: fromB64(j.content) };
    return { sha: j.sha, text: await gh(env, where, { raw: true }) };   // big files come without inline content
  } catch (e) { if (e.gh === 404) return null; throw e; }
}
const ghPut = (env, path, textBody, message, sha) =>
  gh(env, ghPath(path), { method: "PUT", body: { message, content: toB64(textBody), branch: ghBranch(env), ...(sha ? { sha } : {}) } });
const ghDelete = (env, path, sha, message) => gh(env, ghPath(path), { method: "DELETE", body: { message, sha, branch: ghBranch(env) } });
// read-modify-write of a JSON list, retrying if something else committed in between
async function ghUpdateList(env, path, mutate, message) {
  for (let attempt = 0; ; attempt++) {
    const f = await ghGet(env, path);
    const list = f ? parseJSON(f.text, null) : [];
    if (!Array.isArray(list)) throw new HttpError(500, `${path} in the repo isn't valid JSON, so nothing was changed. Fix it in the repo first.`);
    const next = mutate(list).sort((a, b) => new Date(b.published) - new Date(a.published));
    try { await ghPut(env, path, JSON.stringify(next, null, 2) + "\n", message, f && f.sha); return next; }
    catch (e) { if ((e.gh === 409 || e.gh === 422) && attempt < 2) continue; throw e; }
  }
}

// the same files, in the same shape, as the editor on silverfishstone.com writes
async function publishOfficial(c, w) {
  const env = c.env;
  ghReady(env);
  const title = w.title.trim();
  if (!title) throw new HttpError(400, "Give it a title first.");
  if (!w.words) throw new HttpError(400, "There's nothing written yet.");
  let slug = w.slug;
  if (!slug) {
    const idx = await ghGet(env, "articles/index.json");
    const list = parseJSON(idx ? idx.text : "[]", []);
    const base = slugify(title) || "article";
    for (let n = 1; n < 50 && !slug; n++) {
      const cand = n === 1 ? base : `${base}-${n}`;
      if (cand === "index" || cand === "series" || list.some((a) => a.slug === cand)) continue;
      if (!(await ghGet(env, `articles/${cand}.json`))) slug = cand;
    }
    if (!slug) throw new HttpError(400, "Couldn't find a free web address for this title. Try a different title.");
  }
  const path = `articles/${slug}.json`;
  const existing = await ghGet(env, path);
  const old = existing ? parseJSON(existing.text, {}) : {};
  // changed on the site (from silverfishstone.com/write, say) since this draft started?
  const siteAt = Date.parse(old.updated || ""), baseAt = Date.parse(w.base || "");
  if (existing && !c.body.force && !isNaN(siteAt) && !isNaN(baseAt) && siteAt > baseAt + 1000) {
    throw new HttpError(409, "This article changed on the site since this draft was started.", {
      conflict: { updated: old.updated, words: old.words || 0, title: old.title || title } });
  }
  const now = new Date().toISOString();
  const meta = { slug, title, summary: w.summary.trim(), published: old.published || now, updated: now, words: w.words };
  if (w.subtitle.trim()) meta.subtitle = w.subtitle.trim();
  meta.categories = parseJSON(w.categories, []);
  const source = old.source || w.source;
  const doc = { ...meta, ...(source ? { source } : {}), html: w.html, delta: parseJSON(w.delta, { ops: [] }) };
  const verb = existing ? "Update" : "Publish";
  await ghPut(env, path, JSON.stringify(doc), `${verb} article: ${title}`, existing && existing.sha);
  await ghUpdateList(env, "articles/index.json", (l) => {
    if (w.pinned) l.forEach((a) => { if (a.slug !== slug) delete a.pinned; });   // only one pinned
    const entry = { ...meta, ...(w.pinned ? { pinned: true } : {}) };
    const i = l.findIndex((a) => a.slug === slug);
    if (i >= 0) l[i] = entry; else l.push(entry);
    return l;
  }, `${verb} article index: ${title}`);
  await run(env, "UPDATE writings SET slug = ?1, state = 'draft', base = ?2, updated_at = ?3 WHERE id = ?4", slug, now, Date.now(), w.id);
  articleCache = null;
  return { ok: true, slug, verb };
}

// the published article: from the repo when the site can reach it (freshest), else the site's own files
async function publishedDoc(c, slug) {
  if (c.env.GITHUB_TOKEN && c.env.GITHUB_REPO) {
    const f = await ghGet(c.env, `articles/${slug}.json`);
    return f && parseJSON(f.text, null);
  }
  const res = await c.env.ASSETS.fetch(new Request(new URL(`/articles/${slug}.json`, c.url)));
  return res.ok ? res.json() : null;
}
// what the site's list says about one article right now (its "updated" time and length)
async function siteVersion(env, slug) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return null;
  const idx = await ghGet(env, "articles/index.json");
  const e = parseJSON(idx ? idx.text : "[]", []).find((a) => a.slug === slug);
  return e ? { updated: e.updated || e.published, words: e.words || 0, title: e.title } : null;
}

async function removeFromRepo(env, slug, title, verb = "Delete") {
  const path = `articles/${slug}.json`;
  const f = await ghGet(env, path);
  if (f) await ghDelete(env, path, f.sha, `${verb} article: ${title}`);
  await ghUpdateList(env, "articles/index.json", (l) => l.filter((a) => a.slug !== slug), `${verb} article index: ${title}`);
}

async function unpublishOfficial(c, w) {
  const env = c.env;
  ghReady(env);
  await removeFromRepo(env, w.slug, w.title, "Unpublish");
  await run(env, "UPDATE writings SET slug = NULL, updated_at = ?1 WHERE id = ?2", Date.now(), w.id);
  articleCache = null;
}
