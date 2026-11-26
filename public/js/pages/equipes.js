// Equipes: duplas, trios e times de 11 — manual ou sorteio, com escudo
import { S, op, isAdmin, putLogo, deleteLogo } from "../ctx.js";
import { esc, toast, run, confirmDialog, seg, bindSeg, logo, cropImage, norm, corDoNome, iniciais, logoUrl, showError } from "../ui.js";
import * as C from "../core.js";

const SIZES = [[2, "Duplas"], [3, "Trios"], [11, "Times de 11"]];

export function create() {
  let el, size = 2, sel = null, filter = "", checked = new Set(), logoData; // logoData: undefined=sem mudança, null=remover, string=nova
  let nameDraft = "";
  const admin = isAdmin();

  const logoPreview = () => {
    const t = sel ? S.db.team(sel) : null;
    if (logoData) return `<img class="logo lg" src="${logoData}" alt="">`;
    if (logoData === undefined && t?.logo) return `<img class="logo lg" src="${logoUrl(t)}" alt="">`;
    const nm = nameDraft || t?.name || "?";
    return `<span class="logo ph lg" style="background:${corDoNome(nm)}">${esc(iniciais(nm))}</span>`;
  };

  function checklistHtml() {
    const q = norm(filter);
    return S.db.players({ onlyActive: true }).filter((p) => !q || norm(p.name).includes(q) || norm(p.nickname).includes(q))
      .map((p) => `<label><input type="checkbox" data-pid="${p.id}" ${checked.has(p.id) ? "checked" : ""}>${esc(p.name)}${p.nickname ? ` <span class="muted">(${esc(p.nickname)})</span>` : ""}</label>`).join("")
      || `<p class="muted small" style="padding:6px">Nenhum jogador ativo encontrado.</p>`;
  }
  const countHtml = () => `<span style="color:${checked.size === size ? "var(--accent)" : "var(--gold)"}">${checked.size} selecionado(s) · equipe = ${size} jogador(es)</span>`;

  function render() {
    const t = sel ? S.db.team(sel) : null;
    if (sel && !t) { sel = null; }
    const stats = new Map(S.db.teamStats({ size }).map((s) => [s.team_id, s]));
    const teams = S.db.teams(size);
    el.innerHTML = `
      <div class="page-head"><div class="grow"><h1>Equipes</h1><div class="sub">${admin ? "Monte duplas, trios e times de 11 manualmente ou por sorteio" : "Equipes cadastradas"}</div></div></div>
      <div class="toolbar">${seg("size", SIZES, size)}</div>
      <div class="${admin ? "cols-side" : ""}">
        ${admin ? `<div class="card">
          <h3>${t ? "Editar equipe" : "Montar equipe"}</h3>
          <div class="logo-box"><span id="logo-prev">${logoPreview()}</span>
            <div style="flex:1"><b>Escudo / foto</b>
              <label class="btn primary block" style="margin:6px 0">📷 Escolher foto<input type="file" accept="image/*" id="logo-file" hidden></label>
              <button class="btn sm block" data-rmlogo>Remover</button></div></div>
          <label class="field"><span>Nome da equipe</span><input type="text" id="t-name" maxlength="60" value="${esc(nameDraft || t?.name || "")}"></label>
          <input type="search" id="p-filter" placeholder="🔎  Filtrar jogadores" value="${esc(filter)}" style="margin-bottom:6px">
          <div class="small b" id="count" style="margin-bottom:4px">${countHtml()}</div>
          <div class="checklist" id="checks">${checklistHtml()}</div>
          <div class="btns" style="margin-top:8px"><button class="btn primary" data-save>Salvar</button><button class="btn" data-new>Novo</button>
            <button class="btn danger" data-del ${t ? "" : "disabled"}>Excluir</button></div>
          <button class="btn purple block" style="margin-top:8px" data-draw>🎲 Sortear equipes com os marcados</button>
        </div>` : ""}
        <div class="card">
          <h3 style="color:${{ 2: "var(--purple)", 3: "var(--cyan)", 11: "var(--accent)" }[size]}">${esc(C.CATEGORIAS[size])} cadastradas (${teams.length})</h3>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Equipe</th><th>Jogadores</th><th class="c">J</th><th class="c">V</th><th class="c">Pts</th><th class="c">Aprov.</th></tr></thead><tbody>
          ${teams.map((tm) => { const s = stats.get(tm.id) || {};
            return `<tr class="${admin ? "click" : ""} ${sel === tm.id ? "sel" : ""}" data-id="${tm.id}"><td class="b"><span class="tn">${logo(tm)}<span>${esc(tm.name)}</span></span></td>
              <td class="wrap">${esc(S.db.teamMembers(tm.id).map((p) => p.name).join(", "))}</td><td class="c">${s.j || 0}</td><td class="c">${s.v || 0}</td><td class="c b">${s.pts || 0}</td><td class="c">${(s.aprov || 0).toFixed(0)}%</td></tr>`; }).join("")}
          </tbody></table>${teams.length ? "" : `<p class="muted" style="padding:10px">Nenhuma equipe nesta categoria.</p>`}</div>
        </div>
      </div>`;
    bind();
  }

  function startNew() { sel = null; checked = new Set(); logoData = undefined; nameDraft = ""; render(); }

  function bind() {
    bindSeg(el, "size", (v) => { size = +v; startNew(); });
    if (!admin) return;
    el.querySelectorAll("tr[data-id]").forEach((r) => r.addEventListener("click", () => {
      sel = +r.dataset.id; const t = S.db.team(sel);
      checked = new Set(t.members); logoData = undefined; nameDraft = t.name; render();
    }));
    const name = el.querySelector("#t-name");
    name.addEventListener("input", () => { nameDraft = name.value; if (!logoData && !(logoData === undefined && sel && S.db.team(sel)?.logo)) el.querySelector("#logo-prev").innerHTML = logoPreview(); });
    const pf = el.querySelector("#p-filter");
    pf.addEventListener("input", () => { filter = pf.value; el.querySelector("#checks").innerHTML = checklistHtml(); });
    el.querySelector("#checks").addEventListener("change", (e) => {
      const pid = +e.target.dataset.pid;
      if (!pid) return;
      e.target.checked ? checked.add(pid) : checked.delete(pid);
      el.querySelector("#count").innerHTML = countHtml();
    });
    el.querySelector("#logo-file").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { logoData = await cropImage(f); el.querySelector("#logo-prev").innerHTML = logoPreview(); }
      catch (err) { showError(err); }
    });
    el.querySelector("[data-rmlogo]").addEventListener("click", () => { logoData = null; el.querySelector("#logo-prev").innerHTML = logoPreview(); });
    el.querySelector("[data-new]").addEventListener("click", startNew);
    el.querySelector("[data-save]").addEventListener("click", async (e) => {
      const [ok] = await run(async () => {
        const nm = el.querySelector("#t-name").value;
        let id = sel;
        if (sel) await op("updateTeam", { id: sel, name: nm, playerIds: [...checked] });
        else id = await op("addTeam", { name: nm, size, playerIds: [...checked] });
        if (logoData) await putLogo(id, logoData);
        else if (logoData === null && S.db.team(id)?.logo) await deleteLogo(id);
      }, e.target);
      if (ok) { toast(sel ? "Equipe atualizada." : "Equipe cadastrada."); startNew(); }
    });
    el.querySelector("[data-del]").addEventListener("click", async () => {
      if (!sel || !(await confirmDialog("Excluir equipe", "Excluir esta equipe?", { ok: "Excluir", danger: true }))) return;
      const [ok] = await run(() => op("deleteTeam", { id: sel }));
      if (ok) { toast("Equipe excluída."); startNew(); }
    });
    el.querySelector("[data-draw]").addEventListener("click", async (e) => {
      let ids = [...checked];
      if (!ids.length) {
        if (!(await confirmDialog("Sortear", "Nenhum jogador marcado. Sortear com TODOS os jogadores ativos?", { ok: "Sortear" }))) return;
        ids = S.db.players({ onlyActive: true }).map((p) => p.id);
      }
      const [ok, r] = await run(() => op("drawTeams", { playerIds: ids, size }), e.target);
      if (ok) {
        toast(`${r.created} equipe(s) criada(s).${r.leftover.length ? `\nSobraram sem equipe: ${r.leftover.join(", ")}` : ""}`, "ok", 7000);
        startNew();
      }
    });
  }

  return { mount(e) { el = e; render(); }, refresh: render };
}
