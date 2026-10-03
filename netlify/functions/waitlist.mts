const LIST = 'Ask Elijah Waitlist';
const reply = (status, message, success = false) => Response.json({ success, message }, {
  status, headers: { 'Cache-Control': 'no-store' },
});

export default async function waitlist(request, context, environment) {
  if (request.method !== 'POST') return reply(405, 'Method not allowed.');
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) {
    return reply(403, 'Please sign up through the website.');
  }
  if (!request.headers.get('content-type')?.includes('application/json')) return reply(415, 'JSON required.');
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return reply(413, 'Request too large.');
    body = JSON.parse(raw);
  } catch { return reply(400, 'Please enter a valid email address.'); }
  if (!body || typeof body.email !== 'string') return reply(400, 'Please enter a valid email address.');
  if (body.website) return reply(400, 'Unable to submit this form.');
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply(400, 'Please enter a valid email address.');
  }
  const key = environment ? environment.BEEHIIV_API_KEY : Netlify.env.get('BEEHIIV_API_KEY');
  const publication = environment ? environment.BEEHIIV_PUBLICATION_ID : Netlify.env.get('BEEHIIV_PUBLICATION_ID');
  if (!key || !publication) return reply(503, 'Signups are temporarily unavailable. Please try again later.');
  const base = `https://api.beehiiv.com/v2/publications/${publication}/subscriptions`;
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const custom_fields = [{ name: LIST, value: 'yes' }];
  async function api(url, method = 'GET', data) {
    const response = await fetch(url, { method, headers, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(10000) });
    const json = await response.json().catch(() => ({}));
    return { response, data: json.data || json };
  }
  try {
    const existing = await api(`${base}/by_email/${encodeURIComponent(email)}`);
    let result;
    if (existing.response.ok) {
      if (['inactive', 'invalid', 'paused', 'needs_attention'].includes(existing.data.status)) {
        return reply(409, 'This address cannot receive updates right now. Please use another email or update your subscription preferences.');
      }
      result = await api(`${base}/${existing.data.id}`, 'PUT', { custom_fields });
    } else if (existing.response.status === 404) {
      result = await api(base, 'POST', {
        email, reactivate_existing: false, send_welcome_email: false,
        skip_newsletter_list_auto_subscribe: true,
        utm_source: 'elijahbryant.pro', utm_medium: 'website', utm_campaign: 'ask_elijah_waitlist',
        custom_fields,
      });
    } else {
      return reply(502, 'We could not save your email. Please try again.');
    }
    const subscriber = result.data;
    if (!result.response.ok || !subscriber.id) return reply(502, 'We could not save your email. Please try again.');
    if (['inactive', 'invalid', 'paused', 'needs_attention'].includes(subscriber.status)) {
      return reply(409, 'Please use another email address to join the waitlist.');
    }
    const tagged = await api(`${base}/${subscriber.id}/tags`, 'POST', { tags: [LIST] });
    if (!tagged.response.ok) return reply(502, 'We could not finish your signup. Please try again.');
    return reply(200, subscriber.status === 'pending'
      ? 'Check your inbox to confirm your email and finish joining the waitlist.'
      : "You're on the Ask Elijah waitlist. We'll email you when it's ready.", true);
  } catch {
    return reply(502, 'We could not reach the signup service. Please try again.');
  }
}

export const config = { path: '/api/waitlist' };
