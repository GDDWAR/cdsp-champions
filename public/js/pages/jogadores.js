// Jogadores: cadastro individual, em lote e lista com desempenho
import { S, op, isAdmin } from "../ctx.js";
import { esc, toast, run, confirmDialog, norm } from "../ui.js";

export function create() {
  let el, sel = null, search = "";
  const admin = isAdmin();

  function listHtml() {
    const stats = new Map(S.db.playerStats().map((s) => [s.player_id, s]));
    const q = norm(search);
    const rows = S.db.players().filter((p) => !q || norm(p.name).includes(q) || norm(p.nickname).includes(q));
    return `<div class="toolbar" style="margin:0 0 8px"><input type="search" id="q" placeholder="🔎  Buscar jogador..." value="${esc(search)}" style="max-width:300px">
      <span class="muted" style="margin-left:auto">${rows.length} jogador(es)</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nome</th><th>Apelido</th><th>Posição</th><th class="c">Status</th><th class="c">J</th><th class="c">V</th><th class="c">Pts</th><th class="c">Gols</th><th class="c">🏆</th></tr></thead><tbody>
      ${rows.map((p) => { const s = stats.get(p.id) || {};
        return `<tr class="${admin ? "click" : ""} ${p.active ? "" : "r-muted"} ${sel === p.id ? "sel" : ""}" data-id="${p.id}"><td class="b">${esc(p.name)}</td><td>${esc(p.nickname)}</td><td>${esc(p.position)}</td>
        <td class="c">${p.active ? "Ativo" : "Inativo"}</td><td class="c">${s.j || 0}</td><td class="c">${s.v || 0}</td><td class="c b">${s.pts || 0}</td><td class="c">${s.gols || 0}</td><td class="c">${s.titles || 0}</td></tr>`; }).join("")}
      </tbody></table>${rows.length ? "" : `<p class="muted" style="padding:10px">Nenhum jogador encontrado.</p>`}</div>`;
  }

  function render() {
    const p = sel ? S.db.player(sel) : null;
    if (sel && !p) sel = null;
    el.innerHTML = `
      <div class="page-head"><div class="grow"><h1>Jogadores</h1><div class="sub">${admin ? "Cadastre individualmente ou cole uma lista de nomes" : "Lista de jogadores e desempenho"}</div></div></div>
      <div class="${admin ? "cols-side" : ""}">
        ${admin ? `<div class="stack">
          <form class="card" id="f-p"><h3>${p ? "Editar jogador" : "Cadastro"}</h3>
            <label class="field"><span>Nome *</span><input type="text" name="name" maxlength="80" value="${esc(p?.name)}"></label>
            <label class="field"><span>Apelido</span><input type="text" name="nickname" maxlength="40" value="${esc(p?.nickname)}"></label>
            <label class="field"><span>Posição / observação</span><input type="text" name="position" maxlength="60" value="${esc(p?.position)}"></label>
            <label class="switch"><input type="checkbox" name="active" ${!p || p.active ? "checked" : ""}> Ativo</label>
            <div class="btns"><button class="btn primary" type="submit">Salvar</button><button class="btn" type="button" data-new>Novo</button>
              <button class="btn danger" type="button" data-del ${p ? "" : "disabled"}>Excluir</button></div>
          </form>
          <div class="card"><h3>Cadastro em lote</h3><p class="muted small" style="margin:0 0 6px">Um nome por linha (nomes repetidos são ignorados)</p>
            <textarea id="bulk" rows="6"></textarea><button class="btn primary block" style="margin-top:8px" data-bulk>Cadastrar lista</button></div>
        </div>` : ""}
        <div class="card" id="list">${listHtml()}</div>
      </div>`;
    bind();
  }

  function bindList() {
    const list = el.querySelector("#list");
    const q = list.querySelector("#q");
    q.addEventListener("input", () => {
      search = q.value;
      const pos = q.selectionStart;
      list.innerHTML = listHtml();
      bindList();
      const nq = list.querySelector("#q");
      nq.focus(); nq.setSelectionRange(pos, pos);
    });
    if (admin) list.querySelectorAll("tr[data-id]").forEach((r) => r.addEventListener("click", () => { sel = +r.dataset.id; render(); }));
  }

  function bind() {
    bindList();
    if (!admin) return;
    const f = el.querySelector("#f-p");
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const [ok] = await run(() => (sel
        ? op("updatePlayer", { id: sel, name: d.name, nickname: d.nickname, position: d.position, active: d.active ? 1 : 0 })
        : op("addPlayer", { name: d.name, nickname: d.nickname, position: d.position })), f.querySelector("[type=submit]"));
      if (ok) { toast(sel ? "Jogador atualizado." : "Jogador cadastrado."); sel = null; render(); el.querySelector("[name=name]").focus(); }
    });
    f.querySelector("[data-new]").addEventListener("click", () => { sel = null; render(); el.querySelector("[name=name]").focus(); });
    f.querySelector("[data-del]").addEventListener("click", async () => {
      if (!sel || !(await confirmDialog("Excluir jogador", "Excluir este jogador? Ele será removido das equipes.", { ok: "Excluir", danger: true }))) return;
      const [ok] = await run(() => op("deletePlayer", { id: sel }));
      if (ok) { sel = null; toast("Jogador excluído."); render(); }
    });
    el.querySelector("[data-bulk]").addEventListener("click", async (e) => {
      const [ok, n] = await run(() => op("addPlayersBulk", { text: el.querySelector("#bulk").value }), e.target);
      if (ok) { toast(`${n} jogador(es) cadastrado(s).`); render(); }
    });
  }

  return { mount(e) { el = e; render(); }, refresh: render };
}
