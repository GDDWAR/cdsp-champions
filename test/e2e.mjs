// Teste de ponta a ponta no navegador (Playwright) contra o servidor local.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PW || "playwright");
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:8888";
const OUT = process.env.OUT || "/tmp/claude-0/shots";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
let fails = 0;
const check = (cond, msg) => { console.log((cond ? "  ok  " : "  FALHOU ") + msg); if (!cond) fails++; };

const browser = await chromium.launch();
async function newPage(ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, ...ctxOpts });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/401|403|400|Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  return { ctx, page };
}
const apiIn = (page) => (path, method = "GET", body) => page.evaluate(async ([path, method, body]) => {
  const r = await fetch("/api" + path, { method, headers: { "x-cdsp": "1", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
}, [path, method, body]);

async function login(page, u, p) {
  await page.goto(BASE + "/");
  await page.fill('input[name=username]', u);
  await page.fill('input[name=password]', p);
  await page.click('button[type=submit]');
  await page.waitForSelector("#nav", { timeout: 8000 });
}

/* ---------- admin ---------- */
console.log("Admin");
const A = await newPage();
await A.page.goto(BASE + "/");
await A.page.waitForSelector("#f-login");
await A.page.screenshot({ path: `${OUT}/01-login.png` });
await login(A.page, "admin", "admin123");
const api = apiIn(A.page);

// dados de exemplo
const nomes = ["Ana", "Bruno", "Carla", "Diego", "Eva", "Fábio", "Gabi", "Hugo", "Iara", "João", "Kátia", "Léo", "Mara", "Nico", "Otto", "Paula", "Quim", "Rita", "Saulo", "Tânia"];
let r = await api("/op", "POST", { op: "addPlayersBulk", args: { text: nomes.join("\n") } });
check(r.status === 200, "cadastro de jogadores em lote");
const pids = r.data.state.players.map((p) => p.id);
r = await api("/op", "POST", { op: "drawTeams", args: { playerIds: pids.slice(0, 10), size: 2 } });
check(r.data.result.created === 5, "sorteio de 5 duplas");
const duplas = r.data.state.teams.filter((t) => t.size === 2).map((t) => t.id);
// equipes (trios) para Copa
const trios = [];
for (let i = 0; i < 3; i++) {
  r = await api("/op", "POST", { op: "addTeam", args: { name: `Trio ${String.fromCharCode(65 + i)}`, size: 3, playerIds: pids.slice(10 + i * 3, 13 + i * 3) } });
  trios.push(r.data.result);
}
r = await api("/op", "POST", { op: "addTeam", args: { name: "Trio D", size: 3, playerIds: [pids[19], pids[0], pids[1]] } });
trios.push(r.data.result);
check(trios.every(Boolean), "4 trios cadastrados");

// escudo
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBkZGRgYAQAkDgICcOr0+QAAAABJRU5ErkJggg==";
r = await api(`/logo/${duplas[0]}`, "PUT", { dataUrl: png });
check(r.status === 200, "envio de escudo");

r = await api("/op", "POST", { op: "createTournament", args: { name: "Dominó por dias", season: "2026", size: 2, fmt: "dias", teamIds: duplas, days: 5, daysPerWeek: 5, finalMode: "auto", turnos: 1, game: "domino" } });
check(r.status === 200, "campeonato por dias (dominó) " + (r.data?.error || ""));
const tDias = r.data.result;
r = await api("/op", "POST", { op: "createTournament", args: { name: "Copa Trios", season: "2026", size: 3, fmt: "mata", teamIds: trios, thirdPlace: true, game: "futebol" } });
check(r.status === 200, "mata-mata futebol com 3º lugar " + (r.data?.error || ""));
const tMata = r.data.result;
r = await api("/op", "POST", { op: "createTournament", args: { name: "Truco com meta", season: "2026", size: 2, fmt: "liga", teamIds: duplas.slice(0, 4), game: "truco", meta: 3 } });
check(r.status === 200, "Brasileirão com meta (truco) " + (r.data?.error || ""));
r = await api("/op", "POST", { op: "createTournament", args: { name: "Copa do Mundo", season: "2026", size: 1, fmt: "grupos_mata", teamIds: pids.slice(0, 8), nGroups: 2, qualifiers: 2, game: "futebol" } });
check(r.status === 200, "Copa individual com grupos " + (r.data?.error || ""));

// fecha o mata-mata para ter campeão (certificado)
let st = (await api("/state")).data.state;
const koIds = () => st.matches.filter((m) => m.tournament_id === tMata && !m.played && m.home_id && m.away_id);
while (koIds().length) {
  for (const m of koIds()) { r = await api("/op", "POST", { op: "saveResult", args: { id: m.id, hs: 2, as: 1 } }); st = r.data.state; }
}
check(st.tournaments.find((t) => t.id === tMata).champion_id, "mata-mata finalizado com campeão");
// alguns placares no dominó
const dm = st.matches.filter((m) => m.tournament_id === tDias && m.home_id && m.away_id && !m.is_bye).slice(0, 3);
for (const m of dm) await api("/op", "POST", { op: "saveResult", args: { id: m.id, hs: 2, as: 0 } });

await A.page.reload();
await A.page.waitForSelector("#nav");
const pages = ["painel", "lancamentos", "jogadores", "equipes", "campeonatos", "partidas", "classificacao", "chaveamento", "indicadores", "usuarios", "dados"];
for (const [i, p] of pages.entries()) {
  await A.page.click(`button[data-page="${p}"]`);
  await A.page.waitForTimeout(500);
  const h1 = await A.page.textContent("#page h1").catch(() => null);
  check(!!h1, `página ${p}: "${h1}"`);
  await A.page.screenshot({ path: `${OUT}/a${String(i).padStart(2, "0")}-${p}.png` });
}

// chaveamento: PDF com certificado
await A.page.click('button[data-page="chaveamento"]');
await A.page.selectOption("#sel-t", String(tMata));
await A.page.waitForTimeout(400);
await A.page.screenshot({ path: `${OUT}/b-chave-mata.png` });
let [dl] = await Promise.all([A.page.waitForEvent("download", { timeout: 20000 }), A.page.click("text=Gerar PDF")]);
await dl.saveAs(`${OUT}/chave-mata.pdf`);
check(fs.statSync(`${OUT}/chave-mata.pdf`).size > 5000, "PDF do mata-mata (com certificado) gerado: " + dl.suggestedFilename());
await A.page.selectOption("#sel-t", String(tDias));
await A.page.waitForTimeout(400);
await A.page.screenshot({ path: `${OUT}/b-chave-dias.png` });
[dl] = await Promise.all([A.page.waitForEvent("download", { timeout: 20000 }), A.page.click("text=Gerar PDF")]);
await dl.saveAs(`${OUT}/chave-dias.pdf`);
check(fs.statSync(`${OUT}/chave-dias.pdf`).size > 5000, "PDF do campeonato por dias gerado");

/* ---------- novo usuário ---------- */
console.log("Usuário");
const U = await newPage();
await U.page.goto(BASE + "/");
await U.page.click('[data-v="criar"]');
await U.page.fill("input[name=name]", "Mateus Teste");
await U.page.fill("input[name=username]", "mateus");
await U.page.fill("input[name=password]", "senha123");
await U.page.fill("input[name=password2]", "senha123");
await U.page.click("button[type=submit]");
await U.page.waitForSelector(".msg.ok");
await U.page.screenshot({ path: `${OUT}/c-cadastro.png` });
await U.page.fill("input[name=username]", "mateus");
await U.page.fill("input[name=password]", "senha123");
await U.page.click("button[type=submit]");
await U.page.waitForSelector(".msg.info");
check((await U.page.textContent(".msg.info")).toLowerCase().includes("aprova"), "usuário pendente não entra: " + (await U.page.textContent(".msg.info")));

// admin aprova
await A.page.click('button[data-page="usuarios"]');
await A.page.waitForSelector('[data-a="approve"][data-u="mateus"]');
await A.page.screenshot({ path: `${OUT}/d-usuarios-pendente.png` });
await A.page.click('[data-a="approve"][data-u="mateus"]');
await A.page.waitForTimeout(600);
check((await A.page.$('[data-a="approve"][data-u="mateus"]')) === null, "admin aprovou o usuário");

await login(U.page, "mateus", "senha123");
const navU = await U.page.$$eval("#nav button", (b) => b.map((x) => x.dataset.page));
check(!navU.includes("usuarios") && !navU.includes("partidas") && !navU.includes("dados"), "usuário não vê abas de admin: " + navU.join(","));
check((await U.page.textContent("#page h1")).includes("Lançamentos"), "usuário começa em Lançamentos/Placares");
await U.page.selectOption("#sel-t", String(tDias));
await U.page.waitForTimeout(300);
const before = await U.page.$$eval(".lanc", (c) => c.length);
await U.page.fill("#q", "dia 2");
await U.page.waitForTimeout(300);
const filtered = await U.page.$$eval(".lanc", (c) => c.length);
check(filtered > 0 && filtered < before, `busca "dia 2" filtra (${before} → ${filtered})`);
await U.page.screenshot({ path: `${OUT}/e-lancamentos-user.png` });
const card = U.page.locator(".lanc").first();
await card.locator('[data-quick="2-1"]').click();
await card.locator("[data-save]").click();
await U.page.click("[data-ok]");
await U.page.waitForTimeout(700);
const after = await U.page.$$eval(".lanc", (c) => c.length);
check(after === filtered - 1, "placar lançado pelo usuário sai da lista");
const apiU = apiIn(U.page);
st = (await apiU("/state")).data.state;
const played = st.matches.find((m) => m.played && m.played_by === "mateus");
check(!!played, "placar registrado com 'lançado por mateus'");
r = await apiU("/op", "POST", { op: "saveResult", args: { id: played.id, hs: 0, as: 2 } });
check(r.status === 400 && /administrador/.test(r.data.error), "usuário NÃO altera placar já lançado: " + r.data.error);
r = await apiU("/op", "POST", { op: "addPlayer", args: { name: "Hacker" } });
check(r.status === 403, "usuário NÃO cadastra jogador (" + r.status + ")");
r = await apiU("/op", "POST", { op: "clearResult", args: { id: played.id } });
check(r.status === 403, "usuário NÃO apaga placar (" + r.status + ")");
r = await apiU("/users");
check(r.status === 403, "usuário NÃO vê lista de usuários");
// admin altera
r = await api("/op", "POST", { op: "saveResult", args: { id: played.id, hs: 0, as: 2 } });
check(r.status === 200, "admin altera placar já lançado");

// celular
console.log("Celular");
const M = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await login(M.page, "mateus", "senha123");
await M.page.waitForTimeout(400);
await M.page.screenshot({ path: `${OUT}/f-celular-lancamentos.png` });
const overflow = await M.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check(!overflow, "sem rolagem horizontal no celular");
await M.page.click("#menu-btn");
await M.page.waitForTimeout(300);
await M.page.screenshot({ path: `${OUT}/f-celular-menu.png` });

// bloqueio derruba a sessão
await api("/users/action", "POST", { username: "mateus", action: "block" });
r = await apiU("/state");
check(r.status === 401, "usuário bloqueado perde o acesso na hora");

console.log("\nErros no navegador:", errors.length ? errors : "nenhum");
await browser.close();
console.log(fails ? `\n${fails} FALHA(S)` : "\nTUDO OK");
process.exit(fails || errors.length ? 1 : 0);
