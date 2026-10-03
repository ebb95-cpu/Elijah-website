const json = (status, message, success = false) => Response.json({ success, message }, {
  status, headers: { 'Cache-Control': 'no-store' }
});

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, 'Method not allowed.');
  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(request.url).origin) return json(403, 'Please send your message from the website.');
  if (!request.headers.get('Content-Type')?.includes('application/json')) return json(415, 'Invalid request.');
  let data;
  try {
    const body = await request.text();
    if (body.length > 12000) return json(413, 'Your message is too long.');
    data = JSON.parse(body);
  } catch { return json(400, 'Please check your message.'); }
  if (!data || typeof data !== 'object') return json(400, 'Please check your message.');
  if (data.website) return json(400, 'Please try again.');
  const { name, company = '', email, message } = data;
  if (typeof name !== 'string' || !name.trim() || name.length > 100 || /[\r\n]/.test(name)
    || typeof company !== 'string' || company.length > 120 || /[\r\n]/.test(company)
    || typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || typeof message !== 'string' || message.trim().length < 10 || message.length > 5000) {
    return json(400, 'Please enter your name, a valid email, and a message of 10 to 5,000 characters.');
  }
  // Keep delivery disabled until credentials and a durable rate limiter are configured.
  if (!env.RESEND_API_KEY || !env.CONTACT_TO || !env.CONTACT_FROM || !env.CONTACT_RATE_LIMITER) {
    return json(503, 'The contact form is not ready yet. Please try again later.');
  }
  try {
    const limit = await env.CONTACT_RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
    if (!limit.success) return json(429, 'Please wait a minute before sending another message.');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.CONTACT_FROM, to: [env.CONTACT_TO], reply_to: email,
        subject: 'Website inquiry: ' + name.trim(),
        text: 'Name: ' + name.trim() + '\nCompany: ' + company.trim() + '\nEmail: ' + email + '\n\n' + message.trim() }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return json(502, 'Your message was not sent. Please try again shortly.');
    return json(200, 'Message sent.', true);
  } catch { return json(502, 'Unable to confirm delivery. Please try again shortly.'); }
}
