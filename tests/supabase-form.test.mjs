import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
import { readText } from './helpers.mjs';

const source = readText('supabase.js');
const expectedEndpoint =
  'https://mndumzkkhdtggcgmddbv.supabase.co/functions/v1/subscribe';

function createHarness({
  hostname = 'vimix.us',
  email = 'captain@example.com',
  name = 'Captain',
  response = { ok: true, payload: { message: 'Subscribed!' } },
  networkError,
} = {}) {
  const submitListeners = [];
  const fetchCalls = [];
  const classNames = new Set();
  let resetCount = 0;

  const elements = {
    'mailing-list-form': {
      addEventListener(type, listener) {
        if (type === 'submit') submitListeners.push(listener);
      },
      reset() {
        resetCount += 1;
      },
    },
    'mailing-email': { value: email },
    'mailing-name': { value: name },
    'mailing-submit-btn': {
      disabled: false,
      classList: {
        add(value) {
          classNames.add(value);
        },
        remove(value) {
          classNames.delete(value);
        },
      },
    },
    'mailing-status': {
      textContent: '',
      className: '',
    },
  };

  const context = {
    console: { error() {} },
    window: { location: { hostname } },
    document: {
      addEventListener(type, listener) {
        if (type === 'DOMContentLoaded') listener();
      },
      getElementById(id) {
        return elements[id] ?? null;
      },
    },
    async fetch(url, options) {
      fetchCalls.push({ url, options });
      if (networkError) throw networkError;
      return {
        ok: response.ok,
        async json() {
          return response.payload;
        },
      };
    },
  };

  vm.runInNewContext(source, context, { filename: 'supabase.js' });
  assert.equal(submitListeners.length, 1);

  return {
    elements,
    fetchCalls,
    classNames,
    get resetCount() {
      return resetCount;
    },
    async submit() {
      let prevented = false;
      await submitListeners[0]({
        preventDefault() {
          prevented = true;
        },
      });
      return prevented;
    },
  };
}

test('production submission posts normalized data to the Supabase edge function', async () => {
  const harness = createHarness({
    email: '  captain@example.com  ',
    name: '  River Guide  ',
  });

  assert.equal(await harness.submit(), true);
  assert.equal(harness.fetchCalls.length, 1);

  const [{ url, options }] = harness.fetchCalls;
  assert.equal(url, expectedEndpoint);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(options.body), {
    email: 'captain@example.com',
    name: 'River Guide',
    source: 'website-prod',
  });
  assert.equal(harness.elements['mailing-status'].textContent, 'Subscribed!');
  assert.equal(harness.elements['mailing-status'].className, 'form-status success');
  assert.equal(harness.resetCount, 1);
});

test('local and preview hosts are tagged as development submissions', async () => {
  for (const hostname of ['localhost', '127.0.0.1', 'feature-preview.example']) {
    const harness = createHarness({ hostname, name: '' });
    await harness.submit();

    assert.deepEqual(JSON.parse(harness.fetchCalls[0].options.body), {
      email: 'captain@example.com',
      source: 'website-dev',
    });
  }
});

test('empty email is rejected before a network request', async () => {
  const harness = createHarness({ email: '   ' });
  await harness.submit();

  assert.equal(harness.fetchCalls.length, 0);
  assert.equal(
    harness.elements['mailing-status'].textContent,
    'Please enter your email address.',
  );
  assert.equal(harness.elements['mailing-status'].className, 'form-status error');
});

test('API errors are displayed and the submit button is restored', async () => {
  const harness = createHarness({
    response: { ok: false, payload: { error: 'Already subscribed.' } },
  });
  await harness.submit();

  assert.equal(harness.elements['mailing-status'].textContent, 'Already subscribed.');
  assert.equal(harness.elements['mailing-status'].className, 'form-status error');
  assert.equal(harness.elements['mailing-submit-btn'].disabled, false);
  assert.equal(harness.classNames.has('loading'), false);
});

test('network errors are handled without leaving the form disabled', async () => {
  const harness = createHarness({ networkError: new Error('offline') });
  await harness.submit();

  assert.match(harness.elements['mailing-status'].textContent, /^Network error/);
  assert.equal(harness.elements['mailing-status'].className, 'form-status error');
  assert.equal(harness.elements['mailing-submit-btn'].disabled, false);
  assert.equal(harness.classNames.has('loading'), false);
});
