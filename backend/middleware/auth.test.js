const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'auth-middleware-test-secret';

const User = require('../models/User');
const { protect, optionalAuth } = require('./auth');
const { loginStudent } = require('../controllers/authController');

const originalFindById = User.findById;
const originalFindOne = User.findOne;

const makeResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const makeRequest = (id, role = 'student') => ({
  headers: { authorization: `Bearer ${jwt.sign({ id, role }, process.env.JWT_SECRET)}` },
});

const runProtect = async (id, account, role = 'student') => {
  let projection = '';
  let usedLean = false;
  User.findById = () => ({
    select(fields) { projection = fields; return this; },
    async lean() { usedLean = true; return account; },
  });
  const req = makeRequest(id, role);
  const res = makeResponse();
  let nextCalls = 0;
  await protect(req, res, () => { nextCalls += 1; });
  return { req, res, nextCalls, projection, usedLean };
};

test.after(() => {
  User.findById = originalFindById;
  User.findOne = originalFindOne;
});

test('protect accepts a live student and preserves the decoded request identity', async () => {
  const result = await runProtect('live-student', { _id: 'live-student', role: 'student' });
  assert.equal(result.res.statusCode, 200);
  assert.equal(result.nextCalls, 1);
  assert.equal(result.req.user.id, 'live-student');
  assert.equal(result.req.user.role, 'student');
  assert.match(result.projection, /role/);
  assert.doesNotMatch(result.projection, /password/);
  assert.equal(result.usedLean, true);
});

test('protect does not block live teacher or admin accounts', async (t) => {
  for (const role of ['teacher', 'admin']) {
    await t.test(role, async () => {
      const result = await runProtect(`live-${role}`, { _id: `live-${role}`, role }, role);
      assert.equal(result.res.statusCode, 200);
      assert.equal(result.nextCalls, 1);
      assert.equal(result.req.user.role, role);
    });
  }
});

test('protect uses the current database role when a JWT contains a stale role', async () => {
  const id = 'demoted-teacher';
  User.findById = () => ({
    select() { return this; },
    async lean() { return { _id: id, role: 'student' }; },
  });
  const req = makeRequest(id, 'teacher');
  const res = makeResponse();
  let nextCalls = 0;

  await protect(req, res, () => { nextCalls += 1; });

  assert.equal(res.statusCode, 200);
  assert.equal(nextCalls, 1);
  assert.equal(req.user.id, id);
  assert.equal(req.user.role, 'student');
});

test('protect rejects banned and disabled accounts even when JWTs are valid', async (t) => {
  for (const account of [
    { _id: 'banned-student', role: 'student', isBanned: true },
    { _id: 'disabled-teacher', role: 'teacher', isDisabled: true },
  ]) {
    await t.test(account._id, async () => {
      const result = await runProtect(account._id, account, account.role);
      assert.equal(result.res.statusCode, 401);
      assert.equal(result.nextCalls, 0);
      assert.equal(result.req.user, undefined);
    });
  }
});

test('protect rejects deleted and unknown account IDs', async (t) => {
  for (const id of ['deleted-student', 'unknown-account']) {
    await t.test(id, async () => {
      const result = await runProtect(id, null);
      assert.equal(result.res.statusCode, 401);
      assert.equal(result.nextCalls, 0);
      assert.equal(result.req.user, undefined);
    });
  }
});

test('optionalAuth keeps public routes open but omits revoked identities', async () => {
  User.findById = () => ({
    select() { return this; },
    async lean() { return { _id: 'disabled-student', role: 'student', status: 'disabled' }; },
  });
  const req = makeRequest('disabled-student');
  const res = makeResponse();
  let nextCalls = 0;
  await optionalAuth(req, res, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(req.user, undefined);
});

test('student login does not issue a token for an account with no password hash', async () => {
  User.findOne = () => ({
    select() { return Promise.resolve({ _id: 'passwordless-student', role: 'student', phone: '+8801700000000' }); },
  });
  const req = { body: { phone: '+8801700000000', password: 'anything' } };
  const res = makeResponse();

  await loginStudent(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.token, undefined);
});
