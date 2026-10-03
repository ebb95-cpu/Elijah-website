import waitlist from '../../netlify/functions/waitlist.mts';

export function onRequest({ request, env }) {
  return waitlist(request, undefined, env);
}
