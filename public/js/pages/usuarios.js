// Usuários (admin): aprovar acessos, bloquear, redefinir senha, promover a administrador
import { S, api } from "../ctx.js";
import { esc, toast, run, confirmDialog, promptDialog, fmtDateTime } from "../ui.js";

const STATUS = { pending: "⏳ Aguardando aprovação", approved: "✅ Aprovado", blocked: "⛔ Bloqueado" };

export function create() {
  let el, users = null, main = "admin", loading = false;

  async function load() {
    loading = true;
    try { const r = await api("/users"); users = r.users; main = r.mainAdmin; S.pendingUsers = users.filter((u) => u.status === "pending").length; }
    catch (e) { toast(e.message, "err"); users = users || []; }
    loading = false;
    render();
  }

  async function act(username, action, extra = {}) {
    const [ok] = await run(() => api("/users/action", { method: "POST", body: { username, action, ...extra } }));
    if (ok) { toast("Feito."); await load(); }
  }

  function rowsHtml(list, kind) {
    if (!list.length) return `<p class="muted small" style="padding:6px">Nenhum.</p>`;
    return `<div class="tbl-wrap free"><table class="tbl"><thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Criado em</th><th></th></tr></thead><tbody>
      ${list.map((u) => `<tr><td class="b">${esc(u.name)}</td><td>${esc(u.username)}</td><td>${u.role === "admin" ? "Administrador" : "Lançador de placares"}</td>
        <td>${STATUS[u.status] || esc(u.status)}${u.approved_by ? `<div class="muted small">por ${esc(u.approved_by)}</div>` : ""}</td><td class="small">${esc(fmtDateTime((u.created_at || "").replace("T", " ").slice(0, 16)))}</td>
        <td class="r"><div class="btns" style="justify-content:flex-end">${
          kind === "pending" ? `<button class="btn primary sm" data-a="approve" data-u="${esc(u.username)}">✔ Aprovar</button><button class="btn danger sm" data-a="delete" data-u="${esc(u.username)}">Recusar</button>`
          : kind === "blocked" ? `<button class="btn primary sm" data-a="approve" data-u="${esc(u.username)}">Desbloquear</button><button class="btn danger sm" data-a="delete" data-u="${esc(u.username)}">Excluir</button>`
          : `<button class="btn sm" data-a="reset_password" data-u="${esc(u.username)}">Redefinir senha</button>
             ${u.role === "admin" ? `<button class="btn sm" data-a="remove_admin" data-u="${esc(u.username)}">Remover admin</button>` : `<button class="btn gold sm" data-a="make_admin" data-u="${esc(u.username)}">Tornar admin</button>`}
             <button class="btn danger sm" data-a="block" data-u="${esc(u.username)}">Bloquear</button>`
        }</div></td></tr>`).join("")}</tbody></table></div>`;
  }

  function render() {
    if (users === null) { el.innerHTML = `<div class="page-head"><h1>Usuários</h1></div><p class="muted">Carregando…</p>`; if (!loading) load(); return; }
    const pend = users.filter((u) => u.status === "pending"), ok = users.filter((u) => u.status === "approved"), bl = users.filter((u) => u.status === "blocked");
    el.innerHTML = `
      <div class="page-head"><div class="grow"><h1>Usuários</h1><div class="sub">Quem cria acesso fica aguardando sua aprovação. Usuários aprovados só podem lançar placares de jogos sem resultado.</div></div>
        <button class="btn" id="reload">↻ Atualizar</button></div>
      <div class="stack">
        <div class="card" style="${pend.length ? "border-color:var(--gold)" : ""}"><h3>⏳ Aguardando aprovação (${pend.length})</h3>${rowsHtml(pend, "pending")}</div>
        <div class="card"><h3>✅ Aprovados (${ok.length})</h3>
          <p class="muted small" style="margin:-4px 0 6px">Administrador principal: <b>${esc(main)}</b> (senha definida no Netlify, em ADMIN_PASSWORD).</p>${rowsHtml(ok, "approved")}</div>
        <div class="card"><h3>⛔ Bloqueados (${bl.length})</h3>${rowsHtml(bl, "blocked")}</div>
        <div class="card"><h3>O que cada perfil pode fazer</h3><table class="tbl"><thead><tr><th></th><th class="c">Administrador</th><th class="c">Lançador de placares</th></tr></thead><tbody>
          <tr><td>Ver painel, tabelas, chaveamento, indicadores e gerar PDF</td><td class="c">✔</td><td class="c">✔</td></tr>
          <tr><td>Lançar placar de jogo sem resultado (aba Lançamentos/Placares)</td><td class="c">✔</td><td class="c">✔</td></tr>
          <tr><td>Alterar ou apagar placar já lançado</td><td class="c">✔</td><td class="c">—</td></tr>
          <tr><td>Cadastrar jogadores, equipes, escudos e campeonatos</td><td class="c">✔</td><td class="c">—</td></tr>
          <tr><td>Aprovar usuários, backup e importação</td><td class="c">✔</td><td class="c">—</td></tr></tbody></table></div>
      </div>`;
    el.querySelector("#reload").addEventListener("click", load);
    el.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", async () => {
      const u = b.dataset.u, a = b.dataset.a;
      if (a === "reset_password") {
        const p = await promptDialog("Redefinir senha", `Nova senha para ${u} (mín. 6 caracteres):`, { type: "text", ok: "Salvar" });
        if (p) act(u, a, { password: p });
        return;
      }
      const txt = { delete: `Excluir o acesso de ${u}?`, block: `Bloquear ${u}? A pessoa sai do sistema na hora.`, make_admin: `Tornar ${u} administrador? Ele poderá alterar tudo, inclusive aprovar usuários.` }[a];
      if (txt && !(await confirmDialog("Confirmar", txt, { ok: "Confirmar", danger: a !== "make_admin" }))) return;
      act(u, a);
    }));
  }

  return { mount(e) { el = e; render(); }, refresh() { /* lista de usuários tem botão próprio de atualizar */ } };
}
