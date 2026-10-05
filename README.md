# Prova 02 — Testes de integração — Thiago Silveira Mazuco

Backend real Node/Express do Carga Fácil, com banco SQLite temporário.
Disponibiliza GET, POST, PUT, PATCH e DELETE, além de autenticação por sessão.
Contém 30 cenários de integração com Jest e PactumJS: CRUD, negociação,
autenticação, validação e isolamento entre usuários.

[![Node.js CI](https://github.com/Thiago757/prova02-integration-test-ThiagoSilveiraMazuco/actions/workflows/node.js.yml/badge.svg?branch=master)](https://github.com/Thiago757/prova02-integration-test-ThiagoSilveiraMazuco/actions/workflows/node.js.yml)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=Thiago757_prova02-integration-test-ThiagoSilveiraMazuco&metric=alert_status)](https://sonarcloud.io/dashboard?id=Thiago757_prova02-integration-test-ThiagoSilveiraMazuco)

## Executar a API

Use Node.js **24.15+ na linha 24**:

```sh
npm ci
npm run api
```

Endereço: `http://127.0.0.1:4318`. O terminal mostra credenciais temporárias.
Cada execução começa com banco vazio, sem acessar os dados do projeto original.

## Ambiente dos testes e Sonar

```sh
npm run ci          # formatação, ESLint, TypeScript, testes e cobertura da API
npm test            # inicia API, executa 30 cenários e gera relatórios
npm run sonar       # análise local; requer SONAR_TOKEN no ambiente
```

Os cenários estão em `test/carga_facil.spec.ts`, com descrições C01–C30.
O runner fornece URL e credenciais temporárias via variáveis de ambiente;
cada teste cria seus registros e os remove após as verificações.
Não há mocks HTTP, testes ignorados ou dependência de APIs públicas na suíte da prova.

Veja [a descrição de todos os cenários e os critérios do trabalho](docs/CENARIOS.md).

O Sonar analisa o **código da API**, não um cliente com cobertura artificial.
O workflow envia a análise ao projeto `Thiago757_prova02-integration-test-ThiagoSilveiraMazuco` e aguarda
o Quality Gate. O c8 mede o processo real do backend e gera LCOV após seu
encerramento. Arquivos não exercitados também entram na cobertura, sem ocultar
OCR, rotas externas ou funcionalidades que estes cenários não cobrem.
O gate pode reprovar problemas reais da API ou cobertura insuficiente em código novo.

A pipeline `Node.js CI` tem dois jobs, seguindo a estrutura da
[referência de Guilherme Goulart](https://github.com/guilhermegm-2k26/prova02-integration-test-GuilhermeGoulart/blob/master/.github/workflows/node.js.yml):
`Run Integration Tests` → `Run SonarCloud`. Os relatórios do primeiro job são
transferidos por artefato para o segundo, que só começa se os testes passarem.
Mantém Node 24 para o SQLite e `npm ci` para reproduzir o lockfile.
Roda em push, pull request e execução manual; não foi adicionado agendamento diário.

Os resultados remotos devem ser conferidos na execução de `Node.js CI` do
commit mais recente. Execuções antigas da infraestrutura com TODO não comprovam
os 30 cenários atuais. Os badges acima apontam para este repositório e projeto Sonar.

Veja [as instruções de uso](docs/PROVA.md) e [a origem da API](api/carga-facil/ORIGEM.md).

Os oito exemplos originais do repositório, para outras APIs públicas, foram
preservados como referência e podem ser executados com `npm run test:external`.
Não fazem parte dos 30 cenários do Carga Fácil e precisam de internet.

Infraestrutura baseada no repositório original de
[Leandro Ugioni](https://github.com/ugioni/integration-tests-jest), com a API
Carga Fácil de Thiago Silveira Mazuco. A prova 01 não foi alterada.
