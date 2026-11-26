# CDSP Champions Web: passo a passo para hospedar no Netlify

O sistema web tem duas partes, e as duas sobem juntas no Netlify:

- **Site** (pasta `public/`): telas, chaveamento, gráficos e geração de PDF. O PDF é gerado no próprio navegador.
- **API** (`netlify/functions/api.mjs`): login, permissões e gravação dos dados.
  - Os dados ficam no **Netlify Blobs**, que é o armazenamento do próprio Netlify.
  - Não precisa contratar banco de dados.

> ⚠️ **Não use o "arrastar e soltar" (Netlify Drop).** Esse modo publica só o site, sem a API, e aí o login não funciona. Use o **GitHub** (Opção A) ou o **Netlify CLI** (Opção B).

---

## O que você precisa

1. Uma conta gratuita no **Netlify**: https://app.netlify.com/signup. Dá para entrar com a conta do GitHub.
2. Uma conta gratuita no **GitHub**: https://github.com/signup. Só é necessária na Opção A.
3. Esta pasta descompactada (`CDSP_Champions_Web`).

---

## Opção A: pelo GitHub (recomendada)

Com esta opção, toda alteração que você enviar ao GitHub é publicada sozinha.

### 1. Criar o repositório no GitHub

1. Entre no GitHub e clique em **New repository** (botão verde, ou o **+** no canto superior direito).
2. Nome: `cdsp-champions`. Marque **Private** e clique em **Create repository**.
3. Na página do repositório vazio, clique no link **uploading an existing file**.
4. Abra a pasta `CDSP_Champions_Web` no computador. Selecione **todo o conteúdo de dentro dela** e arraste para a página.
   - O conteúdo inclui `public`, `netlify`, `server`, `test`, `netlify.toml`, `package.json`, `package-lock.json` e este guia.
   - Arraste o conteúdo, não a pasta em si: o `netlify.toml` precisa ficar na raiz do repositório.
   - Se o Windows não mostrar o `.gitignore`, tudo bem: ele não é obrigatório.
5. Clique em **Commit changes**.

### 2. Criar o site no Netlify

1. No Netlify, clique em **Add new project** (ou **Add new site**) e depois em **Import an existing project**.
2. Escolha **GitHub** e autorize o Netlify a ver seus repositórios.
3. Selecione o repositório `cdsp-champions`.
4. Na tela de configuração, **não altere nada**: o arquivo `netlify.toml` já informa tudo.
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
5. Escolha um nome para o site, por exemplo `cdsp-champions`. O endereço será `https://cdsp-champions.netlify.app`.
6. Clique em **Deploy**.

### 3. Definir a senha do administrador (obrigatório)

1. No site criado, abra **Project configuration** (ou **Site configuration**) → **Environment variables** → **Add a variable** → **Add a single variable**.
2. Crie a variável:
   - **Key:** `ADMIN_PASSWORD`
   - **Value:** a senha do administrador, com no mínimo 6 caracteres. Use uma senha forte.
3. *(Opcional)* Crie também `ADMIN_USER` com o nome de usuário do administrador. Se você não criar, o usuário é **`admin`**.
4. Depois de salvar, publique de novo para a senha valer: **Deploys** → **Trigger deploy** → **Deploy site**.

### 4. Primeiro acesso

1. Abra o endereço do site.
2. Entre com o usuário `admin` (ou o que você definiu em `ADMIN_USER`) e a senha de `ADMIN_PASSWORD`.
3. Pronto: o administrador vê todas as abas.

---

## Opção B: pelo Netlify CLI (sem GitHub)

