/*
 * CDSP Champions — API (roda como Netlify Function; o mesmo código roda no servidor de teste local).
 *
 * Segurança:
 *  - Admin principal: variáveis de ambiente ADMIN_USER (padrão "admin") e ADMIN_PASSWORD.
 *  - Novos usuários se cadastram e ficam "pendentes" até o admin aprovar.
 *  - Usuário aprovado: vê tudo, mas só pode LANÇAR placar de jogo ainda sem resultado.
 *  - Alterar placar já lançado, cadastros e campeonatos: somente admin.
 *  - Sessão em cookie HttpOnly assinado (HMAC). Escritas exigem o cabeçalho X-CDSP (proteção CSRF).
 */
import crypto from "node:crypto";
import { Db, UserError, emptyState } from "../public/js/core.js";

const STATE_KEY = "state";
const USERS_KEY = "users";
const CONFIG_KEY = "config";
const COOKIE = "cdsp_session";
const SESSION_DAYS = 30;
const MAX_LOGO_BYTES = 400 * 1024;

/* ------------------------------------------------------------------ utilidades */
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const err = (msg, status = 400) => json({ error: msg }, status);
const b64u = (buf) => Buffer.from(buf).toString("base64url");

function scrypt(password, salt) {
  return new Promise((res, rej) => crypto.scrypt(password, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}
async function verifyPassword(password, stored) {
  try {
    const [, s, k] = stored.split("$");
    const key = await scrypt(password, Buffer.from(s, "base64"));
    const ref = Buffer.from(k, "base64");
    return ref.length === key.length && crypto.timingSafeEqual(ref, key);
  } catch {
    return false;
  }
}
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function cookieHeader(req, value, maxAge) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/* ------------------------------------------------------------------ armazenamento */
async function readJSON(store, key, fallback) {
  const r = await store.getJSON(key);
  return r ? r : { data: fallback, etag: null };
}

/** Lê-modifica-grava com controle de concorrência (repete se outra pessoa gravou no meio). */
async function mutate(store, key, fallback, fn) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, etag } = await readJSON(store, key, fallback());
    const result = await fn(data);
    const opts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
    const w = await store.setJSON(key, data, opts);
    if (w.modified) return { data, etag: w.etag, result };
    await sleep(40 + Math.random() * 120 * (attempt + 1));
  }
  throw new UserError("Muitas gravações ao mesmo tempo. Tente de novo em alguns segundos.");
}

async function getSecret(store) {
  const r = await store.getJSON(CONFIG_KEY);
  if (r?.data?.secret) return r.data.secret;
  const secret = b64u(crypto.randomBytes(32));
  await store.setJSON(CONFIG_KEY, { secret }, { onlyIfNew: true });
  const again = await store.getJSON(CONFIG_KEY);
  return again.data.secret;
}

