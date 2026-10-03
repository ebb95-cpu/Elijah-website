import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('contact prepares an encoded email draft without claiming delivery', () => {
  let submit;
  const status = { textContent: '' };
  const values = new Map([['name', 'Test & Partner'], ['company', 'A+B'], ['email', 'test@example.com'], ['message', 'Hello? A partnership & more.'], ['website', '']]);
  const form = { reportValidity: () => true, addEventListener: (_, fn) => { submit = fn; } };
  const window = { location: { href: '' } };
  vm.runInNewContext(fs.readFileSync(new URL('../js/contact.js', import.meta.url), 'utf8'), {
    window,
    document: { querySelectorAll: () => [], getElementById: id => id === 'contact-form' ? form : status },
    FormData: function () { return values; },
  });
  submit({ preventDefault() {} });
  const url = new URL(window.location.href);
  assert.equal(url.protocol, 'mailto:');
  assert.equal(url.pathname, 'crushedcrib19@gmail.com');
  assert.equal(url.searchParams.get('subject'), 'Website inquiry from Test & Partner - A+B');
  assert.match(url.searchParams.get('body'), /Hello\? A partnership & more\./);
  assert.match(status.textContent, /has not been sent/);
  window.location.href = '';
  values.set('website', 'spam');
  submit({ preventDefault() {} });
  assert.equal(window.location.href, '');
  values.set('website', '');
  form.reportValidity = () => false;
  submit({ preventDefault() {} });
  assert.equal(window.location.href, '');
});
