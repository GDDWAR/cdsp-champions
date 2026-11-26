/*
 * CDSP Champions — motor do campeonato (mesma lógica do sistema desktop, core.py).
 * Roda igual no navegador (telas, tabelas, PDF) e no servidor Netlify (gravação com permissões).
 * O "banco" é um objeto JSON simples (state); a classe Db aplica as regras sobre ele.
 */

export const SISTEMA = "CDSP Champions";
export const CATEGORIAS = { 1: "Individual", 2: "Duplas", 3: "Trios", 11: "Times de 11" };
export const FORMATOS = {
  liga: "Pontos corridos (estilo Brasileirão)",
  grupos_mata: "Fase de grupos + mata-mata (estilo Copa)",
  mata: "Mata-mata",
  grupos: "Somente fase de grupos",
  dias: "Campeonato por dias (ciclo + final)",
};
export const FORMATO_CURTO = {
  liga: "Pontos corridos", grupos_mata: "Grupos + mata-mata", mata: "Mata-mata",
  grupos: "Fase de grupos", dias: "Por dias",
};
export const MODALIDADES = { futebol: "Futebol", domino: "Dominó", truco: "Truco" };
// termos das tabelas: [pró, contra, saldo, unidade]
const TERMOS = {
  futebol: ["GP", "GC", "SG", "gols"],
  domino: ["PP", "PC", "SP", "pontos"],
  truco: ["PP", "PC", "SP", "pontos"],
};
export const PLACARES_2PTS = [[2, 0], [2, 1], [1, 2], [0, 2]];
export const META_PADRAO = 100;
export const FINAL_MODES = {
  auto: "Automático (pelo nº de participantes)",
  final: "Só a final (1º x 2º)",
  semis: "Semifinal + final (top 4)",
  quartas: "Quartas + semi + final (top 8)",
  oitavas: "Oitavas + quartas + semi + final (top 16)",
};
const CHAVE_POR_MODO = { final: 2, semis: 4, quartas: 8, oitavas: 16 };
const MODO_POR_CHAVE = { 2: "final", 4: "semis", 8: "quartas", 16: "oitavas" };
export const THIRD = "Disputa de 3º lugar";

export const termos = (game) => TERMOS[game || "futebol"] || TERMOS.futebol;
export const temPenaltis = (game) => (game || "futebol") === "futebol";
export const ate2Pontos = (game) => ["domino", "truco"].includes(game || "futebol");
export const usaMeta = (game, fmt) => ate2Pontos(game) && fmt === "liga";
export function pontuacaoPadrao(game, fmt) {
  if (usaMeta(game, fmt)) return [3, 0, 0];
  return ate2Pontos(game) ? [2, 0, 0] : [3, 1, 0];
}

export class UserError extends Error {}
const fail = (msg) => { throw new UserError(msg); };

export function chaveAutomatica(n) {
  let b = 2;
  while (b + 2 <= n) b *= 2;
  return b;
}

export function fasesDaChave(b) {
  const nomes = [];
  while (b >= 2) {
    nomes.push({ 2: "Final", 4: "Semifinal", 8: "Quartas de final", 16: "Oitavas de final" }[b] || `${b / 2}-avos de final`);
    b = Math.floor(b / 2);
  }
  return nomes;
}

export function resolverFaseFinal(n, modo) {
  let b;
  if (!modo || modo === "auto") b = chaveAutomatica(n);
  else if (String(modo).startsWith("chave")) b = parseInt(String(modo).slice(5), 10);
  else b = CHAVE_POR_MODO[modo] || 2;
  if (b > 2 && n < b / 2 + 1) {
    const nome = { 4: "Semifinal", 8: "Quartas de final", 16: "Oitavas de final" }[b] || "Essa fase";
    fail(`${nome} exige pelo menos ${b / 2 + 1} participantes.`);
  }
  return { modo: MODO_POR_CHAVE[b] || `chave${b}`, chave: b, classificados: Math.min(n, b), fora: n - Math.min(n, b) };
}

export function infoFaseFinal(t, n) {
  try {
    const r = resolverFaseFinal(n, t.final_mode);
    return { chave: r.chave, classificados: r.classificados, fases: fasesDaChave(r.chave) };
  } catch (e) {
    return { chave: 2, classificados: Math.min(n, 2), fases: fasesDaChave(2) };
  }
}

export function descricaoFaseFinal(modo) {
  if (modo && FINAL_MODES[modo] && modo !== "auto") return FINAL_MODES[modo];
  if (String(modo || "").startsWith("chave")) return fasesDaChave(parseInt(String(modo).slice(5), 10)).join(" + ");
  return "";
}

export function comArtigo(fase) {
  const f = fase.toLowerCase();
  return (f.startsWith("quartas") || f.startsWith("oitavas") || f.includes("avos") ? "as " : "a ") + f;
}

export function seedOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const m = order.length * 2 + 1;
    order = order.flatMap((s) => [s, m - s]);
  }
  return order;
}

export const roundLabel = (nTeams) =>
  ({ 2: "Final", 4: "Semifinal", 8: "Quartas de final", 16: "Oitavas de final" }[nTeams] || `${nTeams / 2}-avos de final`);

/** Método do círculo (todos contra todos). Turnos pares invertem o mando. */
export function rrRounds(teamIds, turnos = 1) {
  let teams = [...teamIds];
  if (teams.length % 2) teams.push(null);
  const n = teams.length;
  const base = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = teams[i], b = teams[n - 1 - i];
      if (a !== null && b !== null) pairs.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    base.push(pairs);
    teams = [teams[0], teams[teams.length - 1], ...teams.slice(1, -1)];
  }
  const flip = (rd) => rd.map(([a, b]) => [b, a]);
  let rounds = [];
  for (let t = 0; t < Math.max(1, turnos); t++) rounds = rounds.concat(t % 2 === 0 ? base : base.map(flip));
  return rounds;
}

