// Componentes de interface compartilhados.
import { S, op, isAdmin, ApiError } from "./ctx.js";
import * as C from "./core.js";

/* ------------------------------------------------------------ básicos */
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (root, sel) => root.querySelector(sel);
export const $$ = (root, sel) => [...root.querySelectorAll(sel)];
export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

/* ------------------------------------------------------------ escudos */
const CORES = ["#2563eb", "#7c3aed", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#db2777", "#4f46e5", "#0d9488"];
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(str) {
  const bytes = new TextEncoder().encode(str);
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export const corDoNome = (nome) => CORES[crc32(nome) % CORES.length];
export function iniciais(nome) {
  const partes = String(nome || "").replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  const last = partes[partes.length - 1];
  if (/^\d+$/.test(last)) return (partes[0][0] + last).toUpperCase().slice(0, 3);
  return (partes[0][0] + last[0]).toUpperCase();
}
export const logoUrl = (team) => (team?.logo ? `/api/logo/${team.id}?v=${team.logo}` : null);

/** Escudo da equipe (foto) ou círculo com iniciais. size: "", "md", "lg" */
export function logo(teamOrId, size = "") {
  const t = typeof teamOrId === "object" ? teamOrId : S.db.team(teamOrId);
  if (!t) return `<span class="logo ph ${size}" style="background:#334155">?</span>`;
  const url = logoUrl(t);
  if (url) return `<img class="logo ${size}" src="${url}" alt="" loading="lazy">`;
  return `<span class="logo ph ${size}" style="background:${corDoNome(t.name)}">${esc(iniciais(t.name))}</span>`;
}
export const teamCell = (tid, extraName = null) => {
  const t = S.db.team(tid);
  return `<span class="tn">${logo(t)}<span>${esc(extraName ?? t?.name ?? "")}</span></span>`;
};

/** Recorta a foto no centro em quadrado de 256 px e devolve PNG (data URL). */
export function cropImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível abrir a imagem.")); };
    img.src = url;
  });
}

/* ------------------------------------------------------------ avisos e janelas */
export function toast(msg, kind = "ok", ms = 3500) {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${kind === "ok" ? "" : kind}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
export const errMsg = (e) => (e instanceof ApiError || e instanceof C.UserError ? e.message : e?.message || String(e));
export const showError = (e) => toast(errMsg(e), "err", 6000);

/** Abre uma janela. html: conteúdo. Retorna {el, close}. */
export function modal(html, { wide = false, onClose = null } = {}) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(bg);
  const close = () => { bg.remove(); document.removeEventListener("keydown", onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  bg.addEventListener("mousedown", (e) => { if (e.target === bg) close(); });
  bg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  return { el: bg.firstElementChild, close };
}

export function confirmDialog(title, text, { ok = "Confirmar", danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal(`<h2>${esc(title)}</h2><p class="muted" style="white-space:pre-line">${esc(text)}</p>
      <div class="foot"><button class="btn ${danger ? "danger" : "primary"} big" data-ok>${esc(ok)}</button>
      <button class="btn big" data-close>Cancelar</button></div>`, { onClose: () => { if (!done) resolve(false); } });
    m.el.querySelector("[data-ok]").addEventListener("click", () => { done = true; m.close(); resolve(true); });
  });
}

export function promptDialog(title, label, { type = "text", ok = "Confirmar" } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal(`<h2>${esc(title)}</h2><label class="field"><span>${esc(label)}</span><input type="${type}" data-v></label>
      <div class="foot"><button class="btn primary big" data-ok>${esc(ok)}</button><button class="btn big" data-close>Cancelar</button></div>`,
      { onClose: () => { if (!done) resolve(null); } });
    const inp = m.el.querySelector("[data-v]");
    setTimeout(() => inp.focus(), 50);
    const go = () => { done = true; m.close(); resolve(inp.value); };
    m.el.querySelector("[data-ok]").addEventListener("click", go);
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  });
}

