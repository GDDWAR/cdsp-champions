// Classificação
import { S, currentTid } from "../ctx.js";
import { esc, tournamentSelect, logo, standingsStyle, legendHtml, formHtml } from "../ui.js";
import * as C from "../core.js";

export function standingsTable(t, rows, group = null, { compact = false } = {}) {
  const [pro, contra, saldo] = C.termos(t.game);
  const meta = t.meta || 0, semEmpate = C.ate2Pontos(t.game);
  const { tagOf, legend } = standingsStyle(t, rows, group);
  let cols = compact
    ? [["pos", "#"], ["nome", "Participante"], ["pts", "Pts"], ["j", "J"], ["v", "V"], ["e", "E"], ["d", "D"], ["sg", saldo]]
    : [["pos", "#"], ["nome", "Participante"], ["pts", "Pts"], ["j", "J"], ["v", "V"], ["e", "E"], ["d", "D"], ["gp", pro], ["gc", contra], ["sg", saldo], ["aprov", "%"], ["form", "Últimos 5"]];
  if (semEmpate) cols = cols.filter((c) => c[0] !== "e");
  if (meta) cols = cols.filter((c) => !["aprov", "form"].includes(c[0])).concat(compact ? [["max", "Máx."]] : [["rest", "Faltam"], ["max", "Máx."], ["obj", "% obj."], ["form", "Últimos 5"]]);
  const objetivo = meta * t.pts_win;
  const cell = (k, r) => {
    switch (k) {
      case "nome": return `<td><span class="tn">${logo(r.team_id)}<span>${esc(r.name)}</span></span></td>`;
      case "pts": return `<td class="c b">${r.pts}</td>`;
      case "aprov": return `<td class="c">${r.aprov.toFixed(0)}</td>`;
      case "form": return `<td class="c">${formHtml(r.form)}</td>`;
      case "rest": return `<td class="c">${meta - r.j}</td>`;
      case "max": return `<td class="c">${r.pts + (meta - r.j) * t.pts_win}</td>`;
      case "obj": return `<td class="c">${objetivo ? Math.round((100 * r.pts) / objetivo) : 0}%</td>`;
      default: return `<td class="c">${r[k]}</td>`;
    }
  };
  return `<div class="tbl-wrap free"><table class="tbl"><thead><tr>${cols.map(([k, l]) => `<th class="${k === "nome" ? "" : "c"}">${esc(l)}</th>`).join("")}</tr></thead><tbody>
    ${rows.map((r) => `<tr class="${tagOf(r)}">${cols.map(([k]) => cell(k, r)).join("")}</tr>`).join("")}</tbody></table></div>${legendHtml(legend)}`;
}

export function create() {
  let el;
  function render() {
    const tid = currentTid();
    const t = tid ? S.db.tournament(tid) : null;
    let body = "";
    if (t) {
      let main = "";
      if (t.format === "mata") main = `<div class="card"><p class="muted">Campeonato em mata-mata: veja a aba Chaveamento.</p></div>`;
      else if (t.format === "liga" || t.format === "dias") {
        let title = t.format === "liga" ? "Tabela — pontos corridos" : `Tabela do ciclo — ${t.days} dias (${C.descricaoFaseFinal(t.final_mode).toLowerCase()})`;
        if (t.meta) title = `Tabela — objetivo de ${t.meta * t.pts_win} pontos (${t.meta} partidas por participante)`;
        main = `<div class="card"><h3>${esc(title)}</h3>${standingsTable(t, S.db.standings(tid))}</div>`;
      } else main = S.db.groups(tid).map((g) => `<div class="card"><h3>Grupo ${esc(g)}</h3>${standingsTable(t, S.db.standings(tid, g), g)}</div>`).join("");
      let side;
      if (t.game !== "futebol") {
        const rk = S.db.playerStats({ tid }).sort((a, b) => b.v - a.v || b.aprov - a.aprov || a.name.localeCompare(b.name)).slice(0, 30);
        side = `<div class="card"><h3>🏅 Mais vitórias</h3><table class="tbl"><thead><tr><th class="c">#</th><th>Jogador</th><th class="c">V</th><th class="c">J</th><th class="c">%</th></tr></thead><tbody>
          ${rk.map((s, i) => `<tr class="${i === 0 ? "r-gold" : ""}"><td class="c">${i + 1}</td><td>${esc(s.name)}</td><td class="c b">${s.v}</td><td class="c">${s.j}</td><td class="c">${s.aprov.toFixed(0)}</td></tr>`).join("")}</tbody></table>
          ${rk.length ? "" : `<p class="muted small">Sem jogos ainda.</p>`}</div>`;
      } else {
        const rk = S.db.playerStats({ tid }).filter((s) => s.gols).sort((a, b) => b.gols - a.gols || a.j - b.j || a.name.localeCompare(b.name)).slice(0, 30);
        side = `<div class="card"><h3>🎯 Artilharia</h3>${rk.length ? `<table class="tbl"><thead><tr><th class="c">#</th><th>Jogador</th><th class="c">Gols</th><th class="c">J</th></tr></thead><tbody>
          ${rk.map((s, i) => `<tr class="${i === 0 ? "r-gold" : ""}"><td class="c">${i + 1}</td><td>${esc(s.name)}</td><td class="c b">${s.gols}</td><td class="c">${s.j}</td></tr>`).join("")}</tbody></table>`
          : `<p class="muted small">Lance os gols por jogador nas partidas para montar a artilharia.</p>`}</div>`;
      }
      body = `${t.champion_id ? `<div class="card" style="border-color:var(--gold);margin-bottom:12px"><b class="gold" style="font-size:17px">🏆 Campeão: <span class="tn" style="vertical-align:middle">${logo(t.champion_id, "md")}<span>${esc(S.db.teamName(t.champion_id))}</span></span></b></div>` : ""}
        <div class="cols-main-side"><div class="stack">${main}</div>${side}</div>`;
    }
    el.innerHTML = `<div class="page-head"><div class="grow"><h1>Classificação</h1><div class="sub">Tabela por pontos corridos ou por grupo, com artilharia</div></div></div>
      <div class="toolbar"><span class="muted">Campeonato:</span>${tournamentSelect(tid)}</div>
      ${t ? body : `<div class="card"><p class="muted">Nenhum campeonato cadastrado.</p></div>`}`;
    el.querySelector("#sel-t")?.addEventListener("change", (e) => { S.tid = +e.target.value; render(); });
  }
  return { mount(e) { el = e; render(); }, refresh: render };
}
