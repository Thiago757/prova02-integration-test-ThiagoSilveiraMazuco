# Cenários — Prova 02 — Thiago Silveira Mazuco

API: **Carga Fácil**, REST com Node.js, Express e SQLite.
Frameworks: **Jest + PactumJS**. Suíte: `test/carga_facil.spec.ts`.

## Critérios do trabalho

| Critério | Implementação / evidência |
| --- | --- |
| Testes rodando corretamente | `npm run ci`: formatação, ESLint, TypeScript, 30 cenários e cobertura; relatório `output/report.html`. |
| GitHub Actions e SonarCloud | Workflow `Node.js CI`: jobs `Run Integration Tests` → `Run SonarCloud`, com transferência de execução/LCOV por artefato e espera pelo Quality Gate. Confira a execução do commit mais recente em Actions e os badges do README. |
| Descrição dos testes | C01–C30 na tabela abaixo e nos nomes dos testes/relatório HTML. |
| Uso correto de PactumJS | `spec`, métodos HTTP, `withJson`, `withHeaders`, `withCookies`, parâmetros, asserts de status/JSON/schema e `returns` para reutilizar IDs e sessão. |
| Pelo menos cinco cenários / métodos variados | 30 cenários, cobrindo GET, POST, PUT, PATCH e DELETE; sucesso e erro. |

## Preparação e isolamento

O runner inicia a API real numa porta livre de `127.0.0.1`, com banco SQLite
temporário e duas contas fictícias. URL e credenciais aleatórias são passadas
por variáveis de ambiente, sem `.env` ou segredos de produção.

O `beforeAll` autentica os dois usuários. Cada cenário cria seus próprios
registros. O `afterEach` remove cargas, caminhoneiros e transportadoras nesta
ordem, respeitando vínculos; `afterAll` encerra as sessões. A API encerra e
remove o banco no fim. Os testes podem ser executados individualmente pelo ID,
sem depender de um teste anterior: `npm test -- -t C24`.

Nomes, contatos, telefone, placa e documentos de formato válido são fixtures
fictícias, usadas exclusivamente nesse banco temporário. Nenhuma consulta de
CPF/CNPJ, roteamento externo ou reconhecimento OCR é feita.

## Descrição de cada cenário

Pré-condição padrão dos cadastros: usuário autenticado, cookie de sessão,
`Origin` autorizado e `X-CSRF-Token` recebido no login.

| ID | Método / recurso | Entrada e ação | Resultado esperado |
| --- | --- | --- | --- |
| C01 | GET `/healthz` | Consultar saúde sem autenticação. | 200, JSON `status: ok`, cache desativado; consulta SQLite realizada pela API. |
| C02 | POST `/api/login`; GET `/api/session` | Credenciais temporárias válidas; consultar sessão com cookie recebido. | 200, UUID do usuário, CSRF, cookie HttpOnly/SameSite=Strict e sessão com e-mail correto. |
| C03 | POST `/api/login` | Senha incorreta. | 401 e mensagem de credenciais inválidas. |
| C04 | GET `/api/session` | Sem cookie. | 401 e mensagem de sessão encerrada. |
| C05 | POST `/api/login` | Origem `example.invalid`. | 403 e mensagem de origem não autorizada. |
| C06 | POST `/api/drivers`; GET lista | Cookie válido, mas sem CSRF; consultar nome tentado. | 403; lista vazia comprova que o cadastro não foi persistido. |
| C07 | POST `/api/logout`; GET sessão | Encerrar uma sessão própria e reutilizar seu cookie. | 204 sem corpo; depois 401. |
| C08 | POST/GET `/api/drivers` | Caminhoneiro válido; consultar pelo UUID retornado. | 201 com UUID; GET 200 com os mesmos dados persistidos. |
| C09 | GET `/api/drivers` | Criar dois registros; filtrar nome e situação waiting/inactive. | 200, apenas o registro esperado; filtro incompatível retorna lista vazia. |
| C10 | PUT/GET `/api/drivers/:id` | Alterar cidade, UF e observação. | 200, mesmo ID; novo GET comprova os dados atualizados. |
| C11 | DELETE/GET `/api/drivers/:id` | Exclusão confirmada. | 204 sem corpo; novo GET 404. |
| C12 | POST/GET `/api/drivers` | Telefone inválido `123`; pesquisar nome tentado. | 400 com erro de telefone; lista vazia. |
| C13 | POST/GET `/api/drivers` | Cadastrar CPF fictício e tentar duplicá-lo com outro nome. | 409 com erro de CPF; original preservado e sem duplicação. |
| C14 | DELETE/GET `/api/drivers/:id` | `confirmed: false`. | 400 com erro de confirmação; registro continua acessível. |
| C15 | GET/PUT `/api/drivers/:id` | Segundo usuário tenta consultar/alterar registro do primeiro. | 404 em ambos; lista do segundo vazia; dados do dono permanecem intactos. |
| C16 | POST/GET `/api/carriers` | Transportadora com checklist; consultar ID e pesquisar nome. | 201 com UUID; 200 com dados/checklist e um resultado no filtro. |
| C17 | PUT/GET `/api/carriers/:id` | Alterar contato e substituir checklist por CPF. | 200; nova consulta confirma checklist com somente um item. |
| C18 | DELETE/GET `/api/carriers/:id` | Excluir transportadora sem cargas. | 204 sem corpo; depois 404. |
| C19 | POST/GET `/api/carriers` | CNPJ com todos os dígitos zero. | 400 com erro de CNPJ; nome não aparece na lista. |
| C20 | DELETE transportadora; GET carga | Tentar excluir transportadora com carga vinculada. | 409; carga preservada e ligada à mesma transportadora. |
| C21 | POST/GET `/api/cargos` | Carga válida com transportadora, percurso e frete em centavos. | 201 com UUID; GET 200 com dados/vínculo persistidos. |
| C22 | GET `/api/cargos` | Filtrar por destino Curitiba e situação available/cancelled. | 200, uma carga esperada; situação incompatível retorna lista vazia. |
| C23 | PUT/GET `/api/cargos/:id` | Alterar frete e destino para Joinville/SC. | 200, mesmo ID; nova consulta confirma alterações. |
| C24 | PATCH `/api/cargos/:id/negotiation`; GET `/api/cargos/:id` | Enviar active true e depois false; consultar persistência. | 200, negotiating e depois available; demais dados preservados. |
| C25 | DELETE carga; GET carga/transportadora | Excluir carga com confirmação. | 204; carga 404; transportadora continua retornando 200. |
| C26 | POST/GET `/api/cargos` | Tentar cadastrar frete zero. | 400 com erro de frete; lista ainda contém somente a fixture válida. |
| C27 | POST/GET `/api/cargos` | Transportadora com UUID inexistente. | 404; nenhuma carga adicional persistida. |
| C28 | PATCH/GET negociação | `active: "sim"`, tipo inválido. | 400; novo GET confirma situação available. |
| C29 | GET/DELETE `/api/cargos/:id` | Segundo usuário tenta consultar/excluir carga do primeiro. | 404; lista do segundo vazia; carga do dono preservada. |
| C30 | GET `/api/cargos/:id` | ID malformado e depois UUID válido inexistente. | 400 com erro de ID; 404 com mensagem de registro não encontrado. |