/** Rodadas para que CADA participante jogue exatamente `meta` partidas. */
export function metaRounds(teamIds, meta) {
  const ids = [...teamIds];
  const n = ids.length;
  meta = parseInt(meta, 10);
  if (n < 2) fail("Selecione pelo menos 2 participantes.");
  if (n % 2 && meta % 2)
    fail(`Com ${n} participantes (número ímpar) a meta de vitórias precisa ser par para todos jogarem a mesma ` +
      `quantidade de partidas. Use ${meta - 1} ou ${meta + 1}.`);
  const base = rrRounds(ids, 1);
  const perTurno = n - 1;
  const full = Math.floor(meta / perTurno), rest = meta % perTurno;
  const flip = (rd) => rd.map(([a, b]) => [b, a]);
  let rounds = [];
  for (let k = 0; k < full; k++) rounds = rounds.concat(k % 2 === 0 ? base : base.map(flip));
  if (rest) {
    const fl = full % 2 === 1;
    if (n % 2 === 0) {
      const extra = base.slice(0, rest);
      rounds = rounds.concat(fl ? extra.map(flip) : extra);
    } else {
      let edges = [];
      for (let d = 1; d <= rest / 2; d++) for (let i = 0; i < n; i++) edges.push([ids[i], ids[(i + d) % n]]);
      const left = new Map(ids.map((t) => [t, rest]));
      while (edges.length) {
        const busy = new Set(), rnd = [];
        const sorted = [...edges].sort((e1, e2) => (left.get(e2[0]) + left.get(e2[1])) - (left.get(e1[0]) + left.get(e1[1])));
        for (const e of sorted) {
          if (!busy.has(e[0]) && !busy.has(e[1])) { rnd.push(e); busy.add(e[0]); busy.add(e[1]); }
        }
        for (const e of rnd) {
          edges.splice(edges.indexOf(e), 1);
          left.set(e[0], left.get(e[0]) - 1);
          left.set(e[1], left.get(e[1]) - 1);
        }
        rounds.push(fl ? flip(rnd) : rnd);
      }
    }
  }
  return rounds;
}

export function planMeta(n, meta, ptsWin = 3) {
  n = parseInt(n, 10); meta = parseInt(meta, 10);
  if (!(meta >= 1)) fail("A meta de vitórias precisa ser maior que zero.");
  const rounds = metaRounds([...Array(n).keys()], meta);
  return { n, meta, objetivo: meta * ptsWin, rounds: rounds.length, games: rounds.reduce((s, r) => s + r.length, 0) };
}

export function planDays(n, days, finalMode = "auto", turnos = 0) {
  n = parseInt(n, 10); days = parseInt(days, 10); turnos = parseInt(turnos || 0, 10);
  if (!(n >= 2)) fail("Selecione pelo menos 2 participantes.");
  if (!(days >= 1)) fail("Informe o número de dias.");
  const ff = resolverFaseFinal(n, finalMode);
  const fases = fasesDaChave(ff.chave);
  const finalDays = fases.length;
  const cycle = days - finalDays;
  if (cycle < 1) fail(`Com essa fase final são necessários pelo menos ${finalDays + 1} dias.`);
  const r = n % 2 === 0 ? n - 1 : n;
  const auto = turnos <= 0;
  if (auto) turnos = Math.max(1, Math.ceil(cycle / r));
  const total = turnos * r;
  const perDay = [];
  for (let d = 0; d < cycle; d++) perDay.push(Math.floor(((d + 1) * total) / cycle) - Math.floor((d * total) / cycle));
  return {
    n, days, cycle, final_days: finalDays, rounds_per_turno: r, turnos, total_rounds: total, per_day: perDay,
    matches_per_round: Math.floor(n / 2), games: total * Math.floor(n / 2), games_per_team: turnos * (n - 1),
    empty_days: perDay.filter((x) => x === 0).length, auto, modo: ff.modo, chave: ff.chave,
    classificados: ff.classificados, fora: ff.fora, fases, folgas: ff.chave > 2 ? Math.max(0, ff.chave - n) : 0,
  };
}

export function srcLabel(src) {
  const p = src.split(":");
  if (p[0] === "L") return `${p[1]}º colocado`;
  if (p[0] === "G") return `${p[2]}º Grupo ${p[1]}`;
  return src;
}

export function now() {
  const d = new Date();
  const f = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  return f.format(d).replace("T", " ");
}

const cmpName = (a, b) => String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" });

export function emptyState() {
  return {
    version: 1, seq: { player: 0, team: 0, tournament: 0, match: 0 },
    players: [], teams: [], tournaments: [], tteams: [], matches: [], goals: [],
  };
}

/* ======================================================================= */
export class Db {
  constructor(state) {
    this.s = state || emptyState();
    for (const k of ["players", "teams", "tournaments", "tteams", "matches", "goals"]) this.s[k] = this.s[k] || [];
    this.s.seq = Object.assign({ player: 0, team: 0, tournament: 0, match: 0 }, this.s.seq || {});
    this._reindex();
  }

  _reindex() {
    this._p = new Map(this.s.players.map((x) => [x.id, x]));
    this._t = new Map(this.s.teams.map((x) => [x.id, x]));
    this._tor = new Map(this.s.tournaments.map((x) => [x.id, x]));
    this._m = new Map(this.s.matches.map((x) => [x.id, x]));
  }

  _next(kind) { this.s.seq[kind] = (this.s.seq[kind] || 0) + 1; return this.s.seq[kind]; }

  /* ------------------------------------------------------------ JOGADORES */
  player(pid) { return this._p.get(pid) || null; }

  players({ onlyActive = false, search = "" } = {}) {
    const q = search.trim().toLowerCase();
    return this.s.players
      .filter((p) => (!onlyActive || p.active) && (!q || p.name.toLowerCase().includes(q) || (p.nickname || "").toLowerCase().includes(q)))
      .sort((a, b) => cmpName(a.name, b.name));
  }

