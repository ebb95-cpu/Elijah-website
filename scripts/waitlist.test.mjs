import { test } from 'node:test';
import assert from 'node:assert/strict';
import waitlist from '../netlify/functions/waitlist.mts';

globalThis.Netlify = { env: { get: key => key === 'BEEHIIV_API_KEY' ? 'test-key' : 'pub_test' } };
const request = body => new Request('http://localhost/api/waitlist', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' }, body: JSON.stringify(body),
});
const response = (data, status = 200) => Response.json({ data }, { status });

test('rejects invalid emails without contacting Beehiiv', async () => {
  globalThis.fetch = () => { throw Error('Unexpected request'); };
  assert.equal((await waitlist(request({ email: 'invalid' }))).status, 400);
});

test('creates and tags a new waitlist subscriber before confirming success', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options, payload: options.body && JSON.parse(options.body) });
    return calls.length === 1 ? response({}, 404) : response({ id: 'sub_test', status: 'active' });
  };
  const result = await waitlist(request({ email: ' TEST@example.com ' }));
  assert.equal((await result.json()).success, true);
  assert.equal(calls[1].payload.email, 'test@example.com');
  assert.equal(calls[1].payload.send_welcome_email, false);
  assert.equal(calls[1].payload.reactivate_existing, false);
  assert.deepEqual(calls[1].payload.custom_fields, [{ name: 'Ask Elijah Waitlist', value: 'yes' }]);
  assert.deepEqual(calls[2].payload.tags, ['Ask Elijah Waitlist']);
});

test('updates existing subscribers without creating duplicates', async () => {
  const methods = [];
  globalThis.fetch = async (url, options) => { methods.push(options.method); return response({ id: 'sub_test', status: 'active' }); };
  assert.equal((await waitlist(request({ email: 'test@example.com' }))).status, 200);
  assert.deepEqual(methods, ['GET', 'PUT', 'POST']);
});

test('does not reactivate an unsubscribed address', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response({ id: 'sub_test', status: 'inactive' }); };
  assert.equal((await waitlist(request({ email: 'test@example.com' }))).status, 409);
  assert.equal(calls, 1);
});

test('does not claim success when tagging fails', async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 3 ? response({}, 500) : response({ id: 'sub_test', status: 'active' });
  const result = await waitlist(request({ email: 'test@example.com' }));
  assert.equal(result.status, 502);
  assert.equal((await result.json()).success, false);
});