/** Executa uma ação com tratamento de erro padrão; devolve [ok, resultado]. */
export async function run(fn, btn = null) {
  if (btn) btn.disabled = true;
  try { return [true, await fn()]; }
  catch (e) { showError(e); return [false, null]; }
  finally { if (btn) btn.disabled = false; }
}

/* ------------------------------------------------------------ controles */
export function seg(name, values, current) {
  return `<div class="seg" data-seg="${esc(name)}">${values.map((v) => {
    const [val, label] = Array.isArray(v) ? v : [v, v];
    return `<button type="button" data-v="${esc(val)}" class="${String(val) === String(current) ? "on" : ""}">${esc(label)}</button>`;
  }).join("")}</div>`;
}
export function bindSeg(root, name, onPick) {
  const el = root.querySelector(`[data-seg="${name}"]`);
  if (!el) return;
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    el.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    onPick(b.dataset.v);
  });
}

export const tournamentLabel = (t) => `${t.name} · ${t.season} (${C.MODALIDADES[t.game || "futebol"]}, ${C.CATEGORIAS[t.size]})`;
export function tournamentSelect(tid, list = null, id = "sel-t") {
  const ts = list || S.db.tournaments();
  if (!ts.length) return `<select id="${id}" disabled><option>Nenhum campeonato</option></select>`;
  return `<select id="${id}" style="max-width:420px">${ts.map((t) => `<option value="${t.id}" ${t.id === tid ? "selected" : ""}>${esc(tournamentLabel(t))}</option>`).join("")}</select>`;
}

export function fmtScore(m) {
  if (m.is_bye) return "W.O.";
  if (!m.played) return "x";
  let s = `${m.home_score} x ${m.away_score}`;
  if (m.home_pen !== null && m.home_pen !== undefined) s += ` (${m.home_pen}-${m.away_pen} pên.)`;
  return s;
}
export function phaseText(m) {
  let s = m.round_name || "";
  if (m.group_name) s += ` · Grupo ${m.group_name}`;
  if (m.day) s = `Dia ${m.day} · ${s}`;
  return s;
}
export function sideName(m, side, labels) {
  const id = m[`${side}_id`];
  if (id) return { known: true, name: S.db.teamName(id), id };
  return { known: false, name: labels?.get(`${m.id}:${side}`) || (m.is_bye ? "Folga" : "A definir"), id: null };
}

export const formHtml = (form) => `<span class="form">${form.map((x) => `<span class="${x}">${x}</span>`).join(" ")}</span>`;

/* ------------------------------------------------------------ cores das tabelas */
/** Devolve {tagOf(row), legend:[[cor, texto]]} igual ao desktop. */
export function standingsStyle(t, rows, group = null) {
  const meta = t.meta || 0;
  const third = new Set();
  for (const m of S.db.s.matches) {
    if (m.tournament_id !== t.id || m.round_name !== C.THIRD) continue;
    for (const src of [m.home_src, m.away_src]) if (src && group && src.startsWith(`G:${group}:`)) third.add(+src.split(":")[2]);
  }
  const lider = rows[0]?.pts ?? 0;
  const n = rows.length;
  let chave = 2, q = 2, fases = [];
  if (t.format === "dias") ({ chave, classificados: q, fases } = C.infoFaseFinal(t, S.db.tournamentTeams(t.id).length));
  const tagOf = (r) => {
    if (t.format === "dias") {
      if (r.pos <= q) return "r-green";
      if (chave === 2 && t.third_place && r.pos <= 4) return "r-blue";
      return "r-red";
    }
    if (t.format === "grupos_mata") {
      if (r.pos <= t.qualifiers) return "r-green";
      if (third.has(r.pos)) return "r-blue";
      if (third.size && r.pos > Math.max(...third)) return "r-red";
      return "";
    }
    if (meta) {
      if (r.pos === 1 && r.j) return "r-gold";
      if (r.pts < lider && r.pts + (meta - r.j) * t.pts_win < lider) return "r-red";
      return "";
    }
    if (t.format === "liga") {
      if (r.pos === 1 && r.j) return "r-gold";
      const z = Math.max(2, Math.floor(n / 5));
      if (n >= 8 && r.pos <= z) return "r-blue";
      if (n >= 8 && r.pos > n - z) return "r-red";
    }
    return "";
  };
  let legend = [];
  if (t.format === "dias") {
    legend = [["#15803d", chave > 2 ? `Classificados para ${C.comArtigo(fases[0])}` : "Disputam a final"]];
    if (chave === 2 && t.third_place) legend.push(["#1d4ed8", "Disputa de 3º lugar"]);
    if (n > q + (chave === 2 && t.third_place ? 2 : 0)) legend.push(["#b91c1c", "Fora do mata-mata"]);
  } else if (t.format === "grupos_mata") {
    legend = [["#15803d", third.size ? "Disputam a final" : `Classificados para o mata-mata (top ${t.qualifiers})`]];
    if (third.size) legend.push(["#1d4ed8", "Disputam o 3º lugar"], ["#b91c1c", "Eliminado"]);
  } else if (meta) legend = [["#a16207", "Líder"], ["#b91c1c", "Não alcança mais o líder"]];
  else if (t.format === "liga" && n >= 8) legend = [["#a16207", "Líder"], ["#1d4ed8", "Zona de classificação"], ["#b91c1c", "Zona de rebaixamento"]];
  else if (t.format === "liga") legend = [["#a16207", "Líder"]];
  return { tagOf, legend };
}
export const legendHtml = (legend) => (legend.length ? `<div class="legend">${legend.map(([c, txt]) => `<span><i style="background:${c}"></i>${esc(txt)}</span>`).join("")}</div>` : "");

