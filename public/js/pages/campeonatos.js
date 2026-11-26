// Campeonatos: criação (todos os formatos) e lista
import { S, op, isAdmin } from "../ctx.js";
import { esc, toast, run, confirmDialog, seg, bindSeg, norm, plural } from "../ui.js";
import * as C from "../core.js";

export function create(ctx) {
  let el, selT = null;
  const admin = isAdmin();
  const F = {
    name: "", season: String(new Date().getFullYear()), game: "futebol", size: 1, fmt: "liga", double: false,
    pts: [3, 1, 0], ng: 2, q: 2, third: false, shuffle: true, meta: C.META_PADRAO, days: 20, dpw: 5, turnos: 0,
    final: "auto", checked: new Set(), filter: "", lastKey: "futebol:false",
  };

  const isMeta = () => C.usaMeta(F.game, F.fmt);
  function applyDefaults() {
    const key = `${F.game}:${isMeta()}`;
    if (key !== F.lastKey) { F.lastKey = key; F.pts = C.pontuacaoPadrao(F.game, F.fmt); }
  }

  function participants() {
    if (F.size === 1) return S.db.players({ onlyActive: true }).map((p) => [p.id, p.name]);
    return S.db.teams(F.size).map((t) => [t.id, `${t.name} — ${S.db.teamMembers(t.id).map((p) => p.name).join(", ")}`]);
  }

  function confrontos(chave, classif) {
    const ordem = C.seedOrder(chave), pares = [];
    for (let i = 0; i < chave; i += 2) { const a = ordem[i], b = ordem[i + 1]; if (a <= classif && b <= classif) pares.push([Math.min(a, b), Math.max(a, b)]); }
    return pares.sort((x, y) => x[0] - y[0]);
  }

  function planText() {
    const n = F.checked.size;
    if (isMeta()) {
      if (n < 2) return ["Marque os participantes para ver o plano.", "muted"];
      try {
        const p = C.planMeta(n, F.meta, F.pts[0]);
        return [`🎯 Objetivo: ${p.objetivo} pontos (se vencesse todas as ${p.meta} partidas)\nCada participante joga ${p.meta} partidas · ${p.rounds} rodadas · ${p.games} jogos no total\nCampeão: quem somar mais pontos ao final das partidas.`, ""];
      } catch (e) { return ["⚠ " + e.message, "warn"]; }
    }
    if (F.fmt !== "dias") return ["", ""];
    try {
      const p = C.planDays(n, F.days, F.final, F.turnos);
      const fases = p.fases;
      const final = fases.map((f, i) => `dia ${p.days - fases.length + 1 + i}: ${f}`).join(" · ");
      let chave = `🏆 Mata-mata: os ${p.classificados} melhores do ciclo${p.fora ? ` (${p.fora} fica(m) fora)` : ""}${p.folgas ? ` · ${p.folgas} melhor(es) colocado(s) avançam direto na 1ª fase` : ""}`;
      if (p.chave > 2) chave += `\n1ª fase: ${confrontos(p.chave, p.classificados).map(([a, b]) => `${a}º x ${b}º`).join(", ")}`;
      const dist = {};
      p.per_day.forEach((k) => (dist[k] = (dist[k] || 0) + 1));
      const distTxt = Object.entries(dist).sort((a, b) => a[0] - b[0]).map(([k, q]) => `${q} dia(s) com ${k} rodada(s)`).join(", ");
      let txt = `📅 Plano: ${p.cycle} dia(s) de ciclo + ${final}\n${chave}\n${p.turnos} turno(s) de todos contra todos = ${p.total_rounds} rodadas · ${p.games} jogos\nCada participante joga ${p.games_per_team} vezes no ciclo · ${distTxt}`;
      if (p.empty_days) txt += `\n⚠ ${p.empty_days} dia(s) ficariam sem jogos — use Turnos = 0 (automático).`;
      return [txt, p.empty_days ? "warn" : ""];
    } catch (e) { return ["⚠ " + e.message, "warn"]; }
  }

  function ruleText() {
    if (isMeta()) return "Brasileirão com meta: partidas até 2 pontos (2x0 ou 2x1), sem empate. Vitória vale 3 pontos, derrota 0. Cada participante joga a meta de partidas; vence quem somar mais pontos.";
    if (C.ate2Pontos(F.game)) return "Partidas até 2 pontos (2x0 ou 2x1), sem empate. Vitória vale 2 pontos na tabela.";
    return "";
  }

  function formHtml() {
    applyDefaults();
    const fmt = F.fmt, meta = isMeta();
    const [pt, pk] = planText();
    const parts = participants();
    const q = norm(F.filter);
    const num = (id, label, val, extra = "") => `<label class="field"><span>${label}</span><input type="number" data-f="${id}" value="${esc(val)}" ${extra}></label>`;
    return `<h3>Novo campeonato</h3>
      <label class="field"><span>Nome</span><input type="text" data-f="name" maxlength="80" value="${esc(F.name)}"></label>
      <label class="field"><span>Temporada</span><input type="text" data-f="season" maxlength="20" value="${esc(F.season)}"></label>
      <div class="field"><span>Modalidade</span>${seg("game", Object.entries(C.MODALIDADES), F.game)}</div>
      ${ruleText() ? `<div class="rule">${esc(ruleText())}</div>` : ""}
      <label class="field"><span>Categoria</span><select data-f="size">${Object.entries(C.CATEGORIAS).map(([k, v]) => `<option value="${k}" ${+k === F.size ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="field"><span>Formato</span><select data-f="fmt">${Object.entries(C.FORMATOS).map(([k, v]) => `<option value="${k}" ${k === fmt ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <div class="opts">
        <label class="switch"><input type="checkbox" data-f="double" ${F.double ? "checked" : ""} ${fmt === "mata" || fmt === "dias" || meta ? "disabled" : ""}> Turno e returno (ida e volta)</label>
        <div class="row">${num("pv", "Vitória", F.pts[0], fmt === "mata" ? "disabled" : "")}${num("pe", "Empate", F.pts[1], fmt === "mata" || C.ate2Pontos(F.game) ? "disabled" : "")}${num("pd", "Derrota", F.pts[2], fmt === "mata" ? "disabled" : "")}</div>
        ${fmt === "grupos" || fmt === "grupos_mata" ? `<div class="row">${num("ng", "Nº de grupos", F.ng, 'min="1"')}${num("q", "Classif./grupo", F.q, fmt === "grupos_mata" ? 'min="1"' : "disabled")}</div>` : ""}
        ${meta ? `<div class="row" style="align-items:center">${num("meta", "Meta de vitórias", F.meta, 'min="1"')}<b class="gold" style="padding-top:12px">= objetivo de ${(+F.meta || 0) * (+F.pts[0] || 0)} pontos</b></div>` : ""}
        ${fmt === "dias" ? `<div class="row">${num("days", "Nº de dias", F.days, 'min="2"')}${num("dpw", "Dias/semana", F.dpw, 'min="1"')}${num("turnos", "Turnos (0=auto)", F.turnos, 'min="0"')}</div>
          <label class="field"><span>Fase final</span><select data-f="final">${Object.entries(C.FINAL_MODES).map(([k, v]) => `<option value="${k}" ${k === F.final ? "selected" : ""}>${v}</option>`).join("")}</select></label>` : ""}
        ${["mata", "grupos_mata", "dias"].includes(fmt) ? `<label class="switch"><input type="checkbox" data-f="third" ${F.third ? "checked" : ""}> Disputa de 3º lugar</label>` : ""}
        <label class="switch"><input type="checkbox" data-f="shuffle" ${F.shuffle ? "checked" : ""}> Sortear ordem / grupos</label>
      </div>
      <div class="plan ${pk}" id="plan">${esc(pt)}</div>
      <div class="small b green" id="pcount">Participantes (${F.size === 1 ? "jogadores" : "equipes"}): ${F.checked.size} marcados</div>
      <div class="row" style="margin:6px 0;align-items:center"><input type="search" data-f="filter" placeholder="🔎 Filtrar" value="${esc(F.filter)}" style="flex:1">
        <button class="btn sm" data-all>Todos</button><button class="btn sm" data-none>Nenhum</button></div>
      <div class="checklist" id="pchecks">${parts.filter(([, l]) => !q || norm(l).includes(q)).map(([id, l]) => `<label><input type="checkbox" data-pid="${id}" ${F.checked.has(id) ? "checked" : ""}>${esc(l)}</label>`).join("") || `<p class="muted small" style="padding:6px">Cadastre ${F.size === 1 ? "jogadores" : "equipes desta categoria"} primeiro.</p>`}</div>
      <button class="btn primary big block" style="margin-top:10px" data-create>🏆 Criar campeonato</button>`;
  }

  function listHtml() {
    const ts = S.db.tournaments();
    return `<h3>Campeonatos cadastrados</h3>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Campeonato</th><th>Jogo</th><th class="c">Temp.</th><th class="c">Categoria</th><th>Formato</th><th class="c">Part.</th><th class="c">Jogos</th><th class="c">Status</th><th>Campeão</th></tr></thead><tbody>
      ${ts.map((t) => {
        const ms = S.db.s.matches.filter((m) => m.tournament_id === t.id && !m.is_bye);
        const np = S.db.s.tteams.filter((x) => x.tournament_id === t.id).length;
        const champ = t.champion_id ? S.db.teamName(t.champion_id) : "";
        return `<tr class="click ${champ ? "r-gold" : ""} ${selT === t.id ? "sel" : ""}" data-id="${t.id}"><td class="b">${esc(t.name)}</td><td>${esc(C.MODALIDADES[t.game])}</td><td class="c">${esc(t.season)}</td>
          <td class="c">${esc(C.CATEGORIAS[t.size])}</td><td>${esc(C.FORMATO_CURTO[t.format])}</td><td class="c">${np}</td><td class="c">${ms.filter((m) => m.played).length}/${ms.length}</td>
          <td class="c">${esc(t.status)}</td><td>${champ ? "🏆 " + esc(champ) : ""}</td></tr>`;
      }).join("")}</tbody></table>${ts.length ? "" : `<p class="muted" style="padding:10px">Nenhum campeonato ainda.</p>`}</div>
      <div class="btns" style="margin-top:10px">
        ${admin ? `<button class="btn" data-go="partidas">⚽ Partidas</button>` : `<button class="btn" data-go="lancamentos">📝 Lançamentos</button>`}
        <button class="btn" data-go="classificacao">📊 Classificação</button><button class="btn" data-go="chaveamento">🗂 Chaveamento</button>
        ${admin ? `<button class="btn danger" style="margin-left:auto" data-delt ${selT ? "" : "disabled"}>Excluir</button>` : ""}
      </div><p class="muted small">Clique em um campeonato e depois no botão da aba que quer abrir (duplo clique abre a classificação).</p>`;
  }

  function render() {
    if (selT && !S.db.tournament(selT)) selT = null;
    el.innerHTML = `<div class="page-head"><div class="grow"><h1>Campeonatos</h1><div class="sub">Pontos corridos, fase de grupos, mata-mata, Copa (grupos + mata-mata) ou por dias</div></div></div>
      <div class="${admin ? "cols-side" : ""}">${admin ? `<div class="card" id="form">${formHtml()}</div>` : ""}<div class="card" id="list">${listHtml()}</div></div>`;
    bindList();
    if (admin) bindForm();
  }

  function rerenderForm(focusSel = null) {
    const f = el.querySelector("#form");
    const scroll = f.scrollTop;
    f.innerHTML = formHtml();
    f.scrollTop = scroll;
    bindForm();
    if (focusSel) { const i = f.querySelector(focusSel); if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch { /* number */ } } }
  }

  function bindForm() {
    const f = el.querySelector("#form");
    bindSeg(f, "game", (v) => { F.game = v; rerenderForm(); });
    f.querySelectorAll("[data-f]").forEach((i) => {
      const k = i.dataset.f;
      const ev = i.type === "checkbox" || i.tagName === "SELECT" ? "change" : "input";
      i.addEventListener(ev, () => {
        const v = i.type === "checkbox" ? i.checked : i.value;
        if (k === "pv") F.pts[0] = v; else if (k === "pe") F.pts[1] = v; else if (k === "pd") F.pts[2] = v;
        else if (k === "size") { F.size = +v; F.checked = new Set(); }
        else F[k] = v;
        if (["size", "fmt", "filter"].includes(k)) rerenderForm(k === "filter" ? '[data-f="filter"]' : null);
        else if (["meta", "days", "turnos", "pv", "final", "q", "ng"].includes(k)) updatePlan();
      });
    });
    f.querySelector("#pchecks").addEventListener("change", (e) => {
      const id = +e.target.dataset.pid;
      if (!id) return;
      e.target.checked ? F.checked.add(id) : F.checked.delete(id);
      updatePlan();
    });
    const setAll = (on) => { f.querySelectorAll("#pchecks [data-pid]").forEach((c) => { c.checked = on; on ? F.checked.add(+c.dataset.pid) : F.checked.delete(+c.dataset.pid); }); updatePlan(); };
    f.querySelector("[data-all]").addEventListener("click", () => setAll(true));
    f.querySelector("[data-none]").addEventListener("click", () => setAll(false));
    f.querySelector("[data-create]").addEventListener("click", async (e) => {
      const args = {
        name: F.name, season: F.season, size: F.size, fmt: F.fmt, teamIds: [...F.checked], doubleRound: !!F.double && F.fmt !== "mata" && !isMeta(),
        pts: F.pts.map((x) => parseInt(x, 10) || 0), nGroups: parseInt(F.ng, 10), qualifiers: parseInt(F.q, 10), thirdPlace: !!F.third,
        doShuffle: !!F.shuffle, days: F.fmt === "dias" ? parseInt(F.days, 10) : 0, daysPerWeek: parseInt(F.dpw, 10) || 5,
        finalMode: F.final, turnos: parseInt(F.turnos, 10) || 0, game: F.game, meta: isMeta() ? parseInt(F.meta, 10) || 0 : 0,
      };
      const [ok, tid] = await run(() => op("createTournament", args), e.target);
      if (ok) {
        S.tid = tid; F.name = ""; F.checked = new Set();
        toast("Campeonato criado! O chaveamento completo já está pronto para lançar resultados ou gerar o PDF.", "ok", 5000);
        ctx.go("chaveamento");
      }
    });
  }

  function updatePlan() {
    const [pt, pk] = planText();
    const p = el.querySelector("#plan");
    if (p) { p.textContent = pt; p.className = `plan ${pk}`; }
    const c = el.querySelector("#pcount");
    if (c) c.textContent = `Participantes (${F.size === 1 ? "jogadores" : "equipes"}): ${F.checked.size} marcados`;
    const obj = el.querySelector(".opts b.gold");
    if (obj) obj.textContent = `= objetivo de ${(+F.meta || 0) * (+F.pts[0] || 0)} pontos`;
  }

  function bindList() {
    const l = el.querySelector("#list");
    l.querySelectorAll("tr[data-id]").forEach((r) => {
      r.addEventListener("click", () => { selT = +r.dataset.id; S.tid = selT; l.innerHTML = listHtml(); bindList(); });
      r.addEventListener("dblclick", () => { S.tid = +r.dataset.id; ctx.go("classificacao"); });
    });
    l.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => { if (selT) S.tid = selT; ctx.go(b.dataset.go); }));
    l.querySelector("[data-delt]")?.addEventListener("click", async () => {
      const t = S.db.tournament(selT);
      if (!t || !(await confirmDialog("Excluir campeonato", `Excluir "${t.name}" e todas as partidas?\nEssa ação não pode ser desfeita.`, { ok: "Excluir", danger: true }))) return;
      const [ok] = await run(() => op("deleteTournament", { id: selT }));
      if (ok) { selT = null; toast("Campeonato excluído."); render(); }
    });
  }

  return { mount(e) { el = e; render(); }, refresh() { if (!el.querySelector("#form")) return render(); el.querySelector("#list").innerHTML = listHtml(); bindList(); } };
}
