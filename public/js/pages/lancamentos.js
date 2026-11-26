// Lançamentos/Placares: busca de jogos SEM resultado e lançamento do placar (usuários aprovados e admin)
import { S, op, isAdmin, currentTid, prefs } from "../ctx.js";
import { esc, toast, run, tournamentSelect, logo, norm, phaseText, scorersDialog, modal, plural } from "../ui.js";
import * as C from "../core.js";

const PAGE_SIZE = 40;

export function create(ctx) {
  let el, query = "", limit = PAGE_SIZE;
  const drafts = new Map();   // rascunhos por jogo: {hs, as, hp, ap, scorers}

  /** Jogos que podem receber placar: sem resultado, com os dois participantes definidos e que não são folga. */
  const launchable = (tid) => S.db.matches(tid, { pending: true }).filter((m) => m.home_id && m.away_id && !m.is_bye);

  function searchText(m, t) {
    const parts = [S.db.teamName(m.home_id), S.db.teamName(m.away_id), m.round_name, m.group_name ? `grupo ${m.group_name}` : "",
      m.day ? `dia ${m.day}` : "", t.format === "dias" && m.day ? `semana ${Math.ceil(m.day / (t.days_per_week || 5))}` : "",
      m.stage === "mata" ? "mata-mata final" : ""];
    for (const id of [m.home_id, m.away_id]) for (const p of S.db.teamMembers(id)) parts.push(p.name, p.nickname);
    return norm(parts.join(" "));
  }

  function filtered(tid) {
    const t = S.db.tournament(tid);
    // "dia 2", "rodada 3", "grupo a", "semana 1" valem como expressão exata (dia 2 não traz dia 12 nem rodada 2)
    const phrases = [];
    const rest = norm(query).replace(/\b(dia|rodada|semana|grupo)\s+(\S+)/g, (_, k, v) => { phrases.push(new RegExp(`\\b${k} ${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)); return " "; });
    const terms = rest.split(/\s+/).filter(Boolean);
    return launchable(tid).filter((m) => {
      if (!terms.length && !phrases.length) return true;
      const s = searchText(m, t);
      return phrases.every((re) => re.test(s)) && terms.every((w) => s.includes(w));
    });
  }

  function cardHtml(m, t) {
    const d = drafts.get(m.id) || {};
    const two = C.ate2Pontos(t.game);
    const pensOn = m.stage === "mata" && C.temPenaltis(t.game);
    const tie = d.hs !== undefined && d.hs !== "" && d.hs === d.as;
    const side = (id) => {
      const tm = S.db.team(id);
      const mem = tm && tm.size > 1 ? S.db.teamMembers(id).map((p) => p.name).join(", ") : "";
      return `<div class="side-t">${logo(id, "md")}<div class="nm">${esc(tm?.name)}</div>${mem ? `<div class="mem" title="${esc(mem)}">${esc(mem)}</div>` : ""}</div>`;
    };
    const sc = Object.entries(d.scorers || {}).filter(([, q]) => q).map(([pid, q]) => `${S.db.player(+pid)?.name} (${q})`);
    return `<div class="lanc" data-m="${m.id}">
      <div class="phase"><span>${esc(phaseText(m))}</span>${m.stage === "mata" ? `<span class="ko">MATA-MATA</span>` : two ? `<span>até 2 pontos</span>` : ""}</div>
      <div class="vs">${side(m.home_id)}
        <div class="scores"><input type="number" inputmode="numeric" min="0" data-k="hs" value="${esc(d.hs ?? "")}" aria-label="Placar ${esc(S.db.teamName(m.home_id))}">
          <span class="x">×</span><input type="number" inputmode="numeric" min="0" data-k="as" value="${esc(d.as ?? "")}" aria-label="Placar ${esc(S.db.teamName(m.away_id))}"></div>
        ${side(m.away_id)}</div>
      ${two ? `<div class="quick">${C.PLACARES_2PTS.map(([h, a]) => `<button type="button" class="btn ${String(d.hs) === String(h) && String(d.as) === String(a) ? "primary" : ""}" data-quick="${h}-${a}">${h} x ${a}</button>`).join("")}</div>` : ""}
      ${pensOn ? `<div class="pens" ${tie ? "" : "hidden"}>Empate — pênaltis: <input type="number" inputmode="numeric" min="0" data-k="hp" value="${esc(d.hp ?? "")}"> × <input type="number" inputmode="numeric" min="0" data-k="ap" value="${esc(d.ap ?? "")}"></div>` : ""}
      ${t.game === "futebol" && S.db.team(m.home_id)?.size > 1 ? `<button class="btn sm" data-sc>🎯 Gols por jogador (opcional)${sc.length ? ` · ${esc(sc.join(", "))}` : ""}</button>` : ""}
      <button class="btn primary big block" data-save>✔ Lançar placar</button>
    </div>`;
  }

  function listHtml(tid) {
    const t = S.db.tournament(tid);
    const all = launchable(tid);
    const list = filtered(tid);
    if (!all.length) {
      const pendingButBlocked = S.db.matches(tid, { pending: true }).filter((m) => !m.is_bye).length;
      return `<div class="card empty-state"><div class="big">${t.status === "Finalizado" ? "🏆" : "✅"}</div>
        <p><b>${t.status === "Finalizado" ? "Campeonato finalizado." : "Nenhum jogo aguardando placar neste campeonato."}</b></p>
        ${pendingButBlocked ? `<p class="muted">${plural(pendingButBlocked, "jogo ainda depende", "jogos ainda dependem")} de resultados anteriores para definir os participantes.</p>` : ""}</div>`;
    }
    const shown = list.slice(0, limit);
    return `<div class="muted small" style="margin:0 4px 8px">${query ? `${plural(list.length, "jogo encontrado", "jogos encontrados")} de ${all.length} aguardando placar` : `${plural(all.length, "jogo aguardando", "jogos aguardando")} placar`}</div>
      ${shown.length ? `<div class="lanc-list">${shown.map((m) => cardHtml(m, t)).join("")}</div>` : `<div class="card empty-state"><div class="big">🔎</div><p>Nenhum jogo sem resultado encontrado para "<b>${esc(query)}</b>".</p></div>`}
      ${list.length > limit ? `<div style="text-align:center;margin-top:12px"><button class="btn" data-more>Mostrar mais ${Math.min(PAGE_SIZE, list.length - limit)} jogos</button></div>` : ""}`;
  }

  function render() {
    const tids = S.db.tournaments();
    let tid = currentTid();
    if (tid && !launchable(tid).length) {
      const withGames = tids.find((t) => launchable(t.id).length);
      if (withGames && !S.lancPicked) tid = S.tid = withGames.id;
    }
    el.innerHTML = `
      <div class="page-head"><div class="grow"><h1>Lançamentos/Placares</h1>
        <div class="sub">Busque o jogo e lance o placar. Aqui aparecem só jogos <b>sem resultado</b>.${isAdmin() ? " Para alterar placares já lançados use Partidas ou Chaveamento." : " Placar já lançado só o administrador pode alterar."}</div></div></div>
      ${tid ? `<div class="toolbar"><span class="muted">Campeonato:</span>${tournamentSelect(tid)}</div>
        <div class="toolbar"><div class="search-big"><input type="search" id="q" placeholder="Buscar jogo: equipe, jogador, rodada, dia, grupo…" value="${esc(query)}" autocomplete="off"></div></div>
        <div id="list">${listHtml(tid)}</div>`
      : `<div class="card empty-state"><div class="big">🏆</div><p>Nenhum campeonato cadastrado ainda.</p></div>`}`;
    if (!tid) return;
    el.querySelector("#sel-t").addEventListener("change", (e) => { S.tid = +e.target.value; S.lancPicked = true; limit = PAGE_SIZE; render(); });
    const q = el.querySelector("#q");
    q.addEventListener("input", () => { query = q.value; limit = PAGE_SIZE; renderList(tid); });
    bindList(tid);
  }

  function renderList(tid) {
    const box = el.querySelector("#list");
    box.innerHTML = listHtml(tid);
    bindList(tid);
  }

  function bindList(tid) {
    const t = S.db.tournament(tid);
    const box = el.querySelector("#list");
    box.querySelector("[data-more]")?.addEventListener("click", () => { limit += PAGE_SIZE; renderList(tid); });
    box.querySelectorAll(".lanc").forEach((card) => {
      const mid = +card.dataset.m;
      const d = () => { if (!drafts.has(mid)) drafts.set(mid, {}); return drafts.get(mid); };
      card.querySelectorAll("input[data-k]").forEach((i) => i.addEventListener("input", () => {
        d()[i.dataset.k] = i.value;
        const pens = card.querySelector(".pens");
        if (pens) pens.hidden = !(d().hs !== undefined && d().hs !== "" && d().hs === d().as);
        card.querySelectorAll("[data-quick]").forEach((b) => b.classList.toggle("primary", b.dataset.quick === `${d().hs}-${d().as}`));
      }));
      card.querySelectorAll("input[data-k]").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") card.querySelector("[data-save]").click(); }));
      card.querySelectorAll("[data-quick]").forEach((b) => b.addEventListener("click", () => {
        const [h, a] = b.dataset.quick.split("-");
        Object.assign(d(), { hs: h, as: a });
        card.querySelector('[data-k="hs"]').value = h;
        card.querySelector('[data-k="as"]').value = a;
        card.querySelectorAll("[data-quick]").forEach((x) => x.classList.toggle("primary", x === b));
      }));
      card.querySelector("[data-sc]")?.addEventListener("click", async () => {
        const r = await scorersDialog(S.db.match(mid), d().scorers || {});
        if (r) { d().scorers = r; renderList(tid); }
      });
      card.querySelector("[data-save]").addEventListener("click", () => confirmAndSave(tid, t, mid, d(), card.querySelector("[data-save]")));
    });
  }

  function confirmAndSave(tid, t, mid, d, btn) {
    const m = S.db.match(mid);
    if (d.hs === undefined || d.hs === "" || d.as === undefined || d.as === "") return toast("Informe o placar das duas equipes.", "err");
    const hn = S.db.teamName(m.home_id), an = S.db.teamName(m.away_id);
    const pen = d.hs === d.as && m.stage === "mata" && C.temPenaltis(t.game) ? ` (pênaltis ${d.hp ?? "?"} x ${d.ap ?? "?"})` : "";
    const md = modal(`<h2>Confirmar placar</h2><p class="muted">${esc(phaseText(m))}</p>
      <div class="card" style="text-align:center;font-size:17px"><b>${esc(hn)}</b> <span class="gold" style="font-size:22px;font-weight:800;margin:0 8px">${esc(d.hs)} x ${esc(d.as)}</span> <b>${esc(an)}</b>${pen ? `<div class="small gold">${esc(pen)}</div>` : ""}</div>
      ${isAdmin() ? "" : `<p class="small muted">Depois de lançado, só o administrador pode alterar este placar.</p>`}
      <div class="foot"><button class="btn primary big" style="flex:1" data-ok>Confirmar e lançar</button><button class="btn big" data-close>Voltar</button></div>`);
    md.el.querySelector("[data-ok]").addEventListener("click", async (e) => {
      const [ok] = await run(() => op("saveResult", { id: mid, hs: d.hs, as: d.as, hp: d.hp ?? null, ap: d.ap ?? null, scorers: d.scorers || null, expectUnplayed: true }), e.target);
      md.close();
      if (ok) {
        drafts.delete(mid);
        toast(`Placar lançado: ${hn} ${d.hs} x ${d.as} ${an}`);
        const tt = S.db.tournament(tid);
        if (tt.champion_id) toast(`🏆 ${S.db.teamName(tt.champion_id)} é o campeão de ${tt.name}!`, "ok", 8000);
      }
      render();
    });
  }

  return { mount(e) { el = e; render(); if (window.innerWidth > 760) setTimeout(() => el.querySelector("#q")?.focus(), 50); }, refresh: render };
}
