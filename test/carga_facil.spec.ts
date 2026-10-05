import { randomUUID } from 'node:crypto';
import { spec } from 'pactum';

type Session = { cookie: string; csrf: string };
type Resource = { path: string; id: string };
let baseUrl: string;
let email: string;
let password: string;
let primary: Session;
let secondary: Session;
let resources: Resource[] = [];
const entitySchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: {
      type: 'string',
      pattern:
        '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    }
  }
};
const notFound = { error: 'Registro não encontrado.' };

function environment(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `Execute npm test: a variável ${name} não foi fornecida pelo runner.`
    );
  return value;
}

function url(path: string) {
  return `${baseUrl}${path}`;
}

// Configura a sessão; requisições e validações HTTP continuam sendo PactumJS.
function api(session = primary) {
  return spec()
    .withRequestTimeout(5000)
    .withCookies(session.cookie)
    .withHeaders({ Origin: baseUrl, 'X-CSRF-Token': session.csrf });
}

async function login(userEmail = email): Promise<Session> {
  return spec()
    .post(url('/api/login'))
    .withHeaders('Origin', baseUrl)
    .withJson({ email: userEmail, password })
    .expectStatus(200)
    .expectJsonLike({ user: { email: userEmail } })
    .expectJsonSchema({
      type: 'object',
      required: ['user', 'csrf'],
      properties: {
        user: { ...entitySchema, required: ['id', 'name', 'email'] },
        csrf: { type: 'string', minLength: 32 }
      }
    })
    .returns(ctx => {
      const cookies = ctx.res.headers['set-cookie'];
      const cookie = Array.isArray(cookies) ? cookies[0] : cookies;
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('cf_session=');
      return {
        cookie: cookie.split(';')[0],
        csrf: (ctx.res.json as { csrf: string }).csrf
      };
    });
}

async function create(path: string, data: object): Promise<string> {
  const id: string = await api()
    .post(url(path))
    .withJson(data)
    .expectStatus(201)
    .expectJsonLike(data)
    .expectJsonSchema(entitySchema)
    .returns('id');
  resources.push({ path, id });
  return id;
}

function driverData(overrides: Record<string, unknown> = {}) {
  return {
    name: `Caminhoneiro fictício ${randomUUID()}`,
    phone: '48999990000',
    city: 'Criciúma',
    state: 'SC',
    vehicleType: 'Truck',
    truckPlate: 'TST1A23',
    status: 'available',
    ...overrides
  };
}

function carrierData(overrides: Record<string, unknown> = {}) {
  return {
    name: `Transportadora fictícia ${randomUUID()}`,
    cnpj: '11444777000161',
    contact: 'Contato fictício',
    phone: '48999990000',
    requiredDocuments: ['cnh', 'truck'],
    ...overrides
  };
}

async function cargoFixture() {
  const carrierId = await create('/api/carriers', carrierData());
  const data = {
    carrierId,
    originCity: 'Criciúma',
    originState: 'SC',
    destinationCity: 'Curitiba',
    destinationState: 'PR',
    cargoType: 'Carga fictícia para testes',
    vehicleType: 'Truck',
    freightCents: 240000,
    distanceKm: 400,
    scheduledDate: '2030-10-05',
    status: 'available'
  };
  return { data, id: await create('/api/cargos', data) };
}

async function remove(path: string, id: string) {
  await api()
    .delete(url(`${path}/{id}`))
    .withPathParams('id', id)
    .withJson({ confirmed: true })
    .expectStatus(204)
    .expectBody('');
  resources = resources.filter(
    resource => resource.path !== path || resource.id !== id
  );
}

beforeAll(async () => {
  baseUrl = environment('CARGA_FACIL_BASE_URL');
  const address = new URL(baseUrl);
  if (address.protocol !== 'http:' || address.hostname !== '127.0.0.1')
    throw new Error(
      'Os testes só podem usar a API local criada pelo runner, nunca produção.'
    );
  email = environment('CARGA_FACIL_EMAIL');
  password = environment('CARGA_FACIL_PASSWORD');
  primary = await login();
  secondary = await login(environment('CARGA_FACIL_OTHER_EMAIL'));
});

