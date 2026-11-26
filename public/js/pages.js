// Abas do sistema. admin: true = só aparece para administradores.
import * as painel from "./pages/painel.js";
import * as jogadores from "./pages/jogadores.js";
import * as equipes from "./pages/equipes.js";
import * as campeonatos from "./pages/campeonatos.js";
import * as partidas from "./pages/partidas.js";
import * as lancamentos from "./pages/lancamentos.js";
import * as classificacao from "./pages/classificacao.js";
import * as chaveamento from "./pages/chaveamento.js";
import * as indicadores from "./pages/indicadores.js";
import * as usuarios from "./pages/usuarios.js";
import * as dados from "./pages/dados.js";

export const PAGES = [
  { id: "painel", title: "Painel", icon: "🏠", create: painel.create },
  { id: "lancamentos", title: "Lançamentos/Placares", icon: "📝", create: lancamentos.create },
  { id: "jogadores", title: "Jogadores", icon: "👤", create: jogadores.create },
  { id: "equipes", title: "Equipes", icon: "👥", create: equipes.create },
  { id: "campeonatos", title: "Campeonatos", icon: "🏆", create: campeonatos.create },
  { id: "partidas", title: "Partidas", icon: "⚽", admin: true, create: partidas.create },
  { id: "classificacao", title: "Classificação", icon: "📊", create: classificacao.create },
  { id: "chaveamento", title: "Chaveamento", icon: "🗂", create: chaveamento.create },
  { id: "indicadores", title: "Indicadores", icon: "📈", create: indicadores.create },
  { id: "usuarios", title: "Usuários", icon: "🔐", admin: true, create: usuarios.create },
  { id: "dados", title: "Backup e importação", icon: "💾", admin: true, create: dados.create },
];