  addPlayer(name, nickname = "", position = "") {
    name = String(name || "").trim();
    if (!name) fail("Informe o nome do jogador.");
    const p = { id: this._next("player"), name, nickname: String(nickname || "").trim(), position: String(position || "").trim(), active: 1, created_at: now() };
    this.s.players.push(p); this._p.set(p.id, p);
    return p.id;
  }

  addPlayersBulk(text) {
    const existing = new Set(this.s.players.map((p) => p.name.toLowerCase()));
    let added = 0;
    for (const line of String(text || "").split(/\r?\n/)) {
      const n = line.trim().replace(/^[,;]+|[,;]+$/g, "").trim();
      if (n && !existing.has(n.toLowerCase())) { this.addPlayer(n); existing.add(n.toLowerCase()); added++; }
    }
    return added;
  }

  updatePlayer(pid, name, nickname, position, active = 1) {
    const p = this.player(pid) || fail("Jogador não encontrado.");
    name = String(name || "").trim();
    if (!name) fail("Informe o nome do jogador.");
    Object.assign(p, { name, nickname: String(nickname || "").trim(), position: String(position || "").trim(), active: active ? 1 : 0 });
    for (const t of this.s.teams) if (t.size === 1 && t.members.includes(pid)) t.name = name;
  }

  deletePlayer(pid) {
    this.s.players = this.s.players.filter((p) => p.id !== pid);
    for (const t of this.s.teams) t.members = t.members.filter((x) => x !== pid);
    this.s.goals = this.s.goals.filter((g) => g.player_id !== pid);
    this._reindex();
  }

  /* ------------------------------------------------------------ EQUIPES */
  team(tid) { return this._t.get(tid) || null; }
  teamName(tid) { const t = this.team(tid); return t ? t.name : ""; }

  teams(size = null, includeSolo = false) {
    if (size) return this.s.teams.filter((t) => t.size === size).sort((a, b) => cmpName(a.name, b.name));
    return this.s.teams.filter((t) => includeSolo || t.size > 1).sort((a, b) => a.size - b.size || cmpName(a.name, b.name));
  }

  teamMembers(tid) {
    const t = this.team(tid);
    if (!t) return [];
    return t.members.map((pid) => this.player(pid)).filter(Boolean).sort((a, b) => cmpName(a.name, b.name));
  }

  addTeam(name, size, playerIds) {
    playerIds = [...new Set(playerIds.map(Number))];
    if (playerIds.length !== size) fail(`A equipe precisa ter exatamente ${size} jogador(es). Selecionados: ${playerIds.length}.`);
    name = String(name || "").trim();
    if (!name) fail("Informe o nome da equipe.");
    for (const pid of playerIds) if (!this.player(pid)) fail("Jogador não encontrado.");
    const t = { id: this._next("team"), name, size, members: playerIds, logo: null, created_at: now() };
    this.s.teams.push(t); this._t.set(t.id, t);
    return t.id;
  }

  updateTeam(tid, name, playerIds) {
    const t = this.team(tid) || fail("Equipe não encontrada.");
    playerIds = [...new Set(playerIds.map(Number))];
    if (playerIds.length !== t.size) fail(`A equipe precisa ter exatamente ${t.size} jogador(es).`);
    name = String(name || "").trim();
    if (!name) fail("Informe o nome da equipe.");
    t.name = name; t.members = playerIds;
  }

  setTeamLogo(tid, version) {
    const t = this.team(tid) || fail("Equipe não encontrada.");
    t.logo = version || null;
  }

  deleteTeam(tid) {
    if (this.s.tteams.some((x) => x.team_id === tid)) fail("Esta equipe participa de campeonato(s). Exclua o campeonato antes.");
    this.s.teams = this.s.teams.filter((t) => t.id !== tid);
    this._reindex();
  }

  soloTeam(pid) {
    const t = this.s.teams.find((x) => x.size === 1 && x.members.includes(pid));
    if (t) return t.id;
    const p = this.player(pid) || fail("Jogador não encontrado.");
    return this.addTeam(p.name, 1, [pid]);
  }

  drawTeams(playerIds, size) {
    const ids = [...playerIds.map(Number)];
    if (ids.length < size * 2) fail(`Selecione pelo menos ${size * 2} jogadores para sortear 2 equipes.`);
    shuffle(ids);
    const n = Math.floor(ids.length / size);
    const prefix = { 2: "Dupla", 3: "Trio", 11: "Time" }[size] || "Equipe";
    const existing = new Set(this.s.teams.map((t) => t.name));
    const created = [];
    let k = 1;
    for (let i = 0; i < n; i++) {
      while (existing.has(`${prefix} ${k}`)) k++;
      const name = `${prefix} ${k}`;
      existing.add(name);
      created.push(this.addTeam(name, size, ids.slice(i * size, (i + 1) * size)));
    }
    return { created, leftover: ids.slice(n * size) };
  }

  /* ------------------------------------------------------------ CAMPEONATOS */
  tournament(tid) { return this._tor.get(tid) || null; }

  tournaments(season = null) {
    return this.s.tournaments.filter((t) => !season || t.season === season).sort((a, b) => b.id - a.id);
  }

  seasons() { return [...new Set(this.s.tournaments.map((t) => t.season))].sort().reverse(); }

  deleteTournament(tid) {
    const mids = new Set(this.s.matches.filter((m) => m.tournament_id === tid).map((m) => m.id));
    this.s.tournaments = this.s.tournaments.filter((t) => t.id !== tid);
    this.s.tteams = this.s.tteams.filter((x) => x.tournament_id !== tid);
    this.s.matches = this.s.matches.filter((m) => m.tournament_id !== tid);
    this.s.goals = this.s.goals.filter((g) => !mids.has(g.match_id));
    this._reindex();
  }

  tournamentTeams(tid, group = null) {
    return this.s.tteams
      .filter((x) => x.tournament_id === tid && (group === null || x.group_name === group))
      .map((x) => ({ ...this.team(x.team_id), group_name: x.group_name }))
      .filter((x) => x.id)
      .sort((a, b) => cmpName(a.group_name, b.group_name) || cmpName(a.name, b.name));
  }