afterEach(async () => {
  // Cada teste cria registros próprios. Exclui filhos antes dos pais.
  for (const path of ['/api/cargos', '/api/drivers', '/api/carriers']) {
    for (const resource of resources.filter(item => item.path === path))
      await remove(resource.path, resource.id);
  }
});

afterAll(async () => {
  for (const session of [primary, secondary].filter(Boolean))
    await api(session).post(url('/api/logout')).expectStatus(204);
});

describe('C01–C07 | Saúde, autenticação e segurança', () => {
  test('C01 GET /healthz: API e SQLite estão disponíveis', async () => {
    await spec()
      .get(url('/healthz'))
      .expectStatus(200)
      .expectHeader('cache-control', 'no-store')
      .expectJson({ status: 'ok' });
  });
  test('C02 POST login e GET sessão: cookie protegido, CSRF e usuário', async () => {
    const session = await login();
    await api(session)
      .get(url('/api/session'))
      .expectStatus(200)
      .expectJsonLike({ user: { email }, csrf: session.csrf, demo: false });
    await api(session).post(url('/api/logout')).expectStatus(204);
  });
  test('C03 POST login: senha incorreta retorna 401', async () => {
    await spec()
      .post(url('/api/login'))
      .withHeaders('Origin', baseUrl)
      .withJson({ email, password: 'Senha-incorreta-apenas-teste' })
      .expectStatus(401)
      .expectJson({
        error: 'E-mail ou senha incorretos. Confira e tente novamente.'
      });
  });
  test('C04 GET sessão: acesso sem cookie retorna 401', async () => {
    await spec()
      .get(url('/api/session'))
      .expectStatus(401)
      .expectJson({ error: 'Sua sessão terminou. Entre novamente.' });
  });
  test('C05 POST login: origem não autorizada retorna 403', async () => {
    await spec()
      .post(url('/api/login'))
      .withHeaders('Origin', 'https://example.invalid')
      .withJson({ email, password })
      .expectStatus(403)
      .expectJson({
        error:
          'Esta origem não está autorizada. Abra o endereço configurado do Carga Fácil.'
      });
  });
  test('C06 POST caminhoneiro: sem CSRF retorna 403 e não cadastra', async () => {
    const data = driverData();
    await spec()
      .post(url('/api/drivers'))
      .withCookies(primary.cookie)
      .withHeaders('Origin', baseUrl)
      .withJson(data)
      .expectStatus(403)
      .expectJson({
        error:
          'Não foi possível confirmar a ação. Atualize a página e tente novamente.'
      });
    await api()
      .get(url('/api/drivers'))
      .withQueryParams('q', data.name)
      .expectStatus(200)
      .expectJson([]);
  });
  test('C07 POST logout: invalida o cookie e impede reutilizar a sessão', async () => {
    const session = await login();
    await api(session)
      .post(url('/api/logout'))
      .expectStatus(204)
      .expectBody('');
    await api(session).get(url('/api/session')).expectStatus(401);
  });
});

