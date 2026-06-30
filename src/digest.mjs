// Turn a stored session into a human "welcome back" line.
export function summarize(events) {
  const blueprints = events.filter((e) => e.type === 'blueprint_earned').map((e) => e.name).filter(Boolean);
  const deaths = events.filter((e) => e.type === 'actor_death');
  return {
    blueprints,
    kills: deaths.filter((e) => e.role === 'kill').length,
    deaths: deaths.filter((e) => e.role === 'death').length,
    total: events.length,
  };
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }

export function relativeWhen(thenIso, nowIso = new Date().toISOString()) {
  const then = new Date(thenIso), now = new Date(nowIso);
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / 86400000);
  const hour = then.getHours();
  if (dayDiff <= 0) return 'earlier today';
  if (dayDiff === 1) return (hour >= 18 || hour < 5) ? 'last night' : 'yesterday';
  if (dayDiff < 7) return `${dayDiff} days ago`;
  return then.toLocaleDateString();
}

export function formatDigest(session, nowIso = new Date().toISOString()) {
  if (!session || !session.events || !session.events.length) return null;
  const s = summarize(session.events);
  const parts = [];
  if (s.blueprints.length) {
    const shown = s.blueprints.slice(0, 8).join(', ');
    const more = s.blueprints.length > 8 ? `, +${s.blueprints.length - 8} more` : '';
    parts.push(`${s.blueprints.length} blueprint${s.blueprints.length === 1 ? '' : 's'} (${shown}${more})`);
  }
  if (s.kills) parts.push(`${s.kills} kill${s.kills === 1 ? '' : 's'}`);
  if (s.deaths) parts.push(`${s.deaths} death${s.deaths === 1 ? '' : 's'}`);
  if (!parts.length) return null;
  const when = relativeWhen(session.lastAt, nowIso);
  return `Welcome back. ${when.charAt(0).toUpperCase() + when.slice(1)} you logged ${parts.join(' \u00b7 ')}.`;
}

// Structured recap event sent to the bot (which DMs the member). Null if nothing notable.
export function buildRecap(session, nowIso = new Date().toISOString()) {
  if (!session || !session.events || !session.events.length) return null;
  const s = summarize(session.events);
  if (!s.blueprints.length && !s.kills && !s.deaths) return null;
  return {
    type: 'session_recap',
    blueprints: s.blueprints,
    kills: s.kills,
    deaths: s.deaths,
    when: relativeWhen(session.lastAt, nowIso),
    at: session.lastAt,
  };
}
