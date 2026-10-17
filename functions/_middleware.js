// Ask Elijah public beta is paused (relaunching later). Every /ask-elijah route and the beta app's
// API (/.netlify/*) redirects (302, temporary) to the email waitlist, unless the visitor has the
// private beta cookie. Elijah gets the cookie by opening /ask-elijah/?key=<private token> once.
// Only the SHA-256 of the token lives here; the token itself is kept privately.
const TOKEN_SHA256 = '68c1925ba9123bfae1393225b363502bff853f93dc8d2278949cd394cf4aff54';
const COOKIE = 'ae_beta';
const WAITLIST = '/waitlist/';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}
function isGated(pathname) {
  const p = pathname.toLowerCase();
  return p === '/ask-elijah' || p.startsWith('/ask-elijah/') || p.startsWith('/ask-elijah.') || p.startsWith('/.netlify/');
}
const noStore = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (!isGated(url.pathname)) return next();

  const key = url.searchParams.get('key');
  if (key && (await sha256(key)) === TOKEN_SHA256) {
    url.searchParams.delete('key');
    const dest = url.pathname.toLowerCase() === '/ask-elijah' ? '/ask-elijah/' : url.pathname + url.search;
    return new Response(null, {
      status: 302,
      headers: { ...noStore, Location: dest, 'Set-Cookie': `${COOKIE}=${key}; Path=/; Max-Age=5184000; HttpOnly; Secure; SameSite=Lax` },
    });
  }

  const cookie = readCookie(request, COOKIE);
  if (cookie && (await sha256(cookie)) === TOKEN_SHA256) {
    const res = await next();
    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', 'private, no-store');
    out.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return out;
  }

  return new Response(null, { status: 302, headers: { ...noStore, Location: WAITLIST } });
}