  groups(tid) {
    return [...new Set(this.s.tteams.filter((x) => x.tournament_id === tid && x.group_name).map((x) => x.group_name))].sort();
  }

  createTournament(o) {
    const {
      name, season, size, fmt, doubleRound = false, pts = [3, 1, 0], nGroups = 2, qualifiers = 2,
      thirdPlace = false, doShuffle = true, days = 5, daysPerWeek = 5, turnos = 0, game = "futebol",
    } = o;
    let finalMode = o.finalMode || "auto";
    let teamIds = [...new Set((o.teamIds || []).map(Number))];
    if (!String(name || "").trim()) fail("Informe o nome do campeonato.");
    if (!CATEGORIAS[size]) fail("Categoria inválida.");
    if (!FORMATOS[fmt]) fail("Formato inválido.");
    if (teamIds.length < 2) fail("Selecione pelo menos 2 participantes.");
    for (const t of teamIds) if (!this.team(t)) fail("Participante não encontrado.");
    const ng = parseInt(nGroups, 10), q = parseInt(qualifiers, 10);
    if (fmt === "grupos_mata" && thirdPlace && ng * q === 2) {
      const menor = Math.floor(teamIds.length / ng);
      if ((ng === 1 && menor < 4) || (ng === 2 && menor < 2))
        fail("Para a disputa de 3º lugar é preciso ter mais 2 participantes além dos que vão para a final (ex.: 1 grupo com pelo menos 4).");
    }
    if (fmt === "grupos" || fmt === "grupos_mata") {
      if (!(ng >= 1)) fail("Número de grupos inválido.");
      if (teamIds.length < ng * 2) fail(`Para ${ng} grupos são necessários pelo menos ${ng * 2} participantes.`);
      if (fmt === "grupos_mata" && !(q >= 1)) fail("Informe quantos se classificam por grupo.");
      if (fmt === "grupos_mata" && q > Math.floor(teamIds.length / ng)) fail("Classificados por grupo maior que o tamanho do grupo.");
    }
    const g = MODALIDADES[game] ? game : "futebol";
    let meta = usaMeta(g, fmt) ? parseInt(o.meta || 0, 10) : 0;
    if (usaMeta(g, fmt) && !(meta >= 1)) fail("Informe a meta de vitórias (ex.: 100 = objetivo de 300 pontos).");
    if (meta) metaRounds(teamIds, meta);
    let plan = null;
    if (fmt === "dias") {
      plan = planDays(teamIds.length, days, finalMode, turnos);
      finalMode = plan.modo;
    }
    const p = pts.map((x) => parseInt(x, 10) || 0);
    const t = {
      id: this._next("tournament"), name: String(name).trim(), season: String(season || "").trim() || "Geral",
      size, format: fmt, double_round: doubleRound ? 1 : 0, pts_win: p[0], pts_draw: p[1], pts_loss: p[2],
      n_groups: fmt === "grupos" || fmt === "grupos_mata" ? ng : 0, qualifiers: q || 2, third_place: thirdPlace ? 1 : 0,
      status: "Em andamento", champion_id: null, created_at: now(),
      days: plan ? parseInt(days, 10) : null, days_per_week: parseInt(daysPerWeek || 5, 10) || 5,
      final_mode: plan ? finalMode : null, turnos: plan ? plan.turnos : null, game: g, meta,
    };
    this.s.tournaments.push(t); this._tor.set(t.id, t);
    const tid = t.id;
    const ids = [...teamIds];
    if (doShuffle) shuffle(ids);
    const addTT = (team, group = "") => this.s.tteams.push({ tournament_id: tid, team_id: team, group_name: group });
    if (fmt === "liga") {
      ids.forEach((x) => addTT(x));
      if (meta) {
        metaRounds(ids, meta).forEach((pairs, i) => pairs.forEach(([a, b]) =>
          this._addMatch({ tournament_id: tid, stage: "liga", round: i + 1, round_name: `Rodada ${i + 1}`, home_id: a, away_id: b })));
      } else this._roundRobin(tid, ids, "liga", "", doubleRound ? 2 : 1);
    } else if (fmt === "dias") {
      ids.forEach((x) => addTT(x));
      const rounds = rrRounds(ids, plan.turnos);
      const dayOfRound = [];
      plan.per_day.forEach((k, d) => { for (let i = 0; i < k; i++) dayOfRound.push(d + 1); });
      rounds.forEach((pairs, i) => pairs.forEach(([a, b]) =>
        this._addMatch({ tournament_id: tid, stage: "liga", round: i + 1, round_name: `Rodada ${i + 1}`, home_id: a, away_id: b, day: dayOfRound[i] })));
      const last = parseInt(days, 10);
      if (plan.chave > 2) {
        const seeds = [];
        for (let i = 1; i <= plan.classificados; i++) seeds.push(`L:${i}`);
        const nf = plan.fases.length;
        const dl = [];
        for (let d = last - nf + 1; d <= last; d++) dl.push(d);
        this._knockout(tid, seeds, thirdPlace, dl);
      } else {
        const fid = this._knockout(tid, ["L:1", "L:2"], false, [last]);
        if (thirdPlace && ids.length >= 4) {
          const f = this.match(fid[fid.length - 1][0]);
          this._addMatch({ tournament_id: tid, stage: "mata", round: f.round, round_name: THIRD, slot: 1, home_src: "L:3", away_src: "L:4", day: last });
        }
      }
    } else if (fmt === "grupos" || fmt === "grupos_mata") {
      const keys = [];
      for (let i = 0; i < ng; i++) keys.push(String.fromCharCode(65 + i));
      const groups = Object.fromEntries(keys.map((k) => [k, []]));
      ids.forEach((x, i) => {
        const r = Math.floor(i / ng), c = i % ng;
        groups[r % 2 === 0 ? keys[c] : keys[ng - 1 - c]].push(x);
      });
      for (const gk of keys) {
        groups[gk].forEach((x) => addTT(x, gk));
        this._roundRobin(tid, groups[gk], "grupos", gk, doubleRound ? 2 : 1);
      }
      if (fmt === "grupos_mata")
        this._groupsKnockout(tid, Object.fromEntries(keys.map((k) => [k, groups[k].length])), q, thirdPlace);
    } else if (fmt === "mata") {
      ids.forEach((x) => addTT(x));
      this._knockout(tid, ids, thirdPlace);
    }
    this.resolveSources(tid);
    return tid;
  }