describe('C08–C15 | Caminhoneiros: CRUD, validação e isolamento', () => {
  test('C08 POST e GET por ID: cadastro válido persiste e retorna UUID', async () => {
    const data = driverData();
    const id = await create('/api/drivers', data);
    await api()
      .get(url('/api/drivers/{id}'))
      .withPathParams('id', id)
      .expectStatus(200)
      .expectJsonLike({ id, ...data });
  });
  test('C09 GET lista: filtros de nome e situação retornam o esperado', async () => {
    const data = driverData({
      status: 'waiting',
      desiredDestination: 'Curitiba'
    });
    const id = await create('/api/drivers', data);
    await create('/api/drivers', driverData());
    await api()
      .get(url('/api/drivers'))
      .withQueryParams({ q: data.name, status: 'waiting' })
      .expectStatus(200)
      .expectJsonLength(1)
      .expectJsonLike([{ id, name: data.name, status: 'waiting' }]);
    await api()
      .get(url('/api/drivers'))
      .withQueryParams({ q: data.name, status: 'inactive' })
      .expectStatus(200)
      .expectJson([]);
  });
  test('C10 PUT caminhoneiro: atualiza dados e mantém o mesmo ID', async () => {
    const data = driverData();
    const id = await create('/api/drivers', data);
    const updated = {
      ...data,
      city: 'Curitiba',
      state: 'PR',
      notes: 'Atualizado na prova'
    };
    await api()
      .put(url('/api/drivers/{id}'))
      .withPathParams('id', id)
      .withJson(updated)
      .expectStatus(200)
      .expectJsonLike({ id, ...updated });
    await api()
      .get(url(`/api/drivers/${id}`))
      .expectStatus(200)
      .expectJsonLike(updated);
  });
  test('C11 DELETE caminhoneiro: exclui e nova consulta retorna 404', async () => {
    const id = await create('/api/drivers', driverData());
    await remove('/api/drivers', id);
    await api()
      .get(url(`/api/drivers/${id}`))
      .expectStatus(404)
      .expectJson(notFound);
  });
  test('C12 POST caminhoneiro: telefone inválido retorna 400 sem persistir', async () => {
    const data = driverData({ phone: '123' });
    await api()
      .post(url('/api/drivers'))
      .withJson(data)
      .expectStatus(400)
      .expectJsonLike({
        fields: {
          phone:
            'Confira o telefone com DDD. Celular tem 9 dígitos e começa com 9; fixo tem 8.'
        }
      });
    await api()
      .get(url('/api/drivers'))
      .withQueryParams('q', data.name)
      .expectStatus(200)
      .expectJson([]);
  });
  test('C13 POST caminhoneiro: CPF duplicado retorna 409 e preserva original', async () => {
    const data = driverData({ cpf: '52998224725' });
    const id = await create('/api/drivers', data);
    await api()
      .post(url('/api/drivers'))
      .withJson({ ...data, name: 'Tentativa duplicada fictícia' })
      .expectStatus(409)
      .expectJsonLike({
        fields: { cpf: 'Este CPF já está cadastrado. Abra a ficha existente.' }
      });
    await api()
      .get(url(`/api/drivers/${id}`))
      .expectStatus(200)
      .expectJsonLike({ name: data.name });
    await api()
      .get(url('/api/drivers'))
      .withQueryParams('q', data.name)
      .expectStatus(200)
      .expectJsonLength(1);
  });
  test('C14 DELETE caminhoneiro: sem confirmação retorna 400 e mantém registro', async () => {
    const id = await create('/api/drivers', driverData());
    await api()
      .delete(url(`/api/drivers/${id}`))
      .withJson({ confirmed: false })
      .expectStatus(400)
      .expectJsonLike({
        fields: { confirmed: 'Confirme a exclusão antes de continuar.' }
      });
    await api()
      .get(url(`/api/drivers/${id}`))
      .expectStatus(200)
      .expectJsonLike({ id });
  });
  test('C15 GET e PUT: outro usuário não acessa nem altera caminhoneiro alheio', async () => {
    const data = driverData();
    const id = await create('/api/drivers', data);
    await api(secondary)
      .get(url(`/api/drivers/${id}`))
      .expectStatus(404)
      .expectJson(notFound);
    await api(secondary)
      .put(url(`/api/drivers/${id}`))
      .withJson({ ...data, name: 'Alteração indevida' })
      .expectStatus(404)
      .expectJson(notFound);
    await api(secondary)
      .get(url('/api/drivers'))
      .expectStatus(200)
      .expectJson([]);
    await api()
      .get(url(`/api/drivers/${id}`))
      .expectStatus(200)
      .expectJsonLike(data);
  });
});

