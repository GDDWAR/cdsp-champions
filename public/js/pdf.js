// PDF do chaveamento (A4 paisagem) + certificado do campeão — gerado no próprio navegador (jsPDF).
import { S } from "./ctx.js";
import * as C from "./core.js";
import { corDoNome, iniciais, logoUrl } from "./ui.js";

const CM = 28.3465;
const PW = 841.89, PH = 595.28;              // A4 paisagem em pontos
const ML = 1.2 * CM, MR = 1.2 * CM, MT = 1.1 * CM, MB = 1.1 * CM;
const INK = "#0f172a", MUTED = "#64748b", LINE = "#cbd5e1", HEAD = "#14532d", SOFT = "#f1f5f9", GOLD = "#b45309", GOLD_BG = "#fef3c7";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const ASSINATURA_ORGANIZACAO = "DPSP Champions";

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`) && window.jspdf) return res();
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("Não foi possível carregar o gerador de PDF."));
    document.head.appendChild(s);
  });
}
const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/** Escudo redondo (ou iniciais) como PNG para o PDF. */
async function roundLogo(team) {
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const g = c.getContext("2d");
  g.beginPath(); g.arc(80, 80, 80, 0, Math.PI * 2); g.closePath();
  const url = logoUrl(team);
  if (url) {
    try { const img = await loadImage(url); g.save(); g.clip(); g.drawImage(img, 0, 0, 160, 160); g.restore(); return c.toDataURL("image/png"); }
    catch { /* cai para as iniciais */ }
  }
  g.fillStyle = corDoNome(team?.name || "?"); g.fill();
  g.fillStyle = "#fff"; g.font = "bold 66px Arial, Helvetica, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(iniciais(team?.name || "?"), 80, 84);
  return c.toDataURL("image/png");
}

function hex(doc, color, kind = "fill") {
  const n = parseInt(color.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  if (kind === "fill") doc.setFillColor(...rgb);
  else if (kind === "draw") doc.setDrawColor(...rgb);
  else doc.setTextColor(...rgb);
}
// fontes padrão do PDF não têm "…" e "—": troca por equivalentes seguros
const safe = (s) => String(s ?? "").replace(/…/g, "...").replace(/[–—]/g, "-").replace(/[^\u0000-ÿ]/g, "");

export async function exportPdf(tid, includeResults = true) {
  await loadScript("/js/vendor/jspdf.umd.min.js");
  const { jsPDF } = window.jspdf;
  const db = S.db, t = db.tournament(tid);
  if (!t) throw new Error("Selecione um campeonato.");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setProperties({ title: `Chaveamento - ${t.name}`, author: C.SISTEMA, creator: C.SISTEMA });
  const ms = db.matches(tid);
  const labels = db.matchLabels(tid);
  const pens = C.temPenaltis(t.game);
  const parts = db.tournamentTeams(tid);

  // escudos de todos os participantes
  const logos = new Map();
  await Promise.all(parts.map(async (p) => logos.set(p.id, await roundLogo(db.team(p.id)))));
  const logoOf = async (id) => { if (!logos.has(id)) logos.set(id, await roundLogo(db.team(id))); return logos.get(id); };

  const name = (m, side) => {
    const id = m[`${side}_id`];
    if (id) return [db.teamName(id), true];
    return [labels.get(`${m.id}:${side}`) || (m.is_bye ? "Folga" : "A definir"), false];
  };
  const score = (m, side) => (includeResults && m.played && !m.is_bye ? String(m[`${side}_score`]) : "");
  const pen = (m, side) => (includeResults && m.played && m[`${side}_pen`] !== null && m[`${side}_pen`] !== undefined ? String(m[`${side}_pen`]) : "");

  const font = (style = "normal", size = 9, color = INK, family = "helvetica") => { doc.setFont(family, style); doc.setFontSize(size); hex(doc, color, "text"); };
  const fit = (s, maxW) => { s = safe(s); if (doc.getTextWidth(s) <= maxW) return s; while (s.length > 1 && doc.getTextWidth(s + "...") > maxW) s = s.slice(0, -1); return s + "..."; };
  let y = MT;
  const newPage = () => { doc.addPage(); y = MT; };
  const ensure = (h) => { if (y + h > PH - MB) newPage(); };
  const h2 = (txt) => { ensure(30); font("bold", 13, HEAD); doc.text(safe(txt), ML, y + 11); y += 22; };
  const sub = (txt) => { font("normal", 10, MUTED); for (const ln of doc.splitTextToSize(safe(txt), PW - ML - MR)) { doc.text(ln, ML, y + 9); y += 13; } };

  /* ---------------- cabeçalho ---------------- */
  font("bold", 20, INK);
  doc.text(fit(t.name, PW - ML - MR), ML, y + 18); y += 28;
  const info = [C.MODALIDADES[t.game || "futebol"], `Temporada ${t.season}`, C.CATEGORIAS[t.size], C.FORMATOS[t.format], `${parts.length} participantes`];
  if (t.format === "dias") info.push(`${t.days} dias · ${t.turnos} turno(s) · ${C.descricaoFaseFinal(t.final_mode)}`);
  if (t.meta) info.push(`Objetivo: ${t.meta * t.pts_win} pontos (${t.meta} partidas por participante)`);
  sub(info.join(" · "));
  if (t.format !== "mata") {
    const unit = C.termos(t.game)[3];
    sub(`Pontuação: vitória ${t.pts_win} · empate ${t.pts_draw} · derrota ${t.pts_loss} · Desempate: pontos, vitórias, saldo de ${unit}, ${unit} pró`);
  }
  y += 6;

  /* ---------------- participantes ---------------- */
  if (parts.length) {
    h2("Participantes");
    const ncol = parts[0].size < 11 ? 4 : 2;
    const cw = (PW - ML - MR) / ncol, ls = 0.75 * CM;
    for (let i = 0; i < parts.length; i += ncol) {
      const row = parts.slice(i, i + ncol);
      const blocks = row.map((p) => {
        let txt = p.name;
        if (p.group_name) txt = `[${p.group_name}] ` + txt;
        const mem = p.size > 1 ? db.teamMembers(p.id).map((x) => x.name).join(", ") : "";
        font("normal", 7.5);
        const memLines = mem ? doc.splitTextToSize(safe(mem), cw - ls - 12) : [];
        return { p, txt, memLines, h: Math.max(ls, 11 + memLines.length * 9) };
      });
      const rh = Math.max(...blocks.map((b) => b.h)) + 4;
      ensure(rh);
      blocks.forEach((b, k) => {
        const x = ML + k * cw;
        doc.addImage(logos.get(b.p.id), "PNG", x, y, ls, ls);
        font("bold", 8, INK);
        doc.text(fit(b.txt, cw - ls - 12), x + ls + 5, y + 9);
        font("normal", 7.5, MUTED);
        b.memLines.forEach((ln, j) => doc.text(ln, x + ls + 5, y + 18 + j * 9));
      });
      y += rh;
    }
  }

  /* ---------------- tabela de jogos ---------------- */
  const UW = [1.3, 2.85, 0.75, 0.3, 0.75, 2.85].map((v) => v * CM);
  const UNIT_W = UW.reduce((a, b) => a + b, 0), RH = 0.55 * CM, PRH = 0.42 * CM;
  const unitHeight = (list) => RH + (list.length ? list.reduce((s, m) => s + RH + (m.stage === "mata" && pens && !m.is_bye ? PRH : 0), 0) : RH);
  function drawUnit(x, y0, title, list) {
    const final = list.some((m) => m.stage === "mata");
    const h = unitHeight(list);
    hex(doc, final ? GOLD_BG : HEAD); doc.rect(x, y0, UNIT_W, RH, "F");
    font("bold", 9, final ? GOLD : "#ffffff"); doc.text(safe(title), x + 3, y0 + RH / 2 + 3);
    hex(doc, LINE, "draw"); doc.setLineWidth(0.6); doc.rect(x, y0, UNIT_W, h);
    let yy = y0 + RH;
    if (!list.length) { font("bold", 6, MUTED); doc.text("Sem jogos neste dia", x + 3, yy + RH / 2 + 2); return h; }
    for (const m of list) {
      hex(doc, LINE, "draw"); doc.setLineWidth(0.3); doc.line(x, yy, x + UNIT_W, yy);
      const cap = m.stage === "mata" ? m.round_name.replace("Disputa de ", "") : m.group_name ? `Grupo ${m.group_name}` : m.round_name.replace("Rodada ", "Rod. ");
      font("bold", 6, MUTED); doc.text(fit(cap, UW[0] - 4), x + 2, yy + RH / 2 + 2);
      const [hn, hk] = name(m, "home"), [an, ak] = name(m, "away");
      const cx = [x, x + UW[0], x + UW[0] + UW[1], x + UW[0] + UW[1] + UW[2], x + UW[0] + UW[1] + UW[2] + UW[3], x + UW[0] + UW[1] + UW[2] + UW[3] + UW[4]];
      font(hk ? "normal" : "italic", 7.5, hk ? INK : MUTED); doc.text(fit(hn, UW[1] - 4), cx[2] - 2, yy + RH / 2 + 2.5, { align: "right" });
      font(ak ? "normal" : "italic", 7.5, ak ? INK : MUTED); doc.text(fit(an, UW[5] - 4), cx[5] + 2, yy + RH / 2 + 2.5);
      if (m.is_bye) { font("normal", 5, MUTED); doc.text("W.O.", cx[3] + UW[3] / 2, yy + RH / 2 + 2, { align: "center" }); }
      else {
        hex(doc, INK, "draw"); doc.setLineWidth(0.8);
        doc.rect(cx[2] + 2, yy + 2, UW[2] - 4, RH - 4); doc.rect(cx[4] + 2, yy + 2, UW[4] - 4, RH - 4);
        font("bold", 9, INK);
        doc.text(score(m, "home"), cx[2] + UW[2] / 2, yy + RH / 2 + 3, { align: "center" });
        doc.text(score(m, "away"), cx[4] + UW[4] / 2, yy + RH / 2 + 3, { align: "center" });
        font("normal", 8, MUTED); doc.text("x", cx[3] + UW[3] / 2, yy + RH / 2 + 3, { align: "center" });
      }
      yy += RH;
      if (m.stage === "mata" && pens && !m.is_bye) {
        font("bold", 6, MUTED); doc.text("pênaltis", cx[2] - 3, yy + PRH / 2 + 2, { align: "right" });
        hex(doc, MUTED, "draw"); doc.setLineWidth(0.5);
        doc.rect(cx[2] + 5, yy + 1.5, UW[2] - 10, PRH - 3); doc.rect(cx[4] + 5, yy + 1.5, UW[4] - 10, PRH - 3);
        font("normal", 7, INK);
        doc.text(pen(m, "home"), cx[2] + UW[2] / 2, yy + PRH / 2 + 2.5, { align: "center" });
        doc.text(pen(m, "away"), cx[4] + UW[4] / 2, yy + PRH / 2 + 2.5, { align: "center" });
        yy += PRH;
      }
    }
    return h;
  }
  function unitsGrid(units, title = null) {
    const perRow = 3, gap = 0.35 * CM;
    for (let i = 0; i < units.length; i += perRow) {
      const row = units.slice(i, i + perRow);
      const rh = Math.max(...row.map(([, list]) => unitHeight(list)));
      ensure(rh + (i === 0 && title ? 20 : 0) + 8);
      if (i === 0 && title) { font("bold", 11, HEAD); doc.text(safe(title), ML, y + 10); y += 18; }
      row.forEach(([ttl, list], k) => drawUnit(ML + k * (UNIT_W + gap), y, ttl, list));
      y += rh + 8;
    }
  }
  if (t.format === "dias") {
    newPage(); h2("Tabela de jogos por dia");
    const per = t.days_per_week || 5;
    for (let w = 1; w <= t.days; w += per) {
      const units = [];
      for (let d = w; d < w + per && d <= t.days; d++) {
        const list = ms.filter((m) => m.day === d);
        units.push([`Dia ${d}${list.some((m) => m.stage === "mata") ? " - FASE FINAL" : ""}`, list]);
      }
      unitsGrid(units, `Semana ${Math.floor((w - 1) / per) + 1}`);
    }
  } else if (t.format !== "mata") {
    const g = ms.filter((m) => m.stage !== "mata");
    const rounds = [...new Set(g.map((m) => m.round))].sort((a, b) => a - b);
    newPage(); h2(`Tabela de jogos${t.format.startsWith("grupos") ? " - fase de grupos" : ""}`);
    unitsGrid(rounds.map((r) => [`Rodada ${r}`, g.filter((m) => m.round === r)]));
  }

  /* ---------------- chave do mata-mata ---------------- */
  const ko = ms.filter((m) => m.stage === "mata");
  const koRounds = new Set(ko.filter((m) => m.round_name !== C.THIRD).map((m) => m.round));
  if (ko.length && (["mata", "grupos_mata"].includes(t.format) || koRounds.size >= 2)) {
    newPage(); h2("Chave do mata-mata");
    sub(pens ? "Empate no mata-mata: anotar os pênaltis na casinha menor." : "No mata-mata não existe empate: a partida precisa terminar com um vencedor.");
    y += 6;
    await drawBracket(ko, y, PH - MB - y);
  }

  async function drawBracket(list, top0, availH) {
    const third = list.filter((m) => m.round_name === C.THIRD);
    const main = list.filter((m) => m.round_name !== C.THIRD);
    const rounds = [...new Set(main.map((m) => m.round))].sort((a, b) => a - b);
    const cols = rounds.map((r) => main.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot));
    const W = PW - ML - MR, ncols = cols.length, gap = 0.9 * CM, champW = 4.2 * CM;
    const bw = Math.min(6 * CM, (W - champW - gap * ncols) / ncols);
    const top = top0 + 0.7 * CM;
    const area = availH - 0.7 * CM - (third.length ? 2.6 * CM : 0.3 * CM);
    const n0 = cols[0].length;
    const bh = Math.max(0.75 * CM, Math.min(1.3 * CM, (area / n0) * 0.78));
    const fs = Math.max(5.5, Math.min(8.5, (bh / CM) * 6.2));
    const pos = new Map();
    cols.forEach((col, ci) => {
      const x = ML + ci * (bw + gap);
      font("bold", 8, MUTED); doc.text(safe(col[0].round_name.toUpperCase()), x + bw / 2, top0 + 0.4 * CM, { align: "center" });
      const span = area / col.length;
      for (const m of col) pos.set(m.id, [x, top + span * m.slot + span / 2 - bh / 2]);
    });
    hex(doc, LINE, "draw"); doc.setLineWidth(1);
    for (const col of cols) for (const m of col) {
      if (!pos.has(m.next_match_id)) continue;
      const [x, yt] = pos.get(m.id), [nx, nyt] = pos.get(m.next_match_id);
      const ty = nyt + bh * (m.next_slot === "home" ? 0.25 : 0.75), mx = x + bw + gap / 2;
      doc.lines([[mx - (x + bw), 0], [0, ty - (yt + bh / 2)], [nx - mx, 0]], x + bw, yt + bh / 2, [1, 1], "S", false);
    }
    for (const col of cols) for (const m of col) await box(m, ...pos.get(m.id), bw, bh, fs);
    const final = cols[cols.length - 1][0];
    const [fx, fyt] = pos.get(final.id);
    const cx = ML + ncols * (bw + gap), cy = fyt + bh / 2;
    hex(doc, GOLD, "draw"); doc.setLineWidth(1.4); doc.line(fx + bw, cy, cx, cy);
    font("bold", 10, GOLD); doc.text("CAMPEÃO", cx + 0.2 * CM, cy - 0.25 * CM);
    const champ = includeResults && final.played ? db.teamName(final.winner_id) : null;
    if (champ) { font("bold", 11, INK); doc.text(fit(champ, PW - MR - cx - 0.4 * CM), cx + 0.2 * CM, cy + 0.5 * CM); }
    else { hex(doc, INK, "draw"); doc.setLineWidth(0.8); doc.line(cx + 0.2 * CM, cy + 0.5 * CM, PW - MR - 0.2 * CM, cy + 0.5 * CM); }
    for (const m of third) {
      const ty = top0 + availH - 2.2 * CM + 0.45 * CM;
      font("bold", 8, MUTED); doc.text("DISPUTA DE 3º LUGAR", fx, ty - 0.45 * CM);
      await box(m, fx, ty, bw, Math.min(bh, 1.2 * CM), fs);
    }
  }

  async function box(m, x, yt, bw, bh, fs) {
    hex(doc, m.round_name === "Final" ? GOLD : INK, "draw"); doc.setLineWidth(0.9); hex(doc, "#ffffff");
    doc.rect(x, yt, bw, bh, "FD");
    hex(doc, LINE, "draw"); doc.line(x, yt + bh / 2, x + bw, yt + bh / 2);
    const sq = Math.min(bh / 2 - 3, 0.62 * CM);
    const penW = m.stage === "mata" && pens ? 0.5 * CM : 0;
    for (const [i, side] of [[0, "home"], [1, "away"]]) {
      const yc = yt + bh * (i === 0 ? 0.25 : 0.75);
      const [nm, known] = name(m, side);
      const id = m[`${side}_id`];
      const win = includeResults && m.played && m.winner_id && m.winner_id === id;
      let tx = x + 0.15 * CM;
      if (id) {
        const ls = Math.min(bh / 2 - 3, 0.6 * CM);
        doc.addImage(await logoOf(id), "PNG", x + 0.1 * CM, yc - ls / 2, ls, ls);
        tx = x + 0.2 * CM + ls;
      }
      font(win ? "bold" : known ? "normal" : "italic", fs, known ? INK : MUTED);
      const maxW = bw - sq - penW - 0.45 * CM - (tx - x - 0.15 * CM);
      doc.text(fit(nm, maxW), tx, yc + fs * 0.35);
      if (m.is_bye) continue;
      const sx = x + bw - sq - 0.1 * CM;
      hex(doc, INK, "draw"); hex(doc, "#ffffff"); doc.setLineWidth(0.9); doc.rect(sx, yc - sq / 2, sq, sq, "FD");
      const sc = score(m, side);
      if (sc) { font("bold", fs + 0.5, INK); doc.text(sc, sx + sq / 2, yc + fs * 0.35, { align: "center" }); }
      if (penW) {
        const psq = sq * 0.7, px = sx - psq - 0.1 * CM;
        hex(doc, MUTED, "draw"); hex(doc, "#ffffff"); doc.setLineWidth(0.6); doc.rect(px, yc - psq / 2, psq, psq, "FD");
        const pv = pen(m, side);
        if (pv) { font("normal", fs - 1, INK); doc.text(pv, px + psq / 2, yc + fs * 0.3, { align: "center" }); }
      }
    }
  }

  /* ---------------- classificação ---------------- */
  if (t.format !== "mata") {
    newPage(); h2("Classificação");
    const groups = ["grupos", "grupos_mata"].includes(t.format) ? db.groups(tid) : [null];
    const [pro, contra, saldo] = C.termos(t.game);
    const head = ["Pos", "Participante", "Pts", "J", "V", "E", "D", pro, contra, saldo];
    const cw = [1.1, 7, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3].map((v) => v * CM);
    const rh = 0.62 * CM, hh = 0.55 * CM;
    const drawHead = () => {
      hex(doc, HEAD); doc.rect(ML, y, cw.reduce((a, b) => a + b), hh, "F");
      font("bold", 8.5, "#ffffff");
      let x = ML;
      head.forEach((hd, i) => { doc.text(safe(hd), i === 1 ? x + 4 : x + cw[i] / 2, y + hh / 2 + 3, { align: i === 1 ? "left" : "center" }); x += cw[i]; });
      y += hh;
    };
    for (const g of groups) {
      let rows = db.standings(tid, g);
      const blank = !(includeResults && rows.some((r) => r.j));
      if (blank) rows = [...rows].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      let title = g ? `Grupo ${g}` : t.format === "dias" ? "Tabela do ciclo" : "Tabela";
      if (t.meta) title += ` - objetivo de ${t.meta * t.pts_win} pontos`;
      ensure(18 + hh + rh * Math.min(rows.length, 4));
      font("bold", 11, HEAD); doc.text(safe(title), ML, y + 10); y += 16;
      drawHead();
      rows.forEach((r, i) => {
        if (y + rh > PH - MB) { newPage(); drawHead(); }
        hex(doc, i % 2 ? SOFT : "#ffffff"); doc.rect(ML, y, cw.reduce((a, b) => a + b), rh, "F");
        hex(doc, LINE, "draw"); doc.setLineWidth(0.5);
        let x = ML;
        const vals = blank ? ["", r.name, "", "", "", "", "", "", "", ""] : [String(i + 1), r.name, r.pts, r.j, r.v, r.e, r.d, r.gp, r.gc, r.sg].map(String);
        vals.forEach((v, k) => {
          doc.rect(x, y, cw[k], rh);
          if (k === 1) {
            const ls = 0.45 * CM;
            doc.addImage(logos.get(r.team_id), "PNG", x + 3, y + (rh - ls) / 2, ls, ls);
            font("normal", 9, INK); doc.text(fit(v, cw[1] - ls - 10), x + ls + 6, y + rh / 2 + 3);
          } else { font("normal", 9, INK); doc.text(v, x + cw[k] / 2, y + rh / 2 + 3, { align: "center" }); }
          x += cw[k];
        });
        y += rh;
      });
      y += 10;
    }
  }

  /* ---------------- rodapé ---------------- */
  const stamp = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    font("normal", 7.5, MUTED);
    doc.text(safe(`${t.name} · ${C.SISTEMA} · gerado em ${stamp}`), ML, PH - 0.6 * CM);
    doc.text(`Página ${p}`, PW - MR, PH - 0.6 * CM, { align: "right" });
  }

  /* ---------------- certificado do campeão ---------------- */
  if (t.champion_id) {
    doc.addPage();
    await drawCertificate(doc, t, ms, logoOf, font, fit);
  }

  const fileName = `Chaveamento - ${t.name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "campeonato"}.pdf`;
  doc.save(fileName);
}

/* ======================================================================= certificado */
function podium(t, ms) {
  const db = S.db, champ = t.champion_id;
  let vice = null, third = null, detail = "";
  const final = ms.find((m) => m.round_name === "Final" && m.played);
  if (final) {
    vice = final.winner_id === final.home_id ? final.away_id : final.home_id;
    const cs = final.home_id === champ ? final.home_score : final.away_score;
    const vs = final.home_id === champ ? final.away_score : final.home_score;
    detail = `Final: ${db.teamName(champ)} ${cs} x ${vs} ${db.teamName(vice)}`;
    if (final.home_pen !== null && final.home_pen !== undefined) {
      const cp = final.home_id === champ ? final.home_pen : final.away_pen;
      const vp = final.home_id === champ ? final.away_pen : final.home_pen;
      detail += ` (${cp} x ${vp} nos pênaltis)`;
    }
    const tp = ms.find((m) => m.round_name === C.THIRD && m.played);
    if (tp) third = tp.winner_id;
  }
  if (t.format === "liga" || t.format === "dias") {
    const st = db.standings(t.id);
    const row = st.find((r) => r.team_id === champ);
    if (t.format === "liga" && st.length > 1) { vice = vice || st[1].team_id; third = third || (st.length > 2 ? st[2].team_id : null); }
    if (row && !detail) {
      const pl = (n, a, b) => `${n} ${n === 1 ? a : b}`;
      detail = `Campanha: ${pl(row.pts, "ponto", "pontos")} · ${pl(row.v, "vitória", "vitórias")} em ${pl(row.j, "jogo", "jogos")} · aproveitamento de ${row.aprov.toFixed(0)}%`;
      if (t.meta) detail = `Campanha: ${pl(row.pts, "ponto", "pontos")} de ${t.meta * t.pts_win} possíveis · ${pl(row.v, "vitória", "vitórias")} em ${pl(row.j, "partida", "partidas")}`;
    }
  }
  return { vice, third, detail };
}

async function drawCertificate(doc, t, ms, logoOf, font, fit) {
  const db = S.db;
  const W = PW, H = PH;
  const gold = "#b8860b", goldL = "#e6c46a", dark = "#1c1917", cream = "#fffdf5";
  const champ = t.champion_id, team = db.team(champ);
  const members = team.size > 1 ? db.teamMembers(champ).map((p) => p.name) : [];
  // fundo e molduras
  hex(doc, cream); doc.rect(0, 0, W, H, "F");
  hex(doc, dark); doc.rect(0.7 * CM, 0.7 * CM, W - 1.4 * CM, H - 1.4 * CM, "F");
  hex(doc, cream); doc.rect(1.15 * CM, 1.15 * CM, W - 2.3 * CM, H - 2.3 * CM, "F");
  hex(doc, gold, "draw"); doc.setLineWidth(2.2); doc.rect(1.45 * CM, 1.45 * CM, W - 2.9 * CM, H - 2.9 * CM);
  doc.setLineWidth(0.6); doc.rect(1.65 * CM, 1.65 * CM, W - 3.3 * CM, H - 3.3 * CM);
  hex(doc, gold);
  const d = 0.42 * CM;
  for (const [x, yy] of [[1.45 * CM, 1.45 * CM], [W - 1.45 * CM, 1.45 * CM], [1.45 * CM, H - 1.45 * CM], [W - 1.45 * CM, H - 1.45 * CM]])
    doc.lines([[d, d], [-d, d], [-d, -d], [d, -d]], x, yy - d, [1, 1], "F", true);
  // logo
  let y = 2.2 * CM;
  try {
    const img = await loadImage("/img/logo-pdf.png");
    const lh = 5.4 * CM, lw = (lh * img.naturalWidth) / img.naturalHeight;
    doc.addImage(img, "PNG", (W - lw) / 2, y, lw, lh);
    y += lh + 0.8 * CM;
  } catch {
    font("bold", 22, gold); doc.text(C.SISTEMA, W / 2, y + 1 * CM, { align: "center" }); y += 1.9 * CM;
  }
  // título
  font("bold", 25, dark);
  const title = "CERTIFICADO DE CAMPEÃO", cs = 3;
  const tw = doc.getTextWidth(title) + cs * (title.length - 1);
  doc.text(title, (W - tw) / 2, y, { charSpace: cs });
  y += 0.55 * CM;
  hex(doc, gold, "draw"); doc.setLineWidth(1.2); doc.line(W / 2 - 5 * CM, y, W / 2 + 5 * CM, y);
  y += 0.85 * CM;
  font("italic", 15, "#44403c", "times"); doc.text("Certificamos que", W / 2, y, { align: "center" });
  // nome do campeão com escudo
  y += 1.35 * CM;
  const nm = safe(team.name);
  let fs = 38;
  font("bold", fs, dark, "times");
  while (doc.getTextWidth(nm) > W - 9 * CM && fs > 20) { fs -= 1; doc.setFontSize(fs); }
  const nw = doc.getTextWidth(nm), ls = 1.55 * CM, gx = (W - (nw + ls + 0.35 * CM)) / 2;
  doc.addImage(await logoOf(champ), "PNG", gx, y - ls + 0.32 * CM, ls, ls);
  doc.text(nm, gx + ls + 0.35 * CM, y);
  y += 0.6 * CM;
  hex(doc, goldL, "draw"); doc.setLineWidth(0.8); doc.line(W / 2 - 8 * CM, y, W / 2 + 8 * CM, y);
  if (members.length) {
    y += 0.6 * CM;
    font("normal", members.length <= 3 ? 11 : 8.5, "#57534e");
    let txt = safe(members.join("  ·  "));
    if (doc.getTextWidth(txt) > W - 6 * CM) {
      const half = Math.ceil(members.length / 2);
      doc.text(safe(members.slice(0, half).join("  ·  ")), W / 2, y, { align: "center" });
      y += 0.42 * CM;
      txt = safe(members.slice(half).join("  ·  "));
    }
    doc.text(txt, W / 2, y, { align: "center" });
  }
  y += 0.95 * CM;
  font("normal", 15, "#292524", "times"); doc.text("conquistou o título de campeão do", W / 2, y, { align: "center" });
  y += 0.85 * CM;
  let tfs = 19;
  font("bold", tfs, gold);
  while (doc.getTextWidth(safe(t.name)) > W - 7 * CM && tfs > 12) { tfs -= 1; doc.setFontSize(tfs); }
  doc.text(safe(t.name), W / 2, y, { align: "center" });
  y += 0.7 * CM;
  font("normal", 11, "#57534e");
  doc.text(safe(`${C.MODALIDADES[t.game || "futebol"]}  ·  ${C.CATEGORIAS[t.size]}  ·  Temporada ${t.season}`), W / 2, y, { align: "center" });
  const { vice, third, detail } = podium(t, ms);
  if (detail) { y += 0.6 * CM; font("italic", 10.5, "#57534e"); doc.text(fit(detail, W - 5 * CM), W / 2, y, { align: "center" }); }
  const podio = [];
  if (vice) podio.push(`Vice-campeão: ${db.teamName(vice)}`);
  if (third) podio.push(`3º lugar: ${db.teamName(third)}`);
  if (podio.length) { y += 0.52 * CM; font("normal", 10, "#57534e"); doc.text(safe(podio.join("   |   ")), W / 2, y, { align: "center" }); }
  // data e assinaturas
  const now = new Date();
  const data = `${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;
  const base = H - 3.0 * CM;
  for (const [cx, label] of [[W * 0.25, "Organização"], [W * 0.75, "Responsável"]]) {
    hex(doc, dark, "draw"); doc.setLineWidth(0.7); doc.line(cx - 3.6 * CM, base, cx + 3.6 * CM, base);
    font("normal", 9.5, "#57534e"); doc.text(label, cx, base + 0.42 * CM + 3, { align: "center" });
  }
  // assinatura manuscrita da organização (tinta azul, levemente inclinada)
  try {
    const { GREAT_VIBES_TTF } = await import("./vendor/greatvibes-font.js");
    doc.addFileToVFS("GreatVibes-Regular.ttf", GREAT_VIBES_TTF);
    doc.addFont("GreatVibes-Regular.ttf", "GreatVibes", "normal");
    doc.setFont("GreatVibes", "normal");
  } catch { doc.setFont("times", "italic"); }
  let sfs = 30;
  doc.setFontSize(sfs);
  while (doc.getTextWidth(ASSINATURA_ORGANIZACAO) > 7 * CM && sfs > 14) { sfs -= 1; doc.setFontSize(sfs); }
  hex(doc, "#1e3a8a", "text");
  const sw = doc.getTextWidth(ASSINATURA_ORGANIZACAO), ang = 3, rad = (ang * Math.PI) / 180;
  const sx = W * 0.25 - (sw / 2) * Math.cos(rad), sy = base - 0.18 * CM + (sw / 2) * Math.sin(rad);
  doc.text(ASSINATURA_ORGANIZACAO, sx, sy, { angle: ang });
  font("italic", 12, "#44403c", "times"); doc.text(data, W / 2, base - 0.05 * CM, { align: "center" });
  font("bold", 8, gold); doc.text(C.SISTEMA.toUpperCase(), W / 2, base + 0.42 * CM + 3, { align: "center" });
}