  _addMatch(fields) {
    const m = Object.assign({
      id: this._next("match"), tournament_id: null, stage: "liga", round: 1, round_name: "", group_name: "", slot: 0,
      home_id: null, away_id: null, home_score: null, away_score: null, home_pen: null, away_pen: null,
      played: 0, is_bye: 0, winner_id: null, next_match_id: null, next_slot: null, loser_next_match_id: null,
      loser_next_slot: null, played_at: null, played_by: null, day: null, home_src: null, away_src: null,
    }, fields);
    this.s.matches.push(m); this._m.set(m.id, m);
    return m.id;
  }

  _roundRobin(tid, teamIds, stage, group, turnos) {
    rrRounds(teamIds, turnos).forEach((pairs, i) => pairs.forEach(([a, b]) =>
      this._addMatch({ tournament_id: tid, stage, round: i + 1, round_name: `Rodada ${i + 1}`, group_name: group, home_id: a, away_id: b })));
  }

  _knockout(tid, seeds, thirdPlace = false, days = null) {
    const n = seeds.length;
    let size = 1;
    while (size < n) size *= 2;
    const nRounds = Math.round(Math.log2(size));
    const order = seedOrder(size);
    const slots = order.map((s) => (s <= n ? seeds[s - 1] : null));
    avoidSameGroup(slots);
    const base = Math.max(0, ...this.s.matches.filter((m) => m.tournament_id === tid).map((m) => m.round));
    const dayFor = (r) => (days ? (r >= nRounds - days.length ? days[r - (nRounds - days.length)] : days[0]) : null);
    const roundsIds = [];
    for (let r = 0; r < nRounds; r++) {
      const nMatches = size / 2 ** (r + 1);
      const label = roundLabel(nMatches * 2);
      const ids = [];
      for (let s = 0; s < nMatches; s++)
        ids.push(this._addMatch({ tournament_id: tid, stage: "mata", round: base + r + 1, round_name: label, slot: s, day: dayFor(r) }));
      roundsIds.push(ids);
    }
    for (let r = 0; r < nRounds - 1; r++)
      roundsIds[r].forEach((mid, s) => Object.assign(this.match(mid), { next_match_id: roundsIds[r + 1][Math.floor(s / 2)], next_slot: s % 2 === 0 ? "home" : "away" }));
    if (thirdPlace && nRounds >= 2) {
      const tp = this._addMatch({ tournament_id: tid, stage: "mata", round: base + nRounds, round_name: THIRD, slot: 1, day: dayFor(nRounds - 1) });
      roundsIds[nRounds - 2].forEach((mid, s) => Object.assign(this.match(mid), { loser_next_match_id: tp, loser_next_slot: s % 2 === 0 ? "home" : "away" }));
    }
    roundsIds[0].forEach((mid, s) => {
      const h = slots[2 * s], a = slots[2 * s + 1];
      Object.assign(this.match(mid), {
        home_id: typeof h === "number" ? h : null, home_src: typeof h === "string" ? h : null,
        away_id: typeof a === "number" ? a : null, away_src: typeof a === "string" ? a : null,
        is_bye: (h === null) !== (a === null) ? 1 : 0,
      });
    });
    for (const mid of roundsIds[0]) {
      const m = this.match(mid);
      if (m.is_bye && (m.home_id || m.away_id)) {
        m.played = 1; m.winner_id = m.home_id || m.away_id;
        this._advance(m);
      }
    }
    return roundsIds;
  }

  _advance(m) {
    if (m.next_match_id && m.winner_id) this.match(m.next_match_id)[m.next_slot === "home" ? "home_id" : "away_id"] = m.winner_id;
    if (m.loser_next_match_id && m.winner_id && !m.is_bye) {
      const loser = m.winner_id === m.home_id ? m.away_id : m.home_id;
      this.match(m.loser_next_match_id)[m.loser_next_slot === "home" ? "home_id" : "away_id"] = loser;
    }
  }

  _stageDone(tid, stage, group = null) {
    return !this.s.matches.some((m) => m.tournament_id === tid && m.stage === stage && !m.played && (!group || m.group_name === group));
  }

  _srcTeam(tid, src, cache) {
    if (cache.has(src)) return cache.get(src);
    const p = src.split(":");
    let team = null;
    if (p[0] === "L" && this._stageDone(tid, "liga")) {
      if (!cache.has("_L")) cache.set("_L", this.standings(tid));
      const st = cache.get("_L"), pos = parseInt(p[1], 10);
      team = pos <= st.length ? st[pos - 1].team_id : null;
    } else if (p[0] === "G" && this._stageDone(tid, "grupos", p[1])) {
      if (!cache.has("_G" + p[1])) cache.set("_G" + p[1], this.standings(tid, p[1]));
      const st = cache.get("_G" + p[1]), pos = parseInt(p[2], 10);
      team = pos <= st.length ? st[pos - 1].team_id : null;
    }
    cache.set(src, team);
    return team;
  }