Precisa do **Node.js 20 ou mais novo** instalado (https://nodejs.org). No terminal, dentro da pasta do projeto:

```bash
npm install
npx netlify-cli login                 # abre o navegador para autorizar
npx netlify-cli init                  # "Create & configure a new project"
npx netlify-cli env:set ADMIN_PASSWORD "SuaSenhaForte123"
npx netlify-cli deploy --prod         # publica site + API
```

Para atualizar depois, rode de novo `npx netlify-cli deploy --prod`.

---

## Como usar no dia a dia

### Aprovar quem cria acesso

1. A pessoa abre o site, clica em **Criar acesso** e preenche nome, usuário e senha.
2. Ela fica **aguardando aprovação** e ainda não consegue entrar.
3. O administrador abre a aba **Usuários**. O número no menu mostra quantas aprovações estão pendentes.
4. O administrador clica em **✔ Aprovar** (ou **Recusar**).

### O que cada perfil pode fazer

| | Administrador | Usuário aprovado |
|---|:-:|:-:|
| Ver painel, classificação, chaveamento, indicadores e gerar PDF | ✔ | ✔ |
| Lançar placar de jogo **sem resultado** (aba **Lançamentos/Placares**) | ✔ | ✔ |
| Alterar ou apagar placar **já lançado** | ✔ | — |
| Cadastrar jogadores, equipes, escudos e campeonatos | ✔ | — |
| Aprovar usuários, backup e importação | ✔ | — |

- O administrador também pode **bloquear**, **redefinir senha** e **tornar administrador** outro usuário.
- Quem for bloqueado sai do sistema na hora.
- Cada placar guarda **quem lançou** e **quando**. Isso aparece na aba **Partidas**.

### Aba Lançamentos/Placares

1. Escolha o campeonato.
2. Digite na busca o que quiser. Exemplos: nome da equipe, nome do jogador, `dia 3`, `rodada 2`, `grupo A`, `semana 1`, `semifinal`.
3. Digite o placar ou use os botões rápidos (2×0, 2×1…) no dominó e no truco.
4. Toque em **Lançar placar** e confirme.

Só aparecem jogos sem resultado. Quando o placar é lançado, o jogo sai da lista e as tabelas e o chaveamento se atualizam para todos em até 15 segundos.

### Trazer os campeonatos do sistema desktop (.exe)

1. Entre como administrador e abra a aba **Backup e importação**.
2. Clique em **Escolher campeonatos.db**. O arquivo fica na mesma pasta do `CDSPChampions.exe`.
3. Confirme.

Jogadores, equipes, escudos, campeonatos e placares são importados. Atenção: a importação **substitui** os dados atuais do site.

### Backup

Na mesma aba, **Baixar backup** gera um arquivo `.json` com tudo, inclusive os escudos. Faça de vez em quando e guarde no computador. Para voltar um backup, use **Restaurar backup**.

---

## Trocar a senha do administrador

1. Altere a variável `ADMIN_PASSWORD` no Netlify.
2. Clique em **Trigger deploy** para publicar de novo.

A senha antiga deixa de funcionar e quem estava logado com ela é desconectado. Os demais usuários trocam a própria senha pelo botão **Trocar senha**, no canto inferior do menu.

---

## Testar no próprio computador (opcional)

```bash
npm install
# Windows (PowerShell):
$env:ADMIN_PASSWORD="admin123"; npm run local
# Linux/Mac:
ADMIN_PASSWORD=admin123 npm run local
```

Depois abra http://localhost:8888. No modo local, os dados ficam na pasta `.dados-local`.

---

## Dúvidas comuns

- **"O administrador ainda não foi configurado"** na tela de login: falta a variável `ADMIN_PASSWORD`, ou ela tem menos de 6 caracteres, ou o site não foi publicado de novo depois de criá-la (**Trigger deploy**).
- **Erro ao entrar / página sem dados:** confira se o site foi publicado pelo GitHub ou pelo CLI, e não pelo "arrastar e soltar".
- **Endereço do site:** pode ser alterado em **Project configuration → General → Change project name**. Também é possível usar domínio próprio em **Domain management**.
- **Consumo do plano gratuito:** cada tela aberta consulta o servidor a cada 15 segundos. Quando nada mudou, a resposta é mínima. Para o uso de um grupo de campeonato, isso fica bem dentro do plano gratuito. O uso pode ser acompanhado em **Usage** no Netlify.
