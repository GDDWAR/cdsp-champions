// CDSP Champions — aplicação web.
import { S, api, loadState, isAdmin, prefs } from "./ctx.js";
import { esc, $, toast, showError, run, seg, bindSeg, modal } from "./ui.js";
import { PAGES } from "./pages.js";

const root = document.getElementById("app");
const POLL_MS = 15000;

/* ------------------------------------------------------------ login / cadastro */
function renderLogin(msg = null) {
  let mode = "entrar";
  const draw = (m = msg) => {
    root.innerHTML = `<div class="login-wrap"><div class="login">
      <div class="brand"><img src="/img/logo-tela.png" alt="CDSP Champions"></div>
      ${S.adminConfigured === false ? `<div class="msg err">O administrador ainda não foi configurado. No Netlify, crie a variável de ambiente <b>ADMIN_PASSWORD</b> (veja o guia de hospedagem) e publique de novo.</div>` : ""}
      ${seg("modo", [["entrar", "Entrar"], ["criar", "Criar acesso"]], mode)}
      ${m ? `<div class="msg ${m.kind}">${esc(m.text)}</div>` : ""}
      <form id="f-login" autocomplete="on">
        ${mode === "criar" ? `<label class="field"><span>Seu nome</span><input type="text" name="name" maxlength="60" autocomplete="name" required></label>` : ""}
        <label class="field"><span>Usuário</span><input type="text" name="username" autocapitalize="none" autocomplete="username" required></label>
        <label class="field"><span>Senha</span><input type="password" name="password" autocomplete="${mode === "criar" ? "new-password" : "current-password"}" required></label>
        ${mode === "criar" ? `<label class="field"><span>Repita a senha</span><input type="password" name="password2" autocomplete="new-password" required></label>
          <p class="muted small">Depois de criar, o administrador precisa aprovar seu acesso. Com o acesso aprovado você poderá lançar placares.</p>` : ""}
        <button class="btn primary big block" type="submit">${mode === "criar" ? "Criar acesso" : "Entrar"}</button>
      </form>
    </div></div>`;
    bindSeg(root, "modo", (v) => { mode = v; draw(null); });
    $(root, "#f-login").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const btn = e.target.querySelector("button[type=submit]");
      if (mode === "criar") {
        if (f.password !== f.password2) return draw({ kind: "err", text: "As senhas não conferem." });
        const [ok, r] = await run(() => api("/register", { method: "POST", body: { name: f.name, username: f.username, password: f.password } }), btn);
        if (ok) { mode = "entrar"; draw({ kind: "ok", text: r.message }); }
      } else {
        btn.disabled = true;
        try {
          const r = await api("/login", { method: "POST", body: { username: f.username, password: f.password } });
          S.user = r.user;
          await start();
        } catch (err) {
          draw({ kind: err.status === 403 ? "info" : "err", text: err.message });
        }
      }
    });
    setTimeout(() => root.querySelector("input")?.focus(), 30);
  };
  draw();
}

/* ------------------------------------------------------------ casca (menu + página) */
function navItems() {
  const pend = S.pendingUsers || 0;
  return PAGES.filter((p) => !p.admin || isAdmin()).map((p) =>
    `<button data-page="${p.id}" class="${S.page === p.id ? "on" : ""}"><span class="ico">${p.icon}</span><span>${esc(p.title)}</span>${p.id === "usuarios" && pend ? `<span class="badge">${pend}</span>` : ""}${p.id === "lancamentos" && S.pendingGames ? `<span class="badge">${S.pendingGames}</span>` : ""}</button>`).join("");
}

function renderShell() {
  root.innerHTML = `
    <div class="topbar"><button id="menu-btn" aria-label="Menu">☰</button><img src="/img/logo-tela.png" alt=""><div class="t" id="top-title"></div></div>
    <aside class="side" id="side">
      <a class="brand" href="#painel" title="Painel"><img src="/img/logo-tela.png" alt="CDSP Champions"></a>
      <nav class="nav" id="nav">${navItems()}</nav>
      <div class="side-foot">
        <div class="who">Conectado como<br><b>${esc(S.user.name || S.user.username)}</b> · ${isAdmin() ? "Administrador" : "Lançador de placares"}</div>
        <div class="zoom">Zoom <button data-z="-1">−</button><span id="zoom-v"></span><button data-z="1">+</button></div>
        <div class="btns">${S.user.main ? "" : `<button class="btn sm" id="btn-pass">Trocar senha</button>`}<button class="btn sm" id="btn-logout">Sair</button></div>
      </div>
    </aside>
    <main id="page"></main>`;
  const side = $(root, "#side");
  const closeMenu = () => { side.classList.remove("open"); document.querySelector(".side-shade")?.remove(); };
  $(root, "#menu-btn").addEventListener("click", () => {
    side.classList.add("open");
    const shade = document.createElement("div");
    shade.className = "side-shade";
    shade.addEventListener("click", closeMenu);
    document.body.appendChild(shade);
  });
  $(root, "#nav").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-page]");
    if (!b) return;
    closeMenu();
    go(b.dataset.page);
  });
  $(root, "#btn-logout").addEventListener("click", logout);
  $(root, "#btn-pass")?.addEventListener("click", changePassword);
  root.querySelectorAll("[data-z]").forEach((b) => b.addEventListener("click", () => setZoom(prefs.get("zoom", 1) + 0.05 * +b.dataset.z)));
  setZoom(prefs.get("zoom", defaultZoom()), false);
}