  resolveSources(tid) {
    const cache = new Map();
    const list = this.s.matches.filter((m) => m.tournament_id === tid && m.stage === "mata" && (m.home_src || m.away_src)).sort((a, b) => a.id - b.id);
    for (const m of list) {
      const h = m.home_src ? this._srcTeam(tid, m.home_src, cache) : m.home_id;
      const a = m.away_src ? this._srcTeam(tid, m.away_src, cache) : m.away_id;
      if (m.is_bye) {
        const w = h || a;
        if (w && !m.played) {
          Object.assign(m, { home_id: h, away_id: a, played: 1, winner_id: w });
          this._advance(m);
        } else if (!w && m.played) {
          const nxt = m.next_match_id ? this.match(m.next_match_id) : null;
          if (nxt && !nxt.played) nxt[m.next_slot === "home" ? "home_id" : "away_id"] = null;
          Object.assign(m, { home_id: null, away_id: null, played: 0, winner_id: null });
        }
        continue;
      }
      if (m.played) continue;
      if (h !== m.home_id || a !== m.away_id) Object.assign(m, { home_id: h, away_id: a });
    }
  }

  /** Texto para vagas vazias: '1º colocado', 'Venc. Semifinal 1'... chave = `${id}:${side}` */
  matchLabels(tid) {
    const ms = this.s.matches.filter((m) => m.tournament_id === tid);
    const lab = new Map();
    const oneGroup = this.groups(tid).length === 1;
    const label = (src) => (oneGroup && src.startsWith("G:") ? `${src.split(":")[2]}º colocado` : srcLabel(src));
    for (const m of ms) {
      if (m.home_src) lab.set(`${m.id}:home`, label(m.home_src));
      if (m.away_src) lab.set(`${m.id}:away`, label(m.away_src));
    }
    for (const m of ms) {
      if (m.next_match_id) {
        const k = `${m.next_match_id}:${m.next_slot}`;
        if (!lab.has(k)) lab.set(k, `Venc. ${m.round_name} ${m.slot + 1}`);
      }
      if (m.loser_next_match_id) {
        const k = `${m.loser_next_match_id}:${m.loser_next_slot}`;
        if (!lab.has(k)) lab.set(k, `Perd. ${m.round_name} ${m.slot + 1}`);
      }
    }
    return lab;
  }

  generateKnockoutFromGroups(tid) {
    const t = this.tournament(tid) || fail("Campeonato não encontrado.");
    if (t.format !== "grupos_mata") fail("Este campeonato não tem mata-mata após os grupos.");
    if (this.s.matches.some((m) => m.tournament_id === tid && m.stage === "mata")) fail("O mata-mata já foi gerado.");
    const sizes = Object.fromEntries(this.groups(tid).map((g) => [g, this.tournamentTeams(tid, g).length]));
    this._groupsKnockout(tid, sizes, t.qualifiers, !!t.third_place);
    this.resolveSources(tid);
  }

  _groupsKnockout(tid, groupSizes, qualifiers, thirdPlace) {
    const keys = Object.keys(groupSizes).sort();
    const srcs = [];
    for (let pos = 1; pos <= qualifiers; pos++) for (const g of keys) srcs.push(`G:${g}:${pos}`);
    if (srcs.length < 2) return;
    if (srcs.length > 2) { this._knockout(tid, srcs, thirdPlace); return; }
    const rounds = this._knockout(tid, srcs, false);
    if (!thirdPlace) return;
    const maxSize = Math.max(...Object.values(groupSizes));
    const extra = [];
    for (let pos = qualifiers + 1; pos <= maxSize; pos++) for (const g of keys) if (pos <= groupSizes[g]) extra.push(`G:${g}:${pos}`);
    if (extra.length >= 2) {
      const final = this.match(rounds[rounds.length - 1][0]);
      this._addMatch({ tournament_id: tid, stage: "mata", round: final.round, round_name: THIRD, slot: 1, home_src: extra[0], away_src: extra[1] });
    }
  }

  /* ------------------------------------------------------------ PARTIDAS */
  match(mid) { return this._m.get(mid) || null; }

  matches(tid, { stage = null, group = null, pending = false } = {}) {
    return this.s.matches
      .filter((m) => m.tournament_id === tid && (!stage || m.stage === stage) && (!group || m.group_name === group) && (!pending || !m.played))
      .sort((a, b) => ((a.day ?? a.round) - (b.day ?? b.round)) || (a.round - b.round) || cmpName(a.group_name || "", b.group_name || "") || (a.slot - b.slot) || (a.id - b.id))
      .map((m) => ({ ...m, home_name: this.teamName(m.home_id) || null, away_name: this.teamName(m.away_id) || null }));
  }

