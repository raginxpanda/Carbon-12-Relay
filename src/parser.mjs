// Carbon-12 Relay — Star Citizen Game.log parser. Pure, dependency-free.
// Validation (real 4.8.184 LIVE log, 2026-06-29): handle_detected, session_start,
// handle/build/env/session CONFIRMED. blueprint_earned CONFIRMED against real
// 4.8 logbackups (Added-notification line, deduped by name). actor_death
// (community-known format) still PENDING a session that contains a kill.
const TS = /^<([0-9T:.+\-]+Z)>/;
export function tsOf(line) { const m = line.match(TS); return m ? m[1] : null; }
export function matchHandle(line) {
  let m = line.match(/<AccountLoginCharacterStatus_Character>.*?- name (\S+) - state STATE_CURRENT/);
  if (m) { const g = line.match(/- geid (\d+)/); return { handle: m[1], geid: g ? g[1] : null }; }
  m = line.match(/<Legacy login response>.*?Handle\[([^\]]+)\]/);
  if (m) return { handle: m[1], geid: null };
  return null;
}
export function matchBuild(line) {
  const v = line.match(/FileVersion:\s*([\d.]+)/); if (v) return { version: v[1] };
  const e = line.match(/\[Trace\]\s*Environment:\s*(\S+)/); if (e) return { environment: e[1] };
  return null;
}
export function matchSession(line) {
  const m = line.match(/<ContextEstablisherTaskFinished>.*?establisher="CReplicationModel".*?sessionId="([^"]+)"/);
  return m ? { sessionId: m[1] } : null;
}
export function matchBlueprint(line) {
  // Real earn line (4.8): [Notice] <SHUDEvent_OnNotification> Added notification
  //   "Received Blueprint: <name>: " [id] to queue.  — the same blueprint also
  // re-echoes on render/fade/remove, so match ONLY the "Added notification" event.
  const m = line.match(/Added notification "Received Blueprint:\s*(.+?):\s*"/);
  return m ? { name: m[1].trim() } : null;
}
export function matchActorDeath(line) {
  if (!/<Actor Death>/.test(line) && !/CActor::Kill/.test(line)) return null;
  const g = (re) => { const m = line.match(re); return m ? m[1] : null; };
  const victim = g(/CActor::Kill:\s*'([^']+)'/), killer = g(/killed by '([^']+)'/);
  if (!victim && !killer) return null;
  return { victim, killer, weapon: g(/using '([^']+)'/), zone: g(/in zone '([^']+)'/), damageType: g(/with damage type '([^']+)'/) };
}
export function createParser() {
  const state = { handle: null, geid: null, sessionId: null, version: null, environment: null, seenBlueprints: new Set() };
  function feed(rawLine) {
    const line = rawLine.replace(/\r$/, ''); const ts = tsOf(line); const out = [];
    const b = matchBuild(line); if (b) Object.assign(state, b);
    const h = matchHandle(line);
    if (h) { if (h.geid && !state.geid) state.geid = h.geid;
      if (h.handle !== state.handle) { state.handle = h.handle; out.push({ type:'handle_detected', handle: state.handle, geid: state.geid, ts }); } }
    const ss = matchSession(line);
    if (ss && ss.sessionId !== state.sessionId) { state.sessionId = ss.sessionId;
      out.push({ type:'session_start', sessionId: ss.sessionId, version: state.version, environment: state.environment, ts }); }
    const bp = matchBlueprint(line);
    if (bp && !state.seenBlueprints.has(bp.name)) { state.seenBlueprints.add(bp.name); out.push({ type:'blueprint_earned', name: bp.name, handle: state.handle, ts }); }
    const d = matchActorDeath(line);
    if (d) { const role = state.handle && d.killer === state.handle ? 'kill' : state.handle && d.victim === state.handle ? 'death' : 'witness';
      out.push({ type:'actor_death', ...d, role, handle: state.handle, ts }); }
    return out;
  }
  return { feed, state };
}