function defaultZoom() {
  const w = window.innerWidth;
  return w >= 1500 ? 1 : w >= 1280 ? 0.9 : 1;
}
function setZoom(z, save = true) {
  z = Math.round(Math.min(1.4, Math.max(0.6, z)) * 100) / 100;
  document.documentElement.style.zoom = z;
  document.documentElement.style.setProperty("--vh", `${window.innerHeight / z / 100}px`);
  const v = document.getElementById("zoom-v");
  if (v) v.textContent = `${Math.round(z * 100)}%`;
  if (save) prefs.set("zoom", z);
}

let current = null;
export function go(pageId, opts = {}) {
  const p = PAGES.find((x) => x.id === pageId && (!x.admin || isAdmin())) || PAGES[0];
  S.page = p.id;
  if (location.hash !== "#" + p.id) history.replaceState(null, "", "#" + p.id);
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.page === p.id));
  const tt = document.getElementById("top-title");
  if (tt) tt.textContent = p.title;
  current?.destroy?.();
  current = p.create({ go, ...opts });
  const main = document.getElementById("page");
  main.innerHTML = "";
  current.mount(main);
  window.scrollTo(0, 0);
}
S.go = go;

/** Redesenha a página atual quando os dados mudam — sem atrapalhar quem está digitando. */
function onData() {
  updateBadges();
  if (!current) return;
  const a = document.activeElement;
  const typing = a && document.getElementById("page")?.contains(a) && ["INPUT", "TEXTAREA", "SELECT"].includes(a.tagName) && a.type !== "checkbox";
  if (typing || document.querySelector(".modal-bg")) { S.deferred = true; return; }
  current.refresh?.();
}
document.addEventListener("focusout", () => setTimeout(() => {
  if (S.deferred && !document.querySelector(".modal-bg")) { S.deferred = false; current?.refresh?.(); }
}, 400));

function updateBadges() {
  S.pendingGames = S.db.s.matches.filter((m) => !m.played && !m.is_bye && m.home_id && m.away_id).length;
  const nav = document.getElementById("nav");
  if (nav) nav.innerHTML = navItems();
}

async function refreshUsersBadge() {
  if (!isAdmin()) return;
  try {
    const r = await api("/users");
    S.pendingUsers = r.users.filter((u) => u.status === "pending").length;
    updateBadges();
  } catch { /* ignora */ }
}

/* ------------------------------------------------------------ sessão */
async function logout() {
  await run(() => api("/logout", { method: "POST" }));
  S.user = null;
  stopPolling();
  renderLogin();
}
S.onLoggedOut = () => {
  if (!S.user) return;
  S.user = null;
  stopPolling();
  document.querySelectorAll(".modal-bg").forEach((m) => m.remove());
  renderLogin({ kind: "info", text: "Sua sessão terminou. Entre novamente." });
};

function changePassword() {
  const md = modal(`<h2>Trocar senha</h2>
    <label class="field"><span>Senha atual</span><input type="password" data-c autocomplete="current-password"></label>
    <label class="field"><span>Nova senha (mín. 6 caracteres)</span><input type="password" data-n autocomplete="new-password"></label>
    <label class="field"><span>Repita a nova senha</span><input type="password" data-n2 autocomplete="new-password"></label>
    <div class="foot"><button class="btn primary big" data-ok>Salvar</button><button class="btn big" data-close>Cancelar</button></div>`);
  md.el.querySelector("[data-ok]").addEventListener("click", async (e) => {
    const c = md.el.querySelector("[data-c]").value, n = md.el.querySelector("[data-n]").value;
    if (n !== md.el.querySelector("[data-n2]").value) return toast("As senhas não conferem.", "err");
    const [ok] = await run(() => api("/password", { method: "POST", body: { current: c, newPassword: n } }), e.target);
    if (ok) { md.close(); S.user = null; stopPolling(); renderLogin({ kind: "ok", text: "Senha alterada. Entre com a nova senha." }); }
  });
}

let timer = null;
function startPolling() {
  stopPolling();
  timer = setInterval(async () => {
    if (document.hidden) return;
    try { if (await loadState()) onData(); } catch { /* silencioso: tenta de novo */ }
    if (Math.random() < 0.25) refreshUsersBadge();
  }, POLL_MS);
}
function stopPolling() { if (timer) clearInterval(timer); timer = null; }
document.addEventListener("visibilitychange", async () => {
  if (!document.hidden && S.user) { try { if (await loadState()) onData(); } catch { /* */ } }
});

async function start() {
  try {
    await loadState(true);
  } catch (e) {
    if (e.status === 401 || e.status === 403) return renderLogin({ kind: "info", text: e.message });
    showError(e);
  }
  S.listeners.clear();
  S.listeners.add(onData);
  renderShell();
  updateBadges();
  const fromHash = location.hash.replace("#", "");
  go(fromHash || (isAdmin() ? "painel" : "lancamentos"));
  startPolling();
  refreshUsersBadge();
}

(async function boot() {
  try {
    const r = await api("/session");
    S.adminConfigured = r.adminConfigured;
    if (r.user && r.user.status === "approved") { S.user = r.user; return start(); }
  } catch (e) {
    return renderLogin({ kind: "err", text: e.message });
  }
  renderLogin();
})();

window.addEventListener("hashchange", () => { if (S.user) { const h = location.hash.replace("#", ""); if (h && h !== S.page) go(h); } });
window.addEventListener("resize", () => {
  const z = +document.documentElement.style.zoom || 1;
  document.documentElement.style.setProperty("--vh", `${window.innerHeight / z / 100}px`);
});