  saveResult(mid, hs, as, hp = null, ap = null, scorers = null, user = null) {
    const m = this.match(mid) || fail("Partida não encontrada.");
    if (m.home_id == null || m.away_id == null) fail("A partida ainda não tem os dois participantes definidos.");
    if (m.is_bye) fail("Esta partida é uma folga (W.O.).");
    const toInt = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
    hs = toInt(hs); as = toInt(as);
    if (!Number.isInteger(hs) || !Number.isInteger(as) || hs < 0 || as < 0) fail("Placar inválido.");
    const t = this.tournament(m.tournament_id);
    const game = t.game || "futebol";
    let winner = null;
    if (ate2Pontos(game)) {
      const mx = Math.max(hs, as), mn = Math.min(hs, as);
      if (!(mx === 2 && (mn === 0 || mn === 1)))
        fail(`No ${MODALIDADES[game].toLowerCase()} a partida vai até 2 pontos e não tem empate. Placares válidos: 2 x 0, 2 x 1, 1 x 2 ou 0 x 2.`);
      hp = ap = null;
    }
    if (m.stage === "mata") {
      if (hs === as && !temPenaltis(game)) fail(`No mata-mata de ${MODALIDADES[game]} não existe empate: informe o placar final com um vencedor.`);
      if (hs === as) {
        if (hp === null || ap === null || hp === "" || ap === "" || hp === undefined || ap === undefined) fail("Empate no mata-mata: informe o placar dos pênaltis.");
        hp = toInt(hp); ap = toInt(ap);
        if (!Number.isInteger(hp) || !Number.isInteger(ap) || hp < 0 || ap < 0) fail("Pênaltis inválidos.");
        if (hp === ap) fail("Os pênaltis não podem terminar empatados.");
        winner = hp > ap ? m.home_id : m.away_id;
      } else {
        hp = ap = null;
        winner = hs > as ? m.home_id : m.away_id;
      }
      if (m.played && m.winner_id !== winner)
        for (const nxt of [m.next_match_id, m.loser_next_match_id])
          if (nxt && this.match(nxt).played) fail("A fase seguinte já foi disputada; não é possível trocar o vencedor.");
    } else {
      hp = ap = null;
      if (hs !== as) winner = hs > as ? m.home_id : m.away_id;
    }
    // gols por jogador (valida antes de gravar)
    const newGoals = [];
    for (const [teamId, score] of [[m.home_id, hs], [m.away_id, as]]) {
      const mem = this.team(teamId)?.members || [];
      if (mem.length === 1 && score && game === "futebol") newGoals.push({ match_id: mid, player_id: mem[0], team_id: teamId, qty: score });
    }
    if (scorers && game === "futebol") {
      const homeIds = new Set(this.team(m.home_id).members), awayIds = new Set(this.team(m.away_id).members);
      let th = 0, ta = 0;
      for (const [pid, q] of Object.entries(scorers)) {
        const n = parseInt(q, 10) || 0;
        if (homeIds.has(+pid)) th += n; else if (awayIds.has(+pid)) ta += n;
      }
      if (th > hs || ta > as) fail("A soma dos gols por jogador passa do placar da equipe.");
      for (const [pid, q] of Object.entries(scorers)) {
        const n = parseInt(q, 10) || 0;
        if (n <= 0) continue;
        const team = homeIds.has(+pid) ? m.home_id : awayIds.has(+pid) ? m.away_id : null;
        if (team && this.team(team).members.length > 1) newGoals.push({ match_id: mid, player_id: +pid, team_id: team, qty: n });
      }
    }
    Object.assign(m, { home_score: hs, away_score: as, home_pen: hp, away_pen: ap, played: 1, winner_id: winner, played_at: now(), played_by: user || null });
    this.s.goals = this.s.goals.filter((g) => g.match_id !== mid).concat(newGoals);
    if (m.stage === "mata") this._advance(m);
    this._updateStatus(m.tournament_id);
  }

  clearResult(mid) {
    const m = this.match(mid) || fail("Partida não encontrada.");
    if (m.is_bye) fail("Esta partida é uma folga (W.O.).");
    if (m.stage === "mata") {
      for (const nxt of [m.next_match_id, m.loser_next_match_id])
        if (nxt && this.match(nxt).played) fail("A fase seguinte já foi disputada; apague-a primeiro.");
      if (m.next_match_id) this.match(m.next_match_id)[m.next_slot === "home" ? "home_id" : "away_id"] = null;
      if (m.loser_next_match_id) this.match(m.loser_next_match_id)[m.loser_next_slot === "home" ? "home_id" : "away_id"] = null;
    }
    Object.assign(m, { home_score: null, away_score: null, home_pen: null, away_pen: null, played: 0, winner_id: null, played_at: null, played_by: null });
    this.s.goals = this.s.goals.filter((g) => g.match_id !== mid);
    this._updateStatus(m.tournament_id);
  }

  matchScorers(mid) {
    const out = {};
    for (const g of this.s.goals) if (g.match_id === mid) out[g.player_id] = g.qty;
    return out;
  }

  _updateStatus(tid) {
    this.resolveSources(tid);
    const t = this.tournament(tid);
    const pend = this.s.matches.filter((m) => m.tournament_id === tid && !m.played).length;
    let champion = null, status = "Em andamento";
    if (t.format === "liga" && pend === 0) champion = this.standings(tid)[0]?.team_id ?? null;
    else if (t.format === "grupos" && pend === 0) status = "Finalizado";
    else if (["mata", "grupos_mata", "dias"].includes(t.format)) {
      const final = this.s.matches.find((m) => m.tournament_id === tid && m.stage === "mata" && m.round_name === "Final");
      if (final && final.played && pend === 0) champion = final.winner_id;
    }
    if (champion) status = "Finalizado";
    t.status = status; t.champion_id = champion;
  }

  /* ------------------------------------------------------------ CLASSIFICAÇÃO */
  standings(tid, group = null) {
    const t = this.tournament(tid);
    const stage = t.format === "liga" || t.format === "dias" ? "liga" : "grupos";
    const tab = new Map();
    for (const r of this.tournamentTeams(tid, group))
      tab.set(r.id, { team_id: r.id, name: r.name, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0, pts: 0, form: [] });
    for (const m of this.matches(tid, { stage, group })) {
      if (!m.played || !tab.has(m.home_id) || !tab.has(m.away_id)) continue;
      for (const [me, gf, ga] of [[m.home_id, m.home_score, m.away_score], [m.away_id, m.away_score, m.home_score]]) {
        const r = tab.get(me);
        r.j++; r.gp += gf; r.gc += ga;
        if (gf > ga) { r.v++; r.pts += t.pts_win; r.form.push("V"); }
        else if (gf === ga) { r.e++; r.pts += t.pts_draw; r.form.push("E"); }
        else { r.d++; r.pts += t.pts_loss; r.form.push("D"); }
      }
    }
    const rows = [...tab.values()];
    for (const r of rows) {
      r.sg = r.gp - r.gc;
      r.aprov = r.j && t.pts_win ? (100 * r.pts) / (r.j * t.pts_win) : 0;
      r.form = r.form.slice(-5);
    }
    rows.sort((a, b) => b.pts - a.pts || b.v - a.v || b.sg - a.sg || b.gp - a.gp || cmpName(a.name, b.name));
    rows.forEach((r, i) => (r.pos = i + 1));
    return rows;
  }

  /* ------------------------------------------------------------ INDICADORES */
  _champions({ season = null, size = null, tid = null, game = null } = {}) {
    return this.s.tournaments.filter((t) => t.champion_id && (!season || t.season === season) && (!size || t.size === size) &&
      (!tid || t.id === tid) && (!game || (t.game || "futebol") === game)).map((t) => t.champion_id);
  }