describe('C16–C20 | Transportadoras: CRUD e validação', () => {
  test('C16 POST e GET transportadora: persiste dados e checklist', async () => {
    const data = carrierData();
    const id = await create('/api/carriers', data);
    await api()
      .get(url(`/api/carriers/${id}`))
      .expectStatus(200)
      .expectJsonLike({ id, ...data });
    await api()
      .get(url('/api/carriers'))
      .withQueryParams('q', data.name)
      .expectStatus(200)
      .expectJsonLength(1)
      .expectJsonLike([{ id, name: data.name }]);
  });
  test('C17 PUT transportadora: atualiza contato e substitui checklist', async () => {
    const data = carrierData();
    const id = await create('/api/carriers', data);
    const updated = {
      ...data,
      contact: 'Novo contato fictício',
      requiredDocuments: ['cpf']
    };
    await api()
      .put(url(`/api/carriers/${id}`))
      .withJson(updated)
      .expectStatus(200)
      .expectJsonLike({ id, ...updated });
    await api()
      .get(url(`/api/carriers/${id}`))
      .expectStatus(200)
      .expectJsonLike(updated)
      .expectJsonLength('requiredDocuments', 1);
  });
  test('C18 DELETE transportadora sem cargas: exclui e retorna 404 depois', async () => {
    const id = await create('/api/carriers', carrierData());
    await remove('/api/carriers', id);
    await api()
      .get(url(`/api/carriers/${id}`))
      .expectStatus(404)
      .expectJson(notFound);
  });
  test('C19 POST transportadora: CNPJ inválido retorna 400 sem persistir', async () => {
    const data = carrierData({ cnpj: '00000000000000' });
    await api()
      .post(url('/api/carriers'))
      .withJson(data)
      .expectStatus(400)
      .expectJsonLike({
        fields: {
          cnpj: 'CNPJ inválido. Confira os 14 caracteres e os dois números finais.'
        }
      });
    await api()
      .get(url('/api/carriers'))
      .withQueryParams('q', data.name)
      .expectStatus(200)
      .expectJson([]);
  });
  test('C20 DELETE transportadora com carga: retorna 409 e preserva vínculo', async () => {
    const { data, id } = await cargoFixture();
    await api()
      .delete(url(`/api/carriers/${data.carrierId}`))
      .withJson({ confirmed: true })
      .expectStatus(409)
      .expectJson({
        error:
          'A transportadora tem cargas vinculadas. Preserve o cadastro para manter o histórico.'
      });
    await api()
      .get(url(`/api/cargos/${id}`))
      .expectStatus(200)
      .expectJsonLike({ carrierId: data.carrierId });
  });
});

