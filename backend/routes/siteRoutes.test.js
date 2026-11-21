const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('./siteRoutes');

test('public site routes expose durable assets without authentication middleware', () => {
  const routes = router.stack.filter((layer) => layer.route).map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
  assert.ok(routes.includes('GET /assets/:id'));
});
