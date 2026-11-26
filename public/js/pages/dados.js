// Backup, restauração e importação do sistema desktop (campeonatos.db)
import { S, restore } from "../ctx.js";
import { esc, toast, run, confirmDialog, showError } from "../ui.js";
import { emptyState } from "../core.js";

let sqlPromise = null;
function loadSqlJs() {
  if (!sqlPromise) {
    sqlPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/js/vendor/sql-wasm.js";
      s.onload = () => window.initSqlJs({ locateFile: (f) => `/js/vendor/${f}` }).then(resolve, reject);
      s.onerror = () => reject(new Error("Não foi possível carregar o leitor de banco de dados."));
      document.head.appendChild(s);
    });
  }
  return sqlPromise;
}

/** Converte o campeonatos.db do sistema desktop para o formato da versão web. */
export async function convertDesktopDb(bytes) {
  const SQL = await loadSqlJs();
  const db = new SQL.Database(new Uint8Array(bytes));
  const rows = (sql) => {
    try { const r = db.exec(sql); if (!r.length) return []; const { columns, values } = r[0]; return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]]))); }
    catch { return []; }
  };
  const cols = (table) => new Set(rows(`PRAGMA table_info(${table})`).map((r) => r.name));
  if (!cols("tournaments").size || !cols("matches").size) throw new Error("Este arquivo não parece ser o campeonatos.db do CDSP Champions.");
  const st = emptyState();
  st.players = rows("SELECT * FROM players").map((p) => ({ id: p.id, name: p.name, nickname: p.nickname || "", position: p.position || "", active: p.active ? 1 : 0, created_at: p.created_at }));
  const members = new Map();
  for (const r of rows("SELECT team_id, player_id FROM team_members")) { if (!members.has(r.team_id)) members.set(r.team_id, []); members.get(r.team_id).push(r.player_id); }
  const hasLogo = cols("teams").has("logo");
  const logos = {};
  for (const t of rows(`SELECT id, name, size, created_at${hasLogo ? ", logo" : ""} FROM teams`)) {
    let logo = null;
    if (hasLogo && t.logo && t.logo.length) {
      let bin = "";
      const u8 = t.logo;
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      logos[t.id] = "data:image/png;base64," + btoa(bin);
      logo = Date.now().toString(36);
    }
    st.teams.push({ id: t.id, name: t.name, size: t.size, members: members.get(t.id) || [], logo, created_at: t.created_at });
  }
  const tc = cols("tournaments");
  st.tournaments = rows("SELECT * FROM tournaments").map((t) => ({
    id: t.id, name: t.name, season: String(t.season ?? ""), size: t.size, format: t.format, double_round: t.double_round ? 1 : 0,
    pts_win: t.pts_win ?? 3, pts_draw: t.pts_draw ?? 1, pts_loss: t.pts_loss ?? 0, n_groups: t.n_groups ?? 0, qualifiers: t.qualifiers ?? 2,
    third_place: t.third_place ? 1 : 0, status: t.status || "Em andamento", champion_id: t.champion_id ?? null, created_at: t.created_at,
    days: tc.has("days") ? t.days ?? null : null, days_per_week: tc.has("days_per_week") ? t.days_per_week ?? 5 : 5,
    final_mode: tc.has("final_mode") ? t.final_mode ?? null : null, turnos: tc.has("turnos") ? t.turnos ?? null : null,
    game: (tc.has("game") && t.game) || "futebol", meta: tc.has("meta") ? t.meta || 0 : 0,
  }));
  st.tteams = rows("SELECT * FROM tournament_teams").map((x) => ({ tournament_id: x.tournament_id, team_id: x.team_id, group_name: x.group_name || "" }));
  st.matches = rows("SELECT * FROM matches").map((m) => ({
    id: m.id, tournament_id: m.tournament_id, stage: m.stage, round: m.round, round_name: m.round_name || "", group_name: m.group_name || "", slot: m.slot ?? 0,
    home_id: m.home_id ?? null, away_id: m.away_id ?? null, home_score: m.home_score ?? null, away_score: m.away_score ?? null,
    home_pen: m.home_pen ?? null, away_pen: m.away_pen ?? null, played: m.played ? 1 : 0, is_bye: m.is_bye ? 1 : 0, winner_id: m.winner_id ?? null,
    next_match_id: m.next_match_id ?? null, next_slot: m.next_slot ?? null, loser_next_match_id: m.loser_next_match_id ?? null,
    loser_next_slot: m.loser_next_slot ?? null, played_at: m.played_at ?? null, played_by: null, day: m.day ?? null,
    home_src: m.home_src ?? null, away_src: m.away_src ?? null,
  }));
  st.goals = rows("SELECT match_id, player_id, team_id, qty FROM goals");
  const max = (arr) => arr.reduce((m, x) => Math.max(m, x.id || 0), 0);
  st.seq = { player: max(st.players), team: max(st.teams), tournament: max(st.tournaments), match: max(st.matches) };
  db.close();
  return { state: st, logos };
}

