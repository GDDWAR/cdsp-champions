// Indicadores de desempenho (ranking por temporada, categoria e jogo + gráficos)
import { S } from "../ctx.js";
import { esc, seg, bindSeg, logo } from "../ui.js";
import * as C from "../core.js";

const COLORS = { green: "#22c55e", red: "#ef4444", gray: "#64748b", blue: "#3b82f6", grid: "#2a3550", muted: "#94a3b8", text: "#e5e7eb" };
const CAT_COLORS = { 1: "#3b82f6", 2: "#a855f7", 3: "#06b6d4", 11: "#22c55e" };

export function create() {
  let el, season = "Todas", cat = "Todas", game = "Todos", mode = "Jogadores", selIdx = null;
  let charts = [];
  let data = [];

  const destroyCharts = () => { charts.forEach((c) => c.destroy()); charts = []; };
  const filters = () => ({
    season: season === "Todas" ? null : season,
    size: cat === "Todas" ? null : +Object.entries(C.CATEGORIAS).find(([, v]) => v === cat)[0],
    game: game === "Todos" ? null : Object.entries(C.MODALIDADES).find(([, v]) => v === game)[0],
  });

  function baseOpts(extra = {}) {
    return Object.assign({
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      plugins: { legend: { labels: { color: COLORS.muted, boxWidth: 10, font: { size: 11 } } }, title: { display: true, color: COLORS.text, align: "start", font: { size: 13, weight: "bold" } } },
      scales: { x: { ticks: { color: COLORS.muted, font: { size: 10 } }, grid: { color: COLORS.grid } }, y: { ticks: { color: COLORS.muted, font: { size: 10 } }, grid: { color: COLORS.grid } } },
    }, extra);
  }

  function drawCharts() {
    destroyCharts();
    const Chart = window.Chart;
    if (!Chart) return;
    const c1 = el.querySelector("#ch1"), c2 = el.querySelector("#ch2");
    if (!c1 || !c2) return;
    const f = filters();
    if (selIdx === null || !data[selIdx]) {
      const top = data.slice(0, 10);
      if (!top.length) return;
      const labels = top.map((s) => s.name.slice(0, 18));
      const o1 = baseOpts({ indexAxis: "y" });
      o1.plugins.title.text = "Aproveitamento (%) — Top 10"; o1.plugins.legend.display = false; o1.scales.x.max = 100; o1.scales.x.min = 0;
      charts.push(new Chart(c1, { type: "bar", data: { labels, datasets: [{ data: top.map((s) => +s.aprov.toFixed(1)), backgroundColor: COLORS.green, borderRadius: 4 }] }, options: o1 }));
      const o2 = baseOpts({ indexAxis: "y" });
      o2.plugins.title.text = "Vitórias · Empates · Derrotas"; o2.scales.x.stacked = true; o2.scales.y.stacked = true;
      charts.push(new Chart(c2, { type: "bar", data: { labels, datasets: [
        { label: "Vitórias", data: top.map((s) => s.v), backgroundColor: COLORS.green },
        { label: "Empates", data: top.map((s) => s.e), backgroundColor: COLORS.gray },
        { label: "Derrotas", data: top.map((s) => s.d), backgroundColor: COLORS.red }] }, options: o2 }));
      return;
    }
    const s = data[selIdx];
    if (mode === "Jogadores") {
      const tl = S.db.playerTimeline(s.player_id, f);
      const o1 = baseOpts();
      o1.plugins.title.text = `${s.name} — pontos acumulados por jogo`; o1.plugins.legend.display = false;
      charts.push(new Chart(c1, { type: "line", data: { labels: tl.map((_, i) => i + 1), datasets: [{ data: tl, borderColor: COLORS.green, backgroundColor: "rgba(34,197,94,.15)", fill: true, pointRadius: 2, tension: 0.15 }] }, options: o1 }));
      const cats = [1, 2, 3, 11].filter((c) => s.por_cat[c]);
      const ap = cats.map((c) => { const x = s.por_cat[c]; return +((100 * (3 * x.v + x.e)) / (3 * x.j)).toFixed(1); });
      const o2 = baseOpts();
      o2.plugins.title.text = "Aproveitamento por categoria (%)"; o2.plugins.legend.display = false; o2.scales.y.max = 100; o2.scales.y.min = 0;
      o2.plugins.tooltip = { callbacks: { label: (ctx) => `${ctx.raw}% em ${s.por_cat[cats[ctx.dataIndex]].j} jogos` } };
      charts.push(new Chart(c2, { type: "bar", data: { labels: cats.map((c) => C.CATEGORIAS[c]), datasets: [{ data: ap, backgroundColor: cats.map((c) => CAT_COLORS[c]), borderRadius: 4 }] }, options: o2 }));
    } else {
      const o1 = { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: `${s.name} — resultados`, color: COLORS.text, align: "start" }, legend: { labels: { color: COLORS.muted } } } };
      charts.push(new Chart(c1, { type: "doughnut", data: { labels: ["Vitórias", "Empates", "Derrotas"], datasets: [{ data: [s.v, s.e, s.d], backgroundColor: [COLORS.green, COLORS.gray, COLORS.red], borderWidth: 0 }] }, options: o1 }));
      const [pro, contra, saldo] = C.termos(f.game || "futebol");
      const o2 = baseOpts();
      o2.plugins.title.text = "Marcados e sofridos"; o2.plugins.legend.display = false;
      charts.push(new Chart(c2, { type: "bar", data: { labels: [`${pro} (pró)`, `${contra} (contra)`, `${saldo} (saldo)`], datasets: [{ data: [s.gp, s.gc, s.sg], backgroundColor: [COLORS.green, COLORS.red, COLORS.blue], borderRadius: 4 }] }, options: o2 }));
    }
  }

  function render() {
    const f = filters();
    const players = mode === "Jogadores";
    if (!players && cat === "Individual") mode = "Jogadores";
    data = mode === "Jogadores" ? S.db.playerStats(f) : S.db.teamStats(f).filter((d) => f.size || d.size > 1);
    if (selIdx !== null && selIdx >= data.length) selIdx = null;
    const futebol = !f.game || f.game === "futebol";
    const gk = mode === "Jogadores" && futebol ? "gols" : "gp";
    const unit = futebol ? "gols" : C.termos(f.game)[3];
    const best = (key, cond = () => true) => data.filter(cond).reduce((b, s) => (!b || s[key] > b[key] || (s[key] === b[key] && s.pts > b.pts) ? s : b), null);
    const lead = data[0], ap = best("aprov", (s) => s.j >= 3) || best("aprov"), art = best(gk), tit = best("titles");
    const kpi = (icon, lbl, name, sub, color) => `<div class="kpi"><div class="lbl"><span>${icon}</span>${esc(lbl)}</div><div class="val sm">${esc(name)}</div><div class="subv" style="color:${color}">${esc(sub)}</div></div>`;
    const [, , saldo] = C.termos(f.game || "futebol");
    const seasons = ["Todas", ...S.db.seasons()];
    if (!seasons.includes(season)) season = "Todas";
    el.innerHTML = `
      <div class="page-head"><div class="grow"><h1>Indicadores de desempenho</h1><div class="sub">Ranking por temporada — individual, duplas, trios e times de 11</div></div>${seg("mode", ["Jogadores", "Equipes"], mode)}</div>
      <div class="toolbar"><span class="muted">Temporada:</span><select id="season" style="width:auto">${seasons.map((s) => `<option ${s === season ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
        <span class="muted">Categoria:</span>${seg("cat", ["Todas", ...Object.values(C.CATEGORIAS)], cat)}
        <span class="muted">Jogo:</span><select id="game" style="width:auto">${["Todos", ...Object.values(C.MODALIDADES)].map((g) => `<option ${g === game ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></div>
      <div class="kpis">
        ${kpi("🥇", "Líder do ranking", lead?.name || "-", lead ? `${lead.pts} pts` : "", "var(--gold)")}
        ${kpi("📈", "Melhor aproveitamento", ap?.name || "-", ap ? `${ap.aprov.toFixed(0)}% em ${ap.j} jogos` : "", "var(--accent)")}
        ${kpi("🎯", futebol ? "Artilheiro" : `Mais ${unit} marcados`, art && art[gk] ? art.name : "-", art && art[gk] ? `${art[gk]} ${unit}` : "", "var(--cyan)")}
        ${kpi("🏆", "Mais títulos", tit && tit.titles ? tit.name : "-", tit && tit.titles ? `${tit.titles} título(s)` : "", "var(--purple)")}
      </div>
      <div class="cols-3-2">
        <div class="card"><h3>Ranking de ${mode === "Jogadores" ? "jogadores" : "equipes"} · ${esc(season)} · ${esc(cat)} · ${esc(game)}</h3>
          <p class="muted small" style="margin:-4px 0 6px">Clique em uma linha para ver os gráficos dela. Pontuação do ranking: vitória 3, empate 1.</p>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="c">#</th><th>Nome</th><th class="c">Pts</th><th class="c">J</th><th class="c">V</th><th class="c">E</th><th class="c">D</th><th class="c">${esc(saldo)}</th><th class="c">${esc(futebol ? "Gols" : unit[0].toUpperCase() + unit.slice(1))}</th><th class="c">Aprov.</th><th class="c">🏆</th></tr></thead><tbody>
          ${data.map((s, i) => `<tr class="click ${i === 0 ? "r-gold" : ""} ${selIdx === i ? "sel" : ""}" data-i="${i}"><td class="c">${i + 1}</td>
            <td>${mode === "Equipes" ? `<span class="tn">${logo(s.team_id)}<span>${esc(s.name)}</span></span>` : esc(s.name)}</td><td class="c b">${s.pts}</td><td class="c">${s.j}</td><td class="c">${s.v}</td><td class="c">${s.e}</td><td class="c">${s.d}</td>
            <td class="c">${s.sg}</td><td class="c">${mode === "Jogadores" && futebol ? s.gols : s.gp}</td><td class="c">${s.aprov.toFixed(0)}%</td><td class="c">${s.titles}</td></tr>`).join("")}
          </tbody></table>${data.length ? "" : `<p class="muted" style="padding:10px">Sem partidas no filtro.</p>`}</div></div>
        <div class="card">${selIdx !== null ? `<button class="btn sm" id="back" style="margin-bottom:6px">← Visão geral</button>` : ""}
          <div class="chart-box"><canvas id="ch1"></canvas></div><div class="chart-box" style="margin-top:10px"><canvas id="ch2"></canvas></div></div>
      </div>`;
    bindSeg(el, "mode", (v) => { mode = v; selIdx = null; render(); });
    bindSeg(el, "cat", (v) => { cat = v; selIdx = null; render(); });
    el.querySelector("#season").addEventListener("change", (e) => { season = e.target.value; selIdx = null; render(); });
    el.querySelector("#game").addEventListener("change", (e) => { game = e.target.value; selIdx = null; render(); });
    el.querySelectorAll("tr[data-i]").forEach((r) => r.addEventListener("click", () => { selIdx = +r.dataset.i; render(); }));
    el.querySelector("#back")?.addEventListener("click", () => { selIdx = null; render(); });
    if (window.Chart) drawCharts(); else window.addEventListener("load", drawCharts, { once: true });
  }

  return { mount(e) { el = e; render(); }, refresh: render, destroy: destroyCharts };
}
