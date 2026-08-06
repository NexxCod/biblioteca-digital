// Prueba de humo del arranque.
//
// POR QUÉ EXISTE: un `import` olvidado en routes/integrationRoutes.js
// (`integrationConfig` usado sin importar) lanzaba ReferenceError al evaluar
// el módulo. Como server.js lo importa de forma estática, el proceso moría
// ANTES de escuchar: no era la integración la que fallaba, era el backend
// entero el que no arrancaba. Nada lo detectó porque no había pruebas.
//
// Esta prueba carga cada módulo de rutas igual que lo hace server.js. No
// necesita Mongo ni Drive: solo comprueba que el grafo de módulos evalúa.
// Corre con `npm test` (node --test, sin dependencias nuevas).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('todos los módulos de rutas se pueden importar (el servidor arranca)', async () => {
  const archivos = (await readdir(path.join(raiz, 'routes')))
    .filter((f) => f.endsWith('.js'))
    .sort();
  assert.ok(archivos.length > 5, 'se esperaban varios archivos de rutas');

  const rotos = [];
  for (const f of archivos) {
    try {
      const mod = await import(path.join(raiz, 'routes', f));
      assert.equal(typeof mod.default, 'function', `${f} no exporta un router`);
    } catch (e) {
      rotos.push(`${f}: ${e.constructor.name} — ${e.message}`);
    }
  }
  assert.deepEqual(rotos, [], 'módulos de rutas que no cargan');
});

test('la API de integración expone exactamente las rutas que consume preinforme-analytics', async () => {
  const { default: router } = await import(path.join(raiz, 'routes/integrationRoutes.js'));
  const rutas = router.stack
    .filter((capa) => capa.route)
    .map((capa) => `${Object.keys(capa.route.methods)[0].toUpperCase()} ${capa.route.path}`);

  // El contrato con PA (src/lib/biblioteca.js). Cambiar esta lista obliga a
  // cambiar el otro lado en el mismo commit.
  assert.deepEqual(rutas.sort(), [
    'DELETE /files/:id',
    'GET /config',
    'POST /files',
    'POST /sso',
    'POST /users/ensure',
  ]);
});

// Levanta el router real en un puerto efímero y devuelve {url, cerrar}.
const montar = async () => {
  const { default: router } = await import(path.join(raiz, 'routes/integrationRoutes.js'));
  const app = express();
  app.use(express.json());
  app.use('/api/integration', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    cerrar: () => new Promise((r) => server.close(r)),
  };
};

test('sin INTEGRATION_API_KEY la integración queda cerrada (503), nunca abierta', async () => {
  const previo = process.env.INTEGRATION_API_KEY;
  delete process.env.INTEGRATION_API_KEY;
  const { url, cerrar } = await montar();
  try {
    const r = await fetch(`${url}/api/integration/config`);
    assert.equal(r.status, 503);
  } finally {
    await cerrar();
    if (previo !== undefined) process.env.INTEGRATION_API_KEY = previo;
  }
});

test('con la llave configurada, solo pasa quien la trae correcta', async () => {
  const previo = process.env.INTEGRATION_API_KEY;
  process.env.INTEGRATION_API_KEY = 'llave-de-prueba';
  const { url, cerrar } = await montar();
  try {
    const sinLlave = await fetch(`${url}/api/integration/config`);
    assert.equal(sinLlave.status, 401, 'sin header debe rechazar');

    const malLlave = await fetch(`${url}/api/integration/config`, {
      headers: { 'x-integration-key': 'otra-cosa' },
    });
    assert.equal(malLlave.status, 401, 'con llave distinta debe rechazar');

    // Con la llave correcta ya NO es 401 ni 404: la petición llegó al
    // controlador (que aquí fallará por no haber Mongo, y da igual — lo que
    // se comprueba es el enrutado y la frontera de confianza).
    const conLlave = await fetch(`${url}/api/integration/config`, {
      headers: { 'x-integration-key': 'llave-de-prueba' },
    });
    assert.notEqual(conLlave.status, 401);
    assert.notEqual(conLlave.status, 404);
  } finally {
    await cerrar();
    if (previo === undefined) delete process.env.INTEGRATION_API_KEY;
    else process.env.INTEGRATION_API_KEY = previo;
  }
});