export function create() {
  let el;
  function render() {
    const s = S.db.s;
    el.innerHTML = `
      <div class="page-head"><div class="grow"><h1>Backup e importação</h1><div class="sub">Guarde uma cópia dos dados ou traga os campeonatos do sistema desktop</div></div></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
        <div class="card"><h3>💾 Baixar backup</h3><p class="muted">Arquivo .json com todos os jogadores, equipes, escudos, campeonatos e placares. Faça de vez em quando e guarde no computador.</p>
          <p class="small">Agora: ${s.players.length} jogadores · ${s.teams.length} equipes · ${s.tournaments.length} campeonatos · ${s.matches.filter((m) => m.played).length} placares lançados</p>
          <button class="btn primary" id="b-backup">⬇ Baixar backup</button></div>
        <div class="card"><h3>♻ Restaurar backup</h3><p class="muted">Substitui <b>todos</b> os dados atuais pelos do arquivo de backup (.json). Os usuários e senhas não são alterados.</p>
          <label class="btn gold">📂 Escolher backup .json<input type="file" accept=".json,application/json" id="f-restore" hidden></label></div>
        <div class="card"><h3>🖥 Importar do sistema desktop</h3><p class="muted">Traga o arquivo <b>campeonatos.db</b> (fica na mesma pasta do CDSPChampions.exe). Jogadores, equipes, escudos, campeonatos e placares vêm junto. <b>Substitui</b> os dados atuais.</p>
          <label class="btn purple">📂 Escolher campeonatos.db<input type="file" accept=".db,.sqlite,application/octet-stream" id="f-db" hidden></label>
          <div id="imp-msg" class="small" style="margin-top:8px"></div></div>
      </div>`;

    el.querySelector("#b-backup").addEventListener("click", async (e) => {
      const [ok] = await run(async () => {
        const state = JSON.parse(JSON.stringify(S.db.s));
        const logos = {};
        for (const t of state.teams) {
          if (!t.logo) continue;
          const r = await fetch(`/api/logo/${t.id}?v=${t.logo}`, { credentials: "same-origin" });
          if (!r.ok) continue;
          const blob = await r.blob();
          logos[t.id] = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
        }
        const data = JSON.stringify({ app: "CDSP Champions", exported_at: new Date().toISOString(), state, logos });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
        a.download = `cdsp-champions-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }, e.target);
      if (ok) toast("Backup baixado.");
    });

    el.querySelector("#f-restore").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      let payload;
      try { payload = JSON.parse(await f.text()); } catch { return showError(new Error("Arquivo inválido: não é um backup do CDSP Champions.")); }
      if (!payload?.state?.matches) return showError(new Error("Arquivo inválido: não é um backup do CDSP Champions."));
      if (!(await confirmDialog("Restaurar backup", `Substituir TODOS os dados atuais pelo backup?\n${payload.state.tournaments.length} campeonatos · ${payload.state.players.length} jogadores`, { ok: "Restaurar", danger: true }))) return;
      const [ok] = await run(() => restore(payload, (i, n) => toast(`Escudos: ${i}/${n}`, "ok", 1200)));
      if (ok) { toast("Backup restaurado."); render(); }
    });

    el.querySelector("#f-db").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      const msg = el.querySelector("#imp-msg");
      msg.textContent = "Lendo o arquivo…";
      let conv;
      try { conv = await convertDesktopDb(await f.arrayBuffer()); }
      catch (err) { msg.textContent = ""; return showError(err); }
      const st = conv.state;
      msg.innerHTML = `Encontrado: <b>${st.players.length}</b> jogadores · <b>${st.teams.length}</b> equipes · <b>${Object.keys(conv.logos).length}</b> escudos · <b>${st.tournaments.length}</b> campeonatos · <b>${st.matches.filter((m) => m.played).length}</b> placares.`;
      if (!(await confirmDialog("Importar do desktop", `Substituir TODOS os dados atuais pelos do arquivo ${f.name}?`, { ok: "Importar", danger: true }))) return;
      const [ok] = await run(() => restore({ state: st, logos: conv.logos }, (i, n) => { msg.textContent = `Enviando escudos: ${i}/${n}…`; }));
      if (ok) { toast("Dados do sistema desktop importados!"); render(); }
    });
  }
  return { mount(e) { el = e; render(); }, refresh: render };
}