  _filteredMatches({ season = null, size = null, tid = null, game = null } = {}) {
    const out = [];
    for (const m of this.s.matches) {
      if (!m.played || m.is_bye) continue;
      const t = this.tournament(m.tournament_id);
      if (!t || (game && (t.game || "futebol") !== game) || (season && t.season !== season) || (size && t.size !== size) || (tid && t.id !== tid)) continue;
      out.push({ ...m, size: t.size });
    }
    return out.sort((a, b) => String(a.played_at || "").localeCompare(String(b.played_at || "")) || a.id - b.id);
  }

  teamStats(f = {}) {
    const stats = new Map();
    const base = (id) => { if (!stats.has(id)) stats.set(id, { team_id: id, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0, titles: 0 }); return stats.get(id); };
    for (const m of this._filteredMatches(f)) {
      for (const [me, gf, ga] of [[m.home_id, m.home_score, m.away_score], [m.away_id, m.away_score, m.home_score]]) {
        const s = base(me);
        s.j++; s.gp += gf; s.gc += ga;
        if (m.winner_id === me) { s.v++; s.pts += 3; } else if (m.winner_id == null) { s.e++; s.pts += 1; } else s.d++;
      }
    }
    for (const c of this._champions(f)) base(c).titles++;
    const out = [];
    for (const s of stats.values()) {
      const t = this.team(s.team_id);
      if (!t) continue;
      s.name = t.name; s.size = t.size; s.sg = s.gp - s.gc;
      s.aprov = s.j ? (100 * s.pts) / (3 * s.j) : 0;
      out.push(s);
    }
    return out.sort((a, b) => b.pts - a.pts || b.aprov - a.aprov || b.sg - a.sg || b.gp - a.gp || cmpName(a.name, b.name));
  }

  playerStats(f = {}) {
    const stats = new Map();
    const base = (pid) => {
      if (!stats.has(pid)) stats.set(pid, { player_id: pid, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0, gols: 0, titles: 0, por_cat: {} });
      return stats.get(pid);
    };
    const ms = this._filteredMatches(f);
    for (const m of ms) {
      for (const [me, gf, ga] of [[m.home_id, m.home_score, m.away_score], [m.away_id, m.away_score, m.home_score]]) {
        for (const pid of this.team(me)?.members || []) {
          const s = base(pid);
          s.j++; s.gp += gf; s.gc += ga;
          const c = (s.por_cat[m.size] = s.por_cat[m.size] || { j: 0, v: 0, e: 0, d: 0 });
          c.j++;
          if (m.winner_id === me) { s.v++; s.pts += 3; c.v++; } else if (m.winner_id == null) { s.e++; s.pts += 1; c.e++; } else { s.d++; c.d++; }
        }
      }
    }
    const mids = new Set(ms.map((m) => m.id));
    for (const g of this.s.goals) if (mids.has(g.match_id)) base(g.player_id).gols += g.qty;
    for (const c of this._champions(f)) for (const pid of this.team(c)?.members || []) base(pid).titles++;
    const out = [];
    for (const s of stats.values()) {
      const p = this.player(s.player_id);
      if (!p) continue;
      s.name = p.name; s.nickname = p.nickname; s.sg = s.gp - s.gc;
      s.aprov = s.j ? (100 * s.pts) / (3 * s.j) : 0;
      s.media_gols = s.j ? s.gols / s.j : 0;
      out.push(s);
    }
    return out.sort((a, b) => b.pts - a.pts || b.aprov - a.aprov || b.gols - a.gols || cmpName(a.name, b.name));
  }

  playerTimeline(pid, f = {}) {
    const teams = new Set(this.s.teams.filter((t) => t.members.includes(pid)).map((t) => t.id));
    const acc = [];
    let pts = 0;
    for (const m of this._filteredMatches({ ...f, tid: null })) {
      if (teams.has(m.home_id) || teams.has(m.away_id)) {
        const me = teams.has(m.home_id) ? m.home_id : m.away_id;
        pts += m.winner_id === me ? 3 : m.winner_id == null ? 1 : 0;
        acc.push(pts);
      }
    }
    return acc;
  }

  dashboard() {
    const isFut = (m) => (this.tournament(m.tournament_id)?.game || "futebol") === "futebol";
    const played = this.s.matches.filter((m) => m.played && !m.is_bye);
    return {
      players: this.s.players.length,
      teams: this.s.teams.filter((t) => t.size > 1).length,
      tournaments: this.s.tournaments.length,
      running: this.s.tournaments.filter((t) => t.status === "Em andamento").length,
      played: played.length,
      pending: this.s.matches.filter((m) => !m.played).length,
      goals: this.s.matches.filter((m) => m.played && isFut(m)).reduce((s, m) => s + (m.home_score || 0) + (m.away_score || 0), 0),
      played_fut: played.filter(isFut).length,
    };
  }

  recentResults(limit = 8) {
    return this.s.matches.filter((m) => m.played && !m.is_bye)
      .sort((a, b) => String(b.played_at || "").localeCompare(String(a.played_at || "")) || b.id - a.id)
      .slice(0, limit)
      .map((m) => ({ ...m, home_name: this.teamName(m.home_id), away_name: this.teamName(m.away_id), tname: this.tournament(m.tournament_id)?.name || "" }));
  }
}

export function avoidSameGroup(slots) {
  const grp = (v) => (typeof v === "string" && v.startsWith("G:") ? v.split(":")[1] : null);
  const pairs = Math.floor(slots.length / 2);
  for (let i = 0; i < pairs; i++) {
    const h = slots[2 * i], a = slots[2 * i + 1];
    if (grp(h) === null || grp(h) !== grp(a)) continue;
    for (let j = 0; j < pairs; j++) {
      const hj = slots[2 * j], aj = slots[2 * j + 1];
      if (j !== i && aj !== null && grp(aj) !== grp(h) && grp(hj) !== grp(a)) {
        slots[2 * i + 1] = aj; slots[2 * j + 1] = a;
        break;
      }
    }
  }
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
