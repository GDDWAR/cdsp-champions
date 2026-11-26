// Estado da aplicação no navegador e comunicação com a API.
import { Db } from "./core.js";

export const S = {
  user: null,          // {username, name, role, status, main}
  db: new Db(),        // dados do campeonato (somente leitura no navegador; gravações passam pela API)
  etag: null,
  tid: null,           // campeonato selecionado (compartilhado entre abas)
  page: "painel",
  listeners: new Set(),
};

export const isAdmin = () => S.user?.role === "admin";

export class ApiError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

export async function api(path, { method = "GET", body, headers = {} } = {}) {
  const h = { "x-cdsp": "1", ...headers };
  if (body !== undefined) h["content-type"] = "application/json";
  let r;
  try {
    r = await fetch("/api" + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  } catch (e) {
    throw new ApiError("Sem conexão com o servidor. Verifique a internet e tente de novo.", 0);
  }
  if (r.status === 304) return { notModified: true };
  let data = null;
  try { data = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) {
    const e = new ApiError(data?.error || `Erro ${r.status}`, r.status);
    if (r.status === 401 && path !== "/login") setTimeout(() => S.onLoggedOut?.(), 0);
    throw e;
  }
  return data;
}

function applyState(data) {
  if (!data?.state) return;
  S.db = new Db(data.state);
  S.etag = data.etag;
  if (S.tid && !S.db.tournament(S.tid)) S.tid = null;
  for (const fn of S.listeners) fn();
}

/** Busca os dados mais recentes (leve: o servidor responde 304 se nada mudou). */
export async function loadState(force = false) {
  const headers = !force && S.etag ? { "if-none-match": S.etag } : {};
  const r = await api("/state", { headers });
  if (r.notModified) return false;
  applyState(r);
  return true;
}

/** Executa uma operação no servidor (com as permissões do usuário) e atualiza a tela. */
export async function op(name, args = {}) {
  const r = await api("/op", { method: "POST", body: { op: name, args } });
  applyState(r);
  return r.result;
}

export async function putLogo(teamId, dataUrl) {
  applyState(await api(`/logo/${teamId}`, { method: "PUT", body: { dataUrl } }));
}
export async function deleteLogo(teamId) {
  applyState(await api(`/logo/${teamId}`, { method: "DELETE" }));
}
/** Restaura dados + escudos. Os escudos vão um por um (o Netlify limita cada requisição a ~6 MB). */
export async function restore(payload, onProgress = null) {
  const logos = Object.entries(payload.logos || {});
  applyState(await api("/restore", { method: "POST", body: { state: payload.state, logos: {} } }));
  let i = 0;
  for (const [id, dataUrl] of logos) {
    if (S.db.team(+id)) await api(`/logo/${id}`, { method: "PUT", body: { dataUrl } }).then(applyState).catch(() => {});
    onProgress?.(++i, logos.length);
  }
}

export const onChange = (fn) => { S.listeners.add(fn); return () => S.listeners.delete(fn); };

/** Campeonato atual válido (ou o mais recente). */
export function currentTid(filter = null) {
  const list = S.db.tournaments().filter((t) => !filter || filter(t));
  if (S.tid && list.some((t) => t.id === S.tid)) return S.tid;
  S.tid = list[0]?.id ?? null;
  return S.tid;
}

export const prefs = {
  get(k, d) { try { const v = localStorage.getItem("cdsp:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("cdsp:" + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
};
