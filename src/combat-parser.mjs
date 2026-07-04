// Combat parser for the Carbon-12 relay — emits actor_death events the bot ingests.
// Grounded in the REAL SC kill-line format, cross-validated against an independent
// working kill-feed tool (citizenmon) that parses the same lines.
//
// Canonical line:
//   <ts> [Notice] <Actor Death> CActor::Kill: '<victim>' [id] in zone '<zone>'
//     killed by '<killer>' [id] using '<weapon>' [Class ...] with damage type '<type>' ...
//
// We emit a NEUTRAL event (killer + victim, no self-judgement). The BOT decides
// outcome (kill/death/witnessed) by comparing against the paired member's handle —
// that attribution logic already exists server-side (r258) and is the correct place
// for it, since only the bot knows which handle owns this device.

const RE_TS = /<([0-9T:.\-]+Z)>/;

// Core kill line. victim and killer captured; weapon + damage type optional.
const RE_KILL = /CActor::Kill:\s*'([^']+)'.*?killed by\s*'([^']+)'(?:.*?using\s*'([^']+)')?(?:.*?with damage type\s*'([^']+)')?/;

// Vehicle destruction (ship kills) — different line, names cause + weapon.
const RE_VEHICLE = /CVehicle::OnAdvanceDestroyLevel:\s*Vehicle\s*'([^']+)'.*?advanced from destroy level\s*([0-9]+)\s*to\s*([0-9]+)\s*caused by\s*'([^']+)'.*?with\s*'([^']+)'/;

function cleanName(s) {
  if (!s) return s;
  return String(s).replace(/_\d+$/, '').replace(/_/g, ' ');
}
// A victim/killer token that's clearly an NPC/AI or environment, not a player handle.
// Players are handles (letters/digits/underscore, no spaces). NPC archetypes usually
// contain PU_/NPC/AIModule/Kopion/etc. We DON'T hard-filter here (the bot counts by
// outcome), but we tag likely-NPC so the bot can choose to ignore.
function looksNPC(name) {
  if (!name) return true;
  return /(^|_)(PU|NPC|AIModule|Kopion|Marok|Quasigrazer|ai_)/i.test(name) || /-/.test(name);
}

export function parseCombatLine(line) {
  if (!line || line.indexOf('CActor::Kill:') === -1 && line.indexOf('CVehicle::OnAdvanceDestroyLevel') === -1) return null;
  const tsm = line.match(RE_TS);
  const ts = tsm ? tsm[1] : null;

  let m;
  if ((m = line.match(RE_KILL))) {
    const victim = m[1];
    const killer = m[2];
    const weapon = m[3] ? cleanName(m[3]) : null;
    const damageType = m[4] || null;
    // Require a timestamp — the bot rejects tsless kills (event_key would collide).
    if (!ts) return null;
    return {
      type: 'actor_death',
      ts,
      victim,
      killer,
      weapon,
      damage_type: damageType,
      victim_npc: looksNPC(victim),
      killer_npc: looksNPC(killer),
    };
  }

  if ((m = line.match(RE_VEHICLE))) {
    if (!ts) return null;
    return {
      type: 'actor_death',
      ts,
      victim: cleanName(m[1]),      // the destroyed vehicle
      killer: m[4],                 // cause (player or entity)
      weapon: cleanName(m[5]),
      damage_type: 'vehicle',
      kind: 'vehicle',
      to_destroy_level: Number(m[3]) || null,
      victim_npc: false,
      killer_npc: looksNPC(m[4]),
    };
  }
  return null;
}
