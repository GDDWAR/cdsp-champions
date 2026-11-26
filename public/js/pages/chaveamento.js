// Chaveamento: grade por dia/rodada, árvore do mata-mata, tabela de pontos ao lado e PDF
import { S, isAdmin, currentTid, prefs } from "../ctx.js";
import { esc, tournamentSelect, seg, bindSeg, logo, sideName, resultDialog, run, toast } from "../ui.js";
import { standingsTable } from "./classificacao.js";
import * as C from "../core.js";

const W = 220, H = 54, GAP = 60;

export function create() {
  let el, view = null, viewFor = null;
  const admin = isAdmin();

  function mbox(m, labels, { final = false, style = "" } = {}) {
    const line = (side) => {
      const s = sideName(m, side, labels);
      const win = m.played && s.id && m.winner_id === s.id;
      const lose = m.played && s.id && m.winner_id && m.winner_id !== s.id;
      const cls = !s.known ? "ph" : win ? "win" : lose ? "lose" : "";
      let sc;
      if (m.played && !m.is_bye) sc = `<span class="sc">${m[side + "_score"]}${m[side + "_pen"] !== null && m[side + "_pen"] !== undefined ? ` <small>(${m[side + "_pen"]})</small>` : ""}</span>`;
      else sc = m.is_bye ? "" : `<span class="sc empty"></span>`;
      return `<div class="mline ${cls}">${s.id ? logo(s.id) : ""}<span class="nm" title="${esc(s.name)}">${esc(s.name)}</span>${sc}</div>`;
    };
    const can = admin && !m.is_bye;
    return `<div class="mbox ${can ? "can" : ""} ${final ? "final" : ""}" data-m="${m.id}" style="${style}">${line("home")}${line("away")}</div>`;
  }

  function caption(m, t) {
    if (m.stage === "mata") return m.round_name.toUpperCase();
    if (m.group_name) return `GRUPO ${m.group_name}`;
    return t.format === "dias" ? m.round_name : "";
  }

  function gridHtml(units, perRow, rowTitle, t, labels) {
    let html = "";
    for (let r0 = 0; r0 < units.length; r0 += perRow) {
      const row = units.slice(r0, r0 + perRow);
      if (rowTitle) html += `<div class="week-title">${rowTitle.toUpperCase()} ${r0 / perRow + 1}</div>`;
      html += `<div class="grid-days">${row.map(([, title, ms]) => {
        const final = ms.some((m) => m.stage === "mata");
        const played = ms.filter((m) => m.played).length;
        return `<div class="day ${final ? "final" : ""}"><div class="day-h"><b>${esc(title)}</b><span class="muted small">${ms.length ? `${played}/${ms.length} jogos` : "sem jogos"}</span></div>
          ${ms.map((m) => { const cap = caption(m, t); return `${cap ? `<div class="cap ${m.stage === "mata" ? "ko" : ""}">${esc(cap)}</div>` : ""}${mbox(m, labels, { final: m.round_name === "Final" })}`; }).join("")}</div>`;
      }).join("")}</div>`;
    }
    return html;
  }

  function bracketHtml(ms, labels) {
    const third = ms.filter((m) => m.round_name === C.THIRD);
    const main = ms.filter((m) => m.round_name !== C.THIRD);
    const rounds = [...new Set(main.map((m) => m.round))].sort((a, b) => a - b);
    const cols = rounds.map((r) => main.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot));
    if (!cols.length) return "";
    const slotH = H + 24, totalH = Math.max(cols[0].length * slotH, 260), x0 = 10, y0 = 34;
    const pos = new Map();
    let boxes = "", titles = "", lines = "";
    cols.forEach((col, ci) => {
      const x = x0 + ci * (W + GAP), span = totalH / col.length;
      titles += `<div class="rtitle" style="left:${x}px;top:6px;width:${W}px">${esc(col[0].round_name.toUpperCase())}</div>`;
      for (const m of col) {
        const y = y0 + span * m.slot + span / 2 - H / 2;
        pos.set(m.id, [x, y]);
        boxes += mbox(m, labels, { final: m.round_name === "Final", style: `left:${x}px;top:${y}px;width:${W}px` });
      }
    });
    for (const m of main) {
      if (!pos.has(m.next_match_id) || !pos.has(m.id)) continue;
      const [x, y] = pos.get(m.id), [nx, ny] = pos.get(m.next_match_id);
      const ty = ny + (m.next_slot === "home" ? H * 0.25 : H * 0.75), mx = x + W + GAP / 2;
      lines += `<polyline points="${x + W},${y + H / 2} ${mx},${y + H / 2} ${mx},${ty} ${nx},${ty}" fill="none" stroke="#2a3550" stroke-width="2"/>`;
    }
    const lastX = x0 + cols.length * (W + GAP);
    const final = cols[cols.length - 1][0];
    const [fx, fy] = pos.get(final.id);
    lines += `<line x1="${fx + W}" y1="${fy + H / 2}" x2="${lastX}" y2="${fy + H / 2}" stroke="#f59e0b" stroke-width="2"/>`;
    const champ = final.played ? final.winner_id : null;
    const champHtml = `<div class="champ" style="left:${lastX + 10}px;top:${fy + H / 2 - 22}px"><div class="t">🏆 CAMPEÃO</div>
      <div class="n">${champ ? `${logo(champ, "md")}<span>${esc(S.db.teamName(champ))}</span>` : `<span class="muted">________________</span>`}</div></div>`;
    let thirdHtml = "";
    let height = y0 + totalH + 30;
    for (const m of third) {
      const ty = fy + H + 70;
      thirdHtml += `<div class="rtitle" style="left:${fx}px;top:${ty - 22}px;width:${W}px">DISPUTA DE 3º LUGAR</div>${mbox(m, labels, { style: `left:${fx}px;top:${ty}px;width:${W}px` })}`;
      height = Math.max(height, ty + H + 30);
    }
    const width = lastX + 260;
    return `<div class="bracket" style="width:${width}px;height:${height}px"><svg width="${width}" height="${height}">${lines}</svg>${titles}${boxes}${thirdHtml}${champHtml}</div>`;
  }

  function contentHtml(t, v) {
    const ms = S.db.matches(t.id);
    const labels = S.db.matchLabels(t.id);
    const ko = ms.filter((m) => m.stage === "mata");
    const groupUnits = () => {
      const g = ms.filter((m) => m.stage !== "mata");
      const rounds = [...new Set(g.map((m) => m.round))].sort((a, b) => a - b);
      return rounds.map((r) => [r, `Rodada ${r}`, g.filter((m) => m.round === r)]);
    };
    if (t.format === "grupos_mata" && v === "Tudo") {
      return `<div class="bk-section green">FASE DE GRUPOS</div>${gridHtml(groupUnits(), 5, null, t, labels)}
        ${ko.length ? `<div class="bk-section gold" style="margin-top:18px;border-top:2px solid var(--border);padding-top:12px">MATA-MATA</div>${bracketHtml(ko, labels)}` : ""}`;
    }
    if (t.format === "mata" || v === "Mata-mata") {
      return ko.length ? bracketHtml(ko, labels) : `<p class="muted">Mata-mata ainda não gerado (campeonato antigo): use "Gerar mata-mata" na aba Partidas.</p>`;
    }
    if (t.format === "dias") {
      const units = [];
      for (let d = 1; d <= t.days; d++) units.push([d, `Dia ${d}`, ms.filter((m) => m.day === d)]);
      return gridHtml(units, t.days_per_week || 5, "Semana", t, labels);
    }
    return gridHtml(groupUnits(), 5, null, t, labels);
  }

  function sideHtml(t) {
    const groups = ["grupos", "grupos_mata"].includes(t.format) ? S.db.groups(t.id) : [null];
    return `<h3>📊 Tabela de pontos</h3>${t.meta ? `<div class="gold small" style="margin:-4px 0 6px">Objetivo: ${t.meta * t.pts_win} pontos · ${t.meta} partidas cada</div>` : ""}
      ${groups.map((g) => `${g ? `<div class="b green" style="margin:10px 0 4px">Grupo ${esc(g)}</div>` : ""}${standingsTable(t, S.db.standings(t.id, g), g, { compact: true })}`).join("")}`;
  }

  function render() {
    const tid = currentTid();
    const t = tid ? S.db.tournament(tid) : null;
    const views = t ? { grupos_mata: ["Tudo", "Fase de grupos", "Mata-mata"], dias: ["Dias", "Mata-mata"] }[t.format] : null;
    if (viewFor !== tid) { view = views ? views[0] : null; viewFor = tid; }
    const showTable = prefs.get("bk-table", true) && t && t.format !== "mata";
    let info = "";
    if (t) {
      const ms = S.db.s.matches.filter((m) => m.tournament_id === tid && !m.is_bye);
      info = `${C.CATEGORIAS[t.size]} · ${C.MODALIDADES[t.game]} · ${C.FORMATOS[t.format]} · ${ms.filter((m) => m.played).length}/${ms.length} jogos lançados`;
      if (t.format === "dias") info += ` · ${t.days} dias, ${t.turnos} turno(s)`;
      if (t.champion_id) info += `   🏆 Campeão: ${S.db.teamName(t.champion_id)}`;
    }
    const scroll = el.querySelector(".bk-scroll");
    const keep = scroll ? [scroll.scrollLeft, scroll.scrollTop] : null;
    el.innerHTML = `
      <div class="page-head"><div class="grow"><h1>Chaveamento</h1><div class="sub">${admin ? "Clique em qualquer partida para lançar ou corrigir o resultado" : "Consulta do chaveamento. Para lançar placares use a aba Lançamentos/Placares."}</div></div>
        <label class="switch small"><input type="checkbox" id="inc" ${prefs.get("pdf-inc", true) ? "checked" : ""}> Incluir resultados lançados</label>
        <button class="btn red" id="pdf" ${t ? "" : "disabled"}>📄 Gerar PDF</button></div>
      <div class="toolbar"><span class="muted">Campeonato:</span>${tournamentSelect(tid)}${views ? seg("view", views, view) : ""}
        ${t && t.format !== "mata" ? `<label class="switch" style="margin-left:auto"><input type="checkbox" id="tbl" ${showTable ? "checked" : ""}> 📊 Tabela de pontos</label>` : ""}</div>
      ${t ? `<div class="info-line">${esc(info)}</div>
        <div class="bk-layout ${showTable ? "" : "no-side"}"><div class="card bk-scroll">${contentHtml(t, view)}</div>${showTable ? `<div class="card" style="max-height:calc(100vh - 210px);overflow:auto">${sideHtml(t)}</div>` : ""}</div>`
      : `<div class="card"><p class="muted">Nenhum campeonato cadastrado.</p></div>`}`;
    if (keep) { const s = el.querySelector(".bk-scroll"); if (s) { s.scrollLeft = keep[0]; s.scrollTop = keep[1]; } }
    el.querySelector("#sel-t")?.addEventListener("change", (e) => { S.tid = +e.target.value; render(); });
    bindSeg(el, "view", (v) => { view = v; render(); });
    el.querySelector("#tbl")?.addEventListener("change", (e) => { prefs.set("bk-table", e.target.checked); render(); });
    el.querySelector("#inc").addEventListener("change", (e) => prefs.set("pdf-inc", e.target.checked));
    el.querySelector("#pdf").addEventListener("click", async (e) => {
      const [ok] = await run(async () => {
        const { exportPdf } = await import("../pdf.js");
        await exportPdf(tid, el.querySelector("#inc").checked);
      }, e.target);
      if (ok) toast("PDF gerado.");
    });
    if (admin) el.querySelectorAll(".mbox.can").forEach((b) => b.addEventListener("click", () => resultDialog(+b.dataset.m)));
  }

  return { mount(e) { el = e; render(); }, refresh: render };
}
