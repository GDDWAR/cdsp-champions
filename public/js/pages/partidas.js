// Partidas (admin): todos os jogos; altera qualquer placar
import { S, op, currentTid } from "../ctx.js";
import { esc, toast, run, seg, bindSeg, tournamentSelect, teamCell, fmtScore, sideName, quickScores, scorersDialog, logo, fmtDateTime } from "../ui.js";
import * as C from "../core.js";

export function create() {
  let el, filter = "Todas", sel = null, scorers = {};

  function rowsHtml(tid, labels) {
    const ms = S.db.matches(tid);
    return ms.map((m, i) => {
      if (filter === "Pendentes" && m.played) return "";
      if (filter === "Jogadas" && !m.played) return "";
      const ready = m.home_id && m.away_id;
      let st, cls;
      if (m.is_bye) { st = "Folga"; cls = "r-muted"; }
      else if (m.played) { st = "✔ Jogada"; cls = ""; }
      else if (ready) { st = "Pendente"; cls = "r-pend"; }
      else { st = "Aguardando"; cls = "r-muted"; }
      const h = sideName(m, "home", labels), a = sideName(m, "away", labels);
      return `<tr class="click ${cls} ${sel === m.id ? "sel" : ""}" data-id="${m.id}" data-pend="${!m.played && ready && !m.is_bye ? 1 : 0}">
        <td class="c">${m.day ?? ""}</td><td>${esc(m.round_name)}</td><td class="c">${esc(m.group_name)}</td>
        <td class="r">${h.id ? teamCell(h.id) : `<i class="muted">${esc(h.name)}</i>`}</td><td class="c b">${esc(fmtScore(m))}</td>
        <td>${a.id ? teamCell(a.id) : `<i class="muted">${esc(a.name)}</i>`}</td><td class="c">${st}</td><td class="muted small">${esc(m.played_by || "")}</td></tr>`;
    }).join("");
  }

  function panelHtml(tid, labels) {
    const m = sel ? S.db.match(sel) : null;
    if (!m || m.tournament_id !== tid) return `<h3>Lançar resultado</h3><p class="muted">Selecione uma partida na lista.</p>`;
    const t = S.db.tournament(tid);
    const h = sideName(m, "home", labels), a = sideName(m, "away", labels);
    const ready = !!(m.home_id && m.away_id) && !m.is_bye;
    const two = C.ate2Pontos(t.game), pens = m.stage === "mata" && C.temPenaltis(t.game);
    const big = "width:70px;height:56px;font-size:28px;font-weight:800;text-align:center";
    return `<h3>Lançar resultado</h3>
      <div class="muted small">${esc((m.day ? `Dia ${m.day} · ` : "") + m.round_name + (m.group_name ? ` · Grupo ${m.group_name}` : ""))}</div>
      <div class="opts" style="text-align:center;margin-top:8px">
        <div class="b" style="display:flex;gap:8px;justify-content:center;align-items:center">${h.id ? logo(h.id, "md") : ""}<span>${esc(h.name)}</span></div>
        <div style="display:flex;justify-content:center;align-items:center;gap:10px;margin:8px 0">
          <input type="number" min="0" id="hs" value="${m.home_score ?? ""}" style="${big}" ${ready ? "" : "disabled"}><b class="muted" style="font-size:22px">×</b>
          <input type="number" min="0" id="as" value="${m.away_score ?? ""}" style="${big}" ${ready ? "" : "disabled"}></div>
        <div class="b" style="display:flex;gap:8px;justify-content:center;align-items:center">${a.id ? logo(a.id, "md") : ""}<span>${esc(a.name)}</span></div>
      </div>
      ${two && ready ? `<div class="rule">Partida até 2 pontos — clique no placar:</div>${quickScores()}` : ""}
      ${pens && ready ? `<div class="row" style="align-items:center;margin-top:8px"><span class="gold small">Pênaltis (se empatar):</span>
        <input type="number" min="0" id="hp" value="${m.home_pen ?? ""}" style="width:56px;text-align:center"><span class="muted">×</span>
        <input type="number" min="0" id="ap" value="${m.away_pen ?? ""}" style="width:56px;text-align:center"></div>` : ""}
      ${ready && t.game === "futebol" && S.db.team(m.home_id)?.size > 1 ? `<button class="btn block" style="margin-top:8px" id="b-sc">🎯 Gols por jogador (opcional)</button><div class="muted small" id="sc-txt"></div>` : ""}
      ${!ready ? `<p class="gold small">${m.is_bye ? "Folga: o participante avança direto." : "Aguardando a definição dos participantes."}</p>` : ""}
      ${m.played_by ? `<p class="muted small">Lançado por <b>${esc(m.played_by)}</b> em ${esc(fmtDateTime(m.played_at))}</p>` : ""}
      <button class="btn primary big block" style="margin-top:10px" id="b-save" ${ready ? "" : "disabled"}>✔ Salvar resultado</button>
      <button class="btn danger block" style="margin-top:6px" id="b-clear" ${m.played && !m.is_bye ? "" : "disabled"}>Limpar resultado</button>`;
  }

  function scorersText() {
    const names = Object.entries(scorers).filter(([, q]) => q).map(([pid, q]) => `${S.db.player(+pid)?.name || "?"} (${q})`);
    const t = el.querySelector("#sc-txt");
    if (t) t.textContent = names.length ? "Gols: " + names.join(", ") : "";
  }

  function render() {
    const tid = currentTid();
    const t = tid ? S.db.tournament(tid) : null;
    const labels = tid ? S.db.matchLabels(tid) : new Map();
    const ms = tid ? S.db.matches(tid) : [];
    const done = ms.filter((m) => m.played && !m.is_bye).length, total = ms.filter((m) => !m.is_bye).length;
    const needKO = t && t.format === "grupos_mata" && !ms.some((m) => m.stage === "mata");
    el.innerHTML = `
      <div class="page-head"><div class="grow"><h1>Partidas e resultados</h1><div class="sub">Somente o administrador vê esta aba e pode alterar placares já lançados</div></div></div>
      <div class="toolbar"><span class="muted">Campeonato:</span>${tournamentSelect(tid)}${seg("flt", ["Todas", "Pendentes", "Jogadas"], filter)}
        ${needKO ? `<button class="btn gold" id="b-ko">➡ Gerar mata-mata</button>` : ""}</div>
      ${t ? `<div class="cols-main-side">
        <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="c">Dia</th><th>Fase / rodada</th><th class="c">Grupo</th><th class="r">Mandante</th><th class="c">Placar</th><th>Visitante</th><th class="c">Status</th><th>Lançado por</th></tr></thead>
          <tbody id="rows">${rowsHtml(tid, labels)}</tbody></table></div>
          <div class="muted small" style="margin-top:8px">${done} de ${total} partidas jogadas · ${esc(t.status)}</div></div>
        <div class="card" id="panel">${panelHtml(tid, labels)}</div>
      </div>` : `<div class="card"><p class="muted">Crie um campeonato para começar.</p></div>`}`;
    bind(tid);
  }

  function bind(tid) {
    el.querySelector("#sel-t")?.addEventListener("change", (e) => { S.tid = +e.target.value; sel = null; render(); });
    bindSeg(el, "flt", (v) => { filter = v; render(); });
    el.querySelector("#b-ko")?.addEventListener("click", async (e) => {
      const [ok] = await run(() => op("generateKnockout", { id: tid }), e.target);
      if (ok) toast("Chave do mata-mata gerada com os classificados!");
    });
    if (!tid) return;
    el.querySelectorAll("#rows tr[data-id]").forEach((r) => r.addEventListener("click", () => {
      sel = +r.dataset.id; scorers = S.db.matchScorers(sel);
      el.querySelectorAll("#rows tr").forEach((x) => x.classList.toggle("sel", x === r));
      el.querySelector("#panel").innerHTML = panelHtml(tid, S.db.matchLabels(tid));
      bindPanel(tid);
      el.querySelector("#hs")?.focus();
    }));
    bindPanel(tid);
    const s = el.querySelector("#rows tr.sel") || el.querySelector('#rows tr[data-pend="1"]');
    s?.scrollIntoView({ block: "nearest" });
  }

  async function save(tid, hs, as) {
    const cur = sel;
    const hp = el.querySelector("#hp")?.value ?? null, ap = el.querySelector("#ap")?.value ?? null;
    const [ok] = await run(() => op("saveResult", { id: cur, hs, as, hp: hp === "" ? null : hp, ap: ap === "" ? null : ap, scorers }), el.querySelector("#b-save"));
    if (!ok) return;
    toast("Resultado salvo.");
    // avança para o próximo jogo pendente
    const ms = S.db.matches(tid);
    const idx = ms.findIndex((m) => m.id === cur);
    const nxt = ms.slice(idx + 1).find((m) => !m.played && !m.is_bye && m.home_id && m.away_id);
    sel = nxt ? nxt.id : null;
    scorers = sel ? S.db.matchScorers(sel) : {};
    render();
    el.querySelector("#hs")?.focus();
    const t = S.db.tournament(tid);
    if (t.champion_id) toast(`🏆 ${S.db.teamName(t.champion_id)} é o campeão de ${t.name}!`, "ok", 7000);
  }

  function bindPanel(tid) {
    const p = el.querySelector("#panel");
    if (!p) return;
    p.querySelector("#b-save")?.addEventListener("click", () => save(tid, p.querySelector("#hs").value, p.querySelector("#as").value));
    p.querySelectorAll("[data-quick]").forEach((b) => b.addEventListener("click", () => { const [x, y] = b.dataset.quick.split("-"); save(tid, x, y); }));
    p.querySelectorAll("input").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") p.querySelector("#b-save").click(); }));
    p.querySelector("#b-sc")?.addEventListener("click", async () => { const r = await scorersDialog(S.db.match(sel), scorers); if (r) { scorers = r; scorersText(); } });
    p.querySelector("#b-clear")?.addEventListener("click", async (e) => {
      const [ok] = await run(() => op("clearResult", { id: sel }), e.target);
      if (ok) { toast("Resultado apagado."); scorers = {}; render(); }
    });
    scorersText();
  }

  return { mount(e) { el = e; render(); }, refresh: render };
}