## PactumJS conforme a documentação

Todas as chamadas HTTP usam [`spec`](https://pactumjs.github.io/api/requests/spec.html)
com `await`. Corpos usam [`withJson`](https://pactumjs.github.io/api/requests/withJson.html),
cookies usam [`withCookies`](https://pactumjs.github.io/api/requests/withCookies.html)
e CSRF/Origin usam [`withHeaders`](https://pactumjs.github.io/api/requests/withHeaders.html).
Status, dados persistidos, contagem e estrutura são conferidos com
[`expectStatus`](https://pactumjs.github.io/api/assertions/expectStatus.html),
[`expectJsonLike`](https://pactumjs.github.io/api/assertions/expectJsonLike.html),
`expectJson`, `expectJsonLength` e `expectJsonSchema`.
[`returns`](https://pactumjs.github.io/api/requests/returns.html) captura IDs e
sessão para encadear os fluxos de integração. Os helpers apenas preparam sessão
e fixtures; não substituem PactumJS por fetch, mocks ou um cliente próprio.

## Cobertura e limite da verificação remota

O backend roda em outro processo. `NODE_V8_COVERAGE` registra esse processo e
o [c8](https://github.com/bcoe/c8) converte os dados reais para LCOV após o
encerramento. O escopo é o mesmo código TypeScript da API analisado pelo Sonar,
incluindo arquivos não exercitados (`all: true`). OCR, rotas externas e demais
funções não testadas continuam contando como descobertas; não há promessa de 100%.

`npm run ci` reproduz localmente a etapa de validação do workflow.
O push desta implementação foi autorizado em 05/10/2026. A execução remota
anterior era da infraestrutura com TODO. Para confirmar estes 30 cenários e
a importação de LCOV no Sonar, confira a execução do commit mais recente.
Nenhuma regra do Quality Gate foi relaxada.

### Validação local em 05/10/2026

- `npm run ci`: formatação, ESLint e TypeScript aprovados; **30 testes aprovados**,
  zero falhas, zero ignorados.
- Repetição em ordem aleatória (`--randomize --seed=20261005 --showSeed`):
  **30 testes aprovados** novamente.
- Cobertura c8: **42,76% de linhas** (2.029/4.745), **81,21% de ramificações**;
  20 arquivos da API no LCOV. Essa porcentagem não deve ser confundida com
  um resultado de cobertura já importado pelo Sonar remoto.
- XML do Sonar: 30 casos, zero falhas/erros/ignorados.