/* ------------------------------------------------------------ lançamento de placar */
export function quickScores() {
  return `<div class="quick">${C.PLACARES_2PTS.map(([h, a]) => `<button type="button" class="btn" data-quick="${h}-${a}">${h} x ${a}</button>`).join("")}</div>`;
}

/** Janela de gols por jogador (futebol, equipes). */
export function scorersDialog(m, current) {
  return new Promise((resolve) => {
    let done = false;
    const col = (tid) => `<div class="card"><div class="card-title">${teamCell(tid)}</div>
      ${S.db.teamMembers(tid).map((p) => `<label class="row" style="justify-content:space-between;align-items:center;margin:4px 0">
        <span>${esc(p.name)}</span><input type="number" min="0" style="width:64px" data-pid="${p.id}" value="${current[p.id] || ""}"></label>`).join("")}</div>`;
    const md = modal(`<h2>Gols por jogador</h2><p class="muted small">Opcional. A soma não pode passar do placar da equipe.</p>
      <div class="grid" style="grid-template-columns:1fr 1fr">${col(m.home_id)}${col(m.away_id)}</div>
      <div class="foot"><button class="btn primary big" data-ok>Confirmar</button><button class="btn big" data-close>Cancelar</button></div>`,
    { wide: true, onClose: () => { if (!done) resolve(null); } });
    md.el.querySelector("[data-ok]").addEventListener("click", () => {
      const out = {};
      md.el.querySelectorAll("[data-pid]").forEach((i) => { const v = parseInt(i.value, 10); if (v > 0) out[i.dataset.pid] = v; });
      done = true; md.close(); resolve(out);
    });
  });
}