describe('C21–C30 | Cargas: CRUD, negociação e integridade', () => {
  test('C21 POST e GET carga: vincula transportadora e persiste frete e percurso', async () => {
    const { data, id } = await cargoFixture();
    await api()
      .get(url(`/api/cargos/${id}`))
      .expectStatus(200)
      .expectJsonLike({ id, ...data });
  });
  test('C22 GET lista de cargas: filtra por situação e destino', async () => {
    const { id } = await cargoFixture();
    await api()
      .get(url('/api/cargos'))
      .withQueryParams({ q: 'Curitiba', status: 'available' })
      .expectStatus(200)
      .expectJsonLength(1)
      .expectJsonLike([{ id, destinationCity: 'Curitiba' }]);
    await api()
      .get(url('/api/cargos'))
      .withQueryParams('status', 'cancelled')
      .expectStatus(200)
      .expectJson([]);
  });
  test('C23 PUT carga: altera frete e destino, confirmado por nova consulta', async () => {
    const { data, id } = await cargoFixture();
    const updated = {
      ...data,
      freightCents: 300000,
      destinationCity: 'Joinville',
      destinationState: 'SC'
    };
    await api()
      .put(url(`/api/cargos/${id}`))
      .withJson(updated)
      .expectStatus(200)
      .expectJsonLike({ id, ...updated });
    await api()
      .get(url(`/api/cargos/${id}`))
      .expectStatus(200)
      .expectJsonLike(updated);
  });
  test('C24 PATCH negociação: ativa e desativa sem alterar o restante da carga', async () => {
    const { data, id } = await cargoFixture();
    await api()
      .patch(url(`/api/cargos/${id}/negotiation`))
      .withJson({ active: true })
      .expectStatus(200)
      .expectJsonLike({
        id,
        status: 'negotiating',
        freightCents: data.freightCents
      });
    await api()
      .get(url(`/api/cargos/${id}`))
      .expectStatus(200)
      .expectJsonLike({ status: 'negotiating' });
    await api()
      .patch(url(`/api/cargos/${id}/negotiation`))
      .withJson({ active: false })
      .expectStatus(200)
      .expectJsonLike({ id, ...data });
    await api()
      .get(url(`/api/cargos/${id}`))
      .expectStatus(200)
      .expectJsonLike(data);
  });
  test('C25 DELETE carga: exclui sem excluir a transportadora', async () => {
    const { data, id } = await cargoFixture();
    await remove('/api/cargos', id);
    await api()
      .get(url(`/api/cargos/${id}`))
      .expectStatus(404)
      .expectJson(notFound);
    await api()
      .get(url(`/api/carriers/${data.carrierId}`))
      .expectStatus(200)
      .expectJsonLike({ id: data.carrierId });
  });
  test('C26 POST carga: frete zero retorna 400 sem cadastrar outra carga', async () => {
    const { data } = await cargoFixture();
    await api()
      .post(url('/api/cargos'))
      .withJson({ ...data, freightCents: 0 })
      .expectStatus(400)
      .expectJsonLike({
        fields: { freightCents: 'O valor do frete deve ser maior que zero.' }
      });
    await api().get(url('/api/cargos')).expectStatus(200).expectJsonLength(1);
  });
  test('C27 POST carga: transportadora inexistente retorna 404 sem cadastrar', async () => {
    const { data } = await cargoFixture();
    await api()
      .post(url('/api/cargos'))
      .withJson({ ...data, carrierId: randomUUID() })
      .expectStatus(404)
      .expectJson(notFound);
    await api().get(url('/api/cargos')).expectStatus(200).expectJsonLength(1);
  });
  test('C28 PATCH negociação: tipo inválido retorna 400 e não muda situação', async () => {
    const { id } = await cargoFixture();
    await api()
      .patch(url(`/api/cargos/${id}/negotiation`))
      .withJson({ active: 'sim' })
      .expectStatus(400);
    await api()
      .get(url(`/api/cargos/${id}`))
      .expectStatus(200)
      .expectJsonLike({ status: 'available' });
  });
  test('C29 GET e DELETE: outro usuário não consulta nem exclui carga alheia', async () => {
    const { id } = await cargoFixture();
    await api(secondary)
      .get(url(`/api/cargos/${id}`))
      .expectStatus(404)
      .expectJson(notFound);
    await api(secondary)
      .delete(url(`/api/cargos/${id}`))
      .withJson({ confirmed: true })
      .expectStatus(404)
      .expectJson(notFound);
    await api(secondary)
      .get(url('/api/cargos'))
      .expectStatus(200)
      .expectJson([]);
    await api()
      .get(url(`/api/cargos/${id}`))
      .expectStatus(200)
      .expectJsonLike({ id });
  });
  test('C30 GET carga: ID inválido retorna 400, UUID inexistente retorna 404', async () => {
    await api()
      .get(url('/api/cargos/id-invalido'))
      .expectStatus(400)
      .expectJsonLike({ error: 'Identificador inválido.' });
    await api()
      .get(url(`/api/cargos/${randomUUID()}`))
      .expectStatus(404)
      .expectJson(notFound);
  });
});
