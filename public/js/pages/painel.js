// Painel geral
import { S, isAdmin } from "../ctx.js";
import { esc, teamCell, fmtScore, phaseText } from "../ui.js";
import * as C from "../core.js";

export function create(ctx) {
  let el;
  function render() {
    const db = S.db, d = db.dashboard();
    const media = d.played_fut ? d.goals / d.played_fut : 0;
    const kpi = (icon, lbl, val, sub, color) =>
      `<div class="kpi"><div class="lbl"><span style="color:${color}">${icon}</span>${esc(lbl)}</div><div class="val">${esc(val)}</div><div class="subv" style="color:${color}">${esc(sub)}</div></div>`;
    const running = db.tournaments().filter((t) => t.status === "Em andamento");
    const top = db.playerStats().slice(0, 5);
    const recent = db.recentResults(30);
    el.innerHTML = `
      <div class="page-head"><div class="grow"><h1>Painel geral</h1><div class="sub">Visão rápida de jogadores, campeonatos e resultados</div></div>
        ${S.pendingGames ? `<button class="btn primary" data-go="lancamentos">📝 ${S.pendingGames} jogo(s) aguardando placar</button>` : ""}</div>
      <div class="kpis">
        ${kpi("👤", "Jogadores", d.players, "cadastrados", "var(--blue)")}
        ${kpi("👥", "Equipes", d.teams, "duplas, trios e times", "var(--purple)")}
        ${kpi("🏆", "Campeonatos", d.tournaments, `${d.running} em andamento`, "var(--gold)")}
        ${kpi("⚽", "Partidas jogadas", d.played, "", "var(--accent)")}
        ${kpi("⏳", "Partidas pendentes", d.pending, "", "var(--red)")}
        ${kpi("🎯", "Gols", d.goals, `futebol · média ${media.toFixed(1)} por jogo`, "var(--cyan)")}
      </div>
      <div class="cols-3-2">
        <div class="card"><h3>Últimos resultados</h3>
          ${recent.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Campeonato</th><th>Fase</th><th class="r">Mandante</th><th class="c">Placar</th><th>Visitante</th></tr></thead><tbody>
          ${recent.map((m) => `<tr><td>${esc(m.tname)}</td><td>${esc(phaseText(m))}</td><td class="r">${teamCell(m.home_id)}</td><td class="c b">${esc(fmtScore(m))}</td><td>${teamCell(m.away_id)}</td></tr>`).join("")}
          </tbody></table></div>` : `<p class="muted">Nenhum resultado lançado ainda.</p>`}
        </div>
        <div class="stack">
          <div class="card"><h3>Campeonatos em andamento</h3>
            ${running.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Campeonato</th><th class="c">Jogo</th><th class="c">Categoria</th><th class="c">Progresso</th></tr></thead><tbody>
            ${running.map((t) => {
              const ms = db.s.matches.filter((m) => m.tournament_id === t.id && !m.is_bye);
              const p = ms.length ? Math.floor((100 * ms.filter((m) => m.played).length) / ms.length) : 0;
              return `<tr class="click" data-t="${t.id}"><td>${esc(t.name)}</td><td class="c">${esc(C.MODALIDADES[t.game])}</td><td class="c">${esc(C.CATEGORIAS[t.size])}</td><td class="c">${p}%</td></tr>`;
            }).join("")}</tbody></table></div>` : `<p class="muted">Nenhum campeonato em andamento.</p>`}
          </div>
          <div class="card"><h3>Top 5 jogadores (pontos gerais)</h3>
            ${top.length ? `<table class="tbl"><thead><tr><th class="c">#</th><th>Jogador</th><th class="c">Pts</th><th class="c">Aprov.</th><th class="c">🏆</th></tr></thead><tbody>
            ${top.map((s, i) => `<tr class="${i === 0 ? "r-gold" : ""}"><td class="c">${i + 1}</td><td>${esc(s.name)}</td><td class="c b">${s.pts}</td><td class="c">${s.aprov.toFixed(0)}%</td><td class="c">${s.titles}</td></tr>`).join("")}
            </tbody></table>` : `<p class="muted">Sem partidas ainda.</p>`}
          </div>
          ${isAdmin() && !db.s.tournaments.length ? `<div class="card"><h3>Primeiros passos</h3><ol class="muted" style="margin:0;padding-left:18px;line-height:1.7">
            <li>Cadastre os <b>Jogadores</b> (dá para colar uma lista).</li><li>Monte as <b>Equipes</b> (ou sorteie).</li>
            <li>Crie o <b>Campeonato</b> — a tabela e o chaveamento saem prontos.</li><li>Aprove os usuários em <b>Usuários</b> para eles lançarem placares.</li>
            <li>Já usa o sistema no computador? Em <b>Backup e importação</b> dá para trazer o arquivo campeonatos.db.</li></ol></div>` : ""}
        </div>
      </div>`;
    el.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => ctx.go(b.dataset.go)));
    el.querySelectorAll("tr[data-t]").forEach((r) => r.addEventListener("click", () => { S.tid = +r.dataset.t; ctx.go("classificacao"); }));
  }
  return { mount(e) { el = e; render(); }, refresh: render };
}