/** Janela de resultado (usada no Chaveamento). Admin: qualquer jogo. */
export function resultDialog(mid, onDone = null) {
  const m = S.db.match(mid);
  if (!m) return;
  const t = S.db.tournament(m.tournament_id);
  const labels = S.db.matchLabels(t.id);
  const h = sideName(m, "home", labels), a = sideName(m, "away", labels);
  const ready = !!(m.home_id && m.away_id) && !m.is_bye;
  const two = C.ate2Pontos(t.game);
  const pens = m.stage === "mata" && C.temPenaltis(t.game);
  let scorers = S.db.matchScorers(mid);
  const team = (s) => `<div style="text-align:center;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center;gap:8px">${s.id ? logo(s.id, "md") : ""}<span class="${s.known ? "" : "muted"}">${esc(s.name)}</span></div>`;
  const md = modal(`
    <div class="muted small" style="text-align:center">${esc(t.name)} · ${esc(C.MODALIDADES[t.game || "futebol"])}</div>
    <h2 style="text-align:center;color:${m.stage === "mata" ? "var(--gold)" : "inherit"}">${esc(phaseText(m))}</h2>
    <div class="card" style="margin-top:10px">
      ${team(h)}
      <div style="display:flex;justify-content:center;align-items:center;gap:12px;margin:10px 0">
        <input type="number" min="0" data-hs value="${m.home_score ?? ""}" style="width:72px;height:56px;font-size:28px;font-weight:800;text-align:center" ${ready ? "" : "disabled"}>
        <b class="muted" style="font-size:22px">×</b>
        <input type="number" min="0" data-as value="${m.away_score ?? ""}" style="width:72px;height:56px;font-size:28px;font-weight:800;text-align:center" ${ready ? "" : "disabled"}>
      </div>
      ${team(a)}
    </div>
    ${two ? `<p class="rule" style="text-align:center">Partida até 2 pontos — sem empate. Clique no placar:</p>${quickScores()}` : ""}
    ${pens ? `<div class="row" style="justify-content:center;margin-top:8px;align-items:center"><span class="gold small">Pênaltis (se empatar):</span>
      <input type="number" min="0" data-hp value="${m.home_pen ?? ""}" style="width:56px;text-align:center"><span class="muted">×</span>
      <input type="number" min="0" data-ap value="${m.away_pen ?? ""}" style="width:56px;text-align:center"></div>` : ""}
    ${ready && t.game === "futebol" && S.db.team(m.home_id)?.size > 1 ? `<button class="btn block" style="margin-top:10px" data-scorers>🎯 Gols por jogador (opcional)</button>` : ""}
    ${!ready ? `<p class="gold" style="text-align:center">Aguardando a definição dos participantes.</p>` : ""}
    ${m.played_by ? `<p class="muted small" style="text-align:center">Lançado por ${esc(m.played_by)} em ${esc(fmtDateTime(m.played_at))}</p>` : ""}
    <div class="foot">
      <button class="btn primary big" style="flex:1" data-save ${ready ? "" : "disabled"}>✔ Salvar</button>
      <button class="btn danger big" data-clear ${m.played && !m.is_bye ? "" : "disabled"}>Limpar</button>
      <button class="btn big" data-close>Fechar</button>
    </div>`);
  const el = md.el;
  const save = async (hs, as) => {
    const hp = el.querySelector("[data-hp]")?.value ?? null, ap = el.querySelector("[data-ap]")?.value ?? null;
    const [ok] = await run(() => op("saveResult", { id: mid, hs, as, hp: hp === "" ? null : hp, ap: ap === "" ? null : ap, scorers }), el.querySelector("[data-save]"));
    if (ok) { md.close(); toast("Resultado salvo."); onDone?.(); }
  };
  el.querySelector("[data-save]").addEventListener("click", () => save(el.querySelector("[data-hs]").value, el.querySelector("[data-as]").value));
  el.querySelectorAll("[data-quick]").forEach((b) => b.addEventListener("click", () => { const [x, y] = b.dataset.quick.split("-"); save(x, y); }));
  el.querySelectorAll("input").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") el.querySelector("[data-save]").click(); }));
  el.querySelector("[data-scorers]")?.addEventListener("click", async () => { const r = await scorersDialog(m, scorers); if (r) scorers = r; });
  el.querySelector("[data-clear]").addEventListener("click", async () => {
    const [ok] = await run(() => op("clearResult", { id: mid }));
    if (ok) { md.close(); toast("Resultado apagado."); onDone?.(); }
  });
  setTimeout(() => el.querySelector("[data-hs]")?.focus(), 60);
}

export function fmtDateTime(s) {
  if (!s) return "";
  const [d, h] = String(s).split(" ");
  const [y, mo, da] = d.split("-");
  return `${da}/${mo}/${y}${h ? " " + h.slice(0, 5) : ""}`;
}

export const canEditResults = () => isAdmin();