/* ------------------------------------------------------------------ sessão */
async function makeToken(store, payload) {
  const secret = await getSecret(store);
  const body = b64u(JSON.stringify(payload));
  const sig = b64u(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}
async function readToken(store, token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const secret = await getSecret(store);
  const expect = b64u(crypto.createHmac("sha256", secret).update(body).digest());
  if (!safeEqual(sig, expect)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

const adminUser = (env) => String(env.ADMIN_USER || "admin").trim().toLowerCase();
const adminConfigured = (env) => !!(env.ADMIN_PASSWORD && String(env.ADMIN_PASSWORD).length >= 6);

/** Quem está fazendo a requisição: {username, name, role: admin|user, status} ou null. */
async function currentUser(req, store, env) {
  const p = await readToken(store, parseCookies(req)[COOKIE]);
  if (!p) return null;
  if (p.k === "env") {
    if (!adminConfigured(env) || p.u !== adminUser(env) || p.h !== envHash(env)) return null;
    return { username: p.u, name: "Administrador", role: "admin", status: "approved", main: true };
  }
  const { data } = await readJSON(store, USERS_KEY, { users: {} });
  const u = data.users[p.u];
  if (!u || u.sv !== p.sv) return null;
  return { username: p.u, name: u.name, role: u.role === "admin" ? "admin" : "user", status: u.status };
}
// muda quando a senha do admin muda: sessões antigas do admin deixam de valer
const envHash = (env) => crypto.createHash("sha256").update("cdsp:" + String(env.ADMIN_PASSWORD || "")).digest("base64url").slice(0, 16);

/* ------------------------------------------------------------------ operações do campeonato */
const ADMIN = "admin";
const OPS = {
  addPlayer: [ADMIN, (db, a) => db.addPlayer(a.name, a.nickname, a.position)],
  addPlayersBulk: [ADMIN, (db, a) => db.addPlayersBulk(a.text)],
  updatePlayer: [ADMIN, (db, a) => db.updatePlayer(+a.id, a.name, a.nickname, a.position, a.active)],
  deletePlayer: [ADMIN, (db, a) => db.deletePlayer(+a.id)],
  addTeam: [ADMIN, (db, a) => db.addTeam(a.name, +a.size, a.playerIds || [])],
  updateTeam: [ADMIN, (db, a) => db.updateTeam(+a.id, a.name, a.playerIds || [])],
  deleteTeam: [ADMIN, (db, a) => db.deleteTeam(+a.id)],
  drawTeams: [ADMIN, (db, a) => {
    const r = db.drawTeams(a.playerIds || [], +a.size);
    return { created: r.created.length, leftover: r.leftover.map((p) => db.player(p)?.name).filter(Boolean) };
  }],
  createTournament: [ADMIN, (db, a) => {
    const o = { ...a };
    o.size = +o.size;
    if (o.size === 1) o.teamIds = (o.teamIds || []).map((pid) => db.soloTeam(+pid)); // individual: ids de jogadores
    return db.createTournament(o);
  }],
  deleteTournament: [ADMIN, (db, a) => db.deleteTournament(+a.id)],
  generateKnockout: [ADMIN, (db, a) => db.generateKnockoutFromGroups(+a.id)],
  clearResult: [ADMIN, (db, a) => db.clearResult(+a.id)],
  // lançar placar: qualquer usuário aprovado — regras extras abaixo
  saveResult: ["user", (db, a, user) => {
    const m = db.match(+a.id);
    if (!m) throw new UserError("Partida não encontrada.");
    if (m.played && (user.role !== "admin" || a.expectUnplayed))
      throw new UserError(user.role === "admin"
        ? "Este jogo acabou de receber um placar (lançado por " + (m.played_by || "outro usuário") + "). Para alterar, use a aba Partidas ou o Chaveamento."
        : "Este jogo já tem placar lançado. Somente o administrador pode alterar.");
    return db.saveResult(+a.id, a.hs, a.as, a.hp, a.ap, a.scorers || null, user.username);
  }],
};

/* ------------------------------------------------------------------ roteador */
export async function handle(req, store, env = {}) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
  const method = req.method.toUpperCase();
  try {
    if (method !== "GET" && method !== "HEAD" && req.headers.get("x-cdsp") !== "1") return err("Requisição recusada.", 403);

    /* ---------- sessão e cadastro ---------- */
    if (path === "/session" && method === "GET") {
      const user = await currentUser(req, store, env);
      return json({ user, adminConfigured: adminConfigured(env) });
    }

    if (path === "/login" && method === "POST") {
      const b = await req.json().catch(() => ({}));
      const username = String(b.username || "").trim().toLowerCase();
      const password = String(b.password || "");
      if (!username || !password) return err("Informe usuário e senha.");
      let payload = null;
      if (adminConfigured(env) && username === adminUser(env)) {
        if (safeEqual(password, env.ADMIN_PASSWORD)) payload = { u: username, k: "env", h: envHash(env) };
      } else {
        const { data } = await readJSON(store, USERS_KEY, { users: {} });
        const u = data.users[username];
        if (u && (await verifyPassword(password, u.hash))) {
          if (u.status === "pending") return err("Seu acesso ainda está aguardando a aprovação do administrador.", 403);
          if (u.status === "blocked") return err("Seu acesso foi bloqueado pelo administrador.", 403);
          payload = { u: username, k: "user", sv: u.sv };
        }
      }
      if (!payload) { await sleep(600); return err("Usuário ou senha incorretos.", 401); }
      payload.exp = Date.now() + SESSION_DAYS * 864e5;
      const token = await makeToken(store, payload);
      const user = await currentUser(new Request(req.url, { headers: { cookie: `${COOKIE}=${token}` } }), store, env);
      return json({ user }, 200, { "set-cookie": cookieHeader(req, token, SESSION_DAYS * 86400) });
    }

    if (path === "/logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": cookieHeader(req, "", 0) });

    if (path === "/register" && method === "POST") {
      const b = await req.json().catch(() => ({}));
      const username = String(b.username || "").trim().toLowerCase();
      const name = String(b.name || "").trim().slice(0, 60);
      const password = String(b.password || "");
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return err("Usuário: de 3 a 30 caracteres, só letras sem acento, números, ponto, traço ou _.");
      if (password.length < 6) return err("A senha precisa ter pelo menos 6 caracteres.");
      if (!name) return err("Informe seu nome.");
      if (username === adminUser(env)) return err("Este nome de usuário não está disponível.");
      const hash = await hashPassword(password);
      await mutate(store, USERS_KEY, () => ({ users: {} }), (data) => {
        if (data.users[username]) throw new UserError("Este nome de usuário já existe.");
        data.users[username] = { name, hash, status: "pending", role: "user", sv: 1, created_at: new Date().toISOString() };
      });
      return json({ ok: true, message: "Acesso criado! Aguarde o administrador aprovar para poder entrar." });
    }

    /* ---------- daqui para baixo: precisa estar logado e aprovado ---------- */
    const user = await currentUser(req, store, env);
    if (!user) return err("Faça login para continuar.", 401);
    if (user.status !== "approved") return err("Seu acesso ainda não foi aprovado.", 403);
    const isAdmin = user.role === "admin";

    if (path === "/password" && method === "POST") {
      if (user.main) return err("A senha do administrador principal é definida nas configurações do Netlify (ADMIN_PASSWORD).");
      const b = await req.json().catch(() => ({}));
      if (String(b.newPassword || "").length < 6) return err("A nova senha precisa ter pelo menos 6 caracteres.");
      const { data } = await readJSON(store, USERS_KEY, { users: {} });
      if (!(await verifyPassword(String(b.current || ""), data.users[user.username].hash))) return err("Senha atual incorreta.");
      const hash = await hashPassword(String(b.newPassword));
      await mutate(store, USERS_KEY, () => ({ users: {} }), (d) => {
        d.users[user.username].hash = hash;
        d.users[user.username].sv = (d.users[user.username].sv || 1) + 1;
      });
      return json({ ok: true }, 200, { "set-cookie": cookieHeader(req, "", 0) });
    }

    if (path === "/state" && method === "GET") {
      const r = await store.getJSON(STATE_KEY);
      const etag = r?.etag || "empty";
      if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
      return json({ state: r?.data || emptyState(), etag }, 200, { etag });
    }

    if (path === "/op" && method === "POST") {
      const b = await req.json().catch(() => ({}));
      const def = OPS[b.op];
      if (!def) return err("Operação desconhecida.");
      if (def[0] === ADMIN && !isAdmin) return err("Somente o administrador pode fazer isso.", 403);
      const args = b.args || {};
      const { data, etag, result } = await mutate(store, STATE_KEY, emptyState, (state) => {
        const db = new Db(state);
        return def[1](db, args, user);
      });
      if (b.op === "deleteTeam") await store.delete(`logo/${+args.id}`).catch(() => {});
      return json({ state: data, etag, result: result ?? null });
    }

    /* ---------- escudos ---------- */
    const logoMatch = path.match(/^\/logo\/(\d+)$/);
    if (logoMatch) {
      const id = +logoMatch[1];
      if (method === "GET") {
        const buf = await store.getBytes(`logo/${id}`);
        if (!buf) return new Response("", { status: 404 });
        return new Response(buf, { headers: { "content-type": "image/png", "cache-control": "private, max-age=31536000, immutable" } });
      }
      if (!isAdmin) return err("Somente o administrador pode alterar escudos.", 403);
      if (method === "PUT") {
        const b = await req.json().catch(() => ({}));
        const m = String(b.dataUrl || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
        if (!m) return err("Imagem inválida.");
        const bytes = Buffer.from(m[1], "base64");
        if (bytes.length > MAX_LOGO_BYTES) return err("Imagem muito grande.");
        await store.setBytes(`logo/${id}`, bytes);
        const version = Date.now().toString(36);
        const { data, etag } = await mutate(store, STATE_KEY, emptyState, (state) => new Db(state).setTeamLogo(id, version));
        return json({ state: data, etag });
      }
      if (method === "DELETE") {
        await store.delete(`logo/${id}`).catch(() => {});
        const { data, etag } = await mutate(store, STATE_KEY, emptyState, (state) => new Db(state).setTeamLogo(id, null));
        return json({ state: data, etag });
      }
    }

    /* ---------- administração ---------- */
    if (!isAdmin) return err("Somente o administrador pode fazer isso.", 403);

    if (path === "/users" && method === "GET") {
      const { data } = await readJSON(store, USERS_KEY, { users: {} });
      const users = Object.entries(data.users).map(([username, u]) => ({
        username, name: u.name, status: u.status, role: u.role || "user", created_at: u.created_at,
        approved_at: u.approved_at || null, approved_by: u.approved_by || null,
      }));
      return json({ users, mainAdmin: adminUser(env) });
    }

    if (path === "/users/action" && method === "POST") {
      const b = await req.json().catch(() => ({}));
      const username = String(b.username || "").toLowerCase();
      const action = String(b.action || "");
      let newHash = null;
      if (action === "reset_password") {
        if (String(b.password || "").length < 6) return err("A nova senha precisa ter pelo menos 6 caracteres.");
        newHash = await hashPassword(String(b.password));
      }
      await mutate(store, USERS_KEY, () => ({ users: {} }), (data) => {
        const u = data.users[username];
        if (!u) throw new UserError("Usuário não encontrado.");
        if (username === user.username && ["block", "delete", "remove_admin"].includes(action))
          throw new UserError("Você não pode fazer isso com o seu próprio usuário.");
        const bump = () => { u.sv = (u.sv || 1) + 1; }; // derruba as sessões abertas desse usuário
        if (action === "approve") { u.status = "approved"; u.approved_at = new Date().toISOString(); u.approved_by = user.username; }
        else if (action === "block") { u.status = "blocked"; bump(); }
        else if (action === "make_admin") { u.role = "admin"; bump(); }
        else if (action === "remove_admin") { u.role = "user"; bump(); }
        else if (action === "reset_password") { u.hash = newHash; bump(); }
        else if (action === "delete") delete data.users[username];
        else throw new UserError("Ação inválida.");
      });
      return json({ ok: true });
    }

    if (path === "/backup" && method === "GET") {
      const r = await store.getJSON(STATE_KEY);
      const state = r?.data || emptyState();
      const logos = {};
      for (const t of state.teams) {
        if (!t.logo) continue;
        const buf = await store.getBytes(`logo/${t.id}`);
        if (buf) logos[t.id] = "data:image/png;base64," + Buffer.from(buf).toString("base64");
      }
      return json({ app: "CDSP Champions", exported_at: new Date().toISOString(), state, logos }, 200, {
        "content-disposition": `attachment; filename="cdsp-champions-backup.json"`,
      });
    }

    if (path === "/restore" && method === "POST") {
      const b = await req.json().catch(() => null);
      if (!b || !b.state || !Array.isArray(b.state.matches)) return err("Arquivo de backup inválido.");
      const db = new Db(b.state); // valida a estrutura
      for (const [id, dataUrl] of Object.entries(b.logos || {})) {
        const m = String(dataUrl).match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
        if (m) await store.setBytes(`logo/${+id}`, Buffer.from(m[1], "base64"));
      }
      for (const t of db.s.teams) if (t.logo && !(b.logos || {})[t.id]) t.logo = null;
      const { data, etag } = await mutate(store, STATE_KEY, emptyState, (state) => {
        for (const k of Object.keys(state)) delete state[k];
        Object.assign(state, db.s);
      });
      return json({ state: data, etag });
    }

    return err("Rota não encontrada.", 404);
  } catch (e) {
    if (e instanceof UserError) return err(e.message, 400);
    console.error(e);
    return err("Erro interno no servidor. Tente novamente.", 500);
  }
}
