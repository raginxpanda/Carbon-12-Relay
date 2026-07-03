// Location/death parser — grounded in REAL Carbon-12 Game.log lines (verified via diagnostic).
// Emits location_update events: { type, ts, handle, location, kind, ship? }

const RE_TS = /^<([0-9T:.\-]+Z)>/;

// "at a named location" — the clean primary signal (119 hits in real logs)
// <ts> [Notice] <RequestLocationInventory> Player[HANDLE] requested inventory for Location[PLACE] ...
const RE_LOC = /<RequestLocationInventory>\s*Player\[([^\]]+)\]\s*requested inventory for Location\[([^\]]+)\]/;

// death — you died, in a ship, ejected from its zone
// <ts> ... <[ActorState] Dead> ... Actor 'HANDLE' [id] ejected from zone 'SHIP_ZONE' [id] to zone '...' due to previous zone being in a destroyed vehicle ...
const RE_DEATH = /<\[ActorState\] Dead>.*?Actor '([^']+)'.*?ejected from zone '([^']+)'.*?destroyed vehicle/;

// quantum arrival — names the ship; a movement waypoint
// <ts> ... <Quantum Drive Arrived ...> ... | SHIP_id[id]|CSCItemNavigation::OnQuantumDriveArrived| ...
const RE_QT_ARR = /<Quantum Drive Arrived[^>]*>.*?\|\s*([A-Z]{3,5}_[A-Za-z0-9_]+?)_\d+\[/;

// fuel-to-destination — names an actual destination
// ... requested fuel calculation to destination DEST ...
const RE_QT_DEST = /requested fuel calculation to destination\s+([A-Za-z0-9_\-]+)/;

// prettify a raw zone/ship token: strip trailing entity id, humanize known prefixes
const SHIP_PREFIX = { ANVL:'Anvil', AEGS:'Aegis', ORIG:'Origin', DRAK:'Drake', RSI:'RSI', MISC:'MISC', CRUS:'Crusader', ARGO:'Argo', CNOU:'Consolidated Outland', BANU:'Banu', VNCL:'Vanduul' };
function cleanShip(z) {
  if (!z) return null;
  const noId = z.replace(/_\d+$/, '');
  const m = noId.match(/^([A-Z]{3,5})_(.+)$/);
  if (m && SHIP_PREFIX[m[1]]) return `${SHIP_PREFIX[m[1]]} ${m[2].replace(/_/g, ' ')}`;
  return noId.replace(/_/g, ' ');
}

export function parseLocationLine(line) {
  const tsm = line.match(RE_TS);
  const ts = tsm ? tsm[1] : null;

  let m;
  if ((m = line.match(RE_LOC))) {
    return { type: 'location_update', ts, handle: m[1], location: m[2], kind: 'location' };
  }
  if ((m = line.match(RE_DEATH))) {
    return { type: 'location_update', ts, handle: m[1], location: cleanShip(m[2]), kind: 'death', ship: cleanShip(m[2]) };
  }
  if ((m = line.match(RE_QT_DEST))) {
    return { type: 'location_update', ts, handle: null, location: m[1], kind: 'travel_dest' };
  }
  if ((m = line.match(RE_QT_ARR))) {
    return { type: 'location_update', ts, handle: null, location: null, kind: 'arrived', ship: cleanShip(m[1]) };
  }
  return null;
}
