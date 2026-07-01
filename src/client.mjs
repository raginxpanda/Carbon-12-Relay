export class IngestClient {
  constructor({ endpoint, token, fetchImpl = globalThis.fetch, maxBatch = 100 } = {}) {
    this.endpoint = endpoint; this.token = token; this.fetch = fetchImpl; this.maxBatch = maxBatch; this.queue = [];
    this.lastSuccessAt = null; this.lastStatus = 'idle';
  }
  enqueue(ev) { if (ev) this.queue.push(ev); }
  enqueueAll(evts) { for (const e of evts || []) this.enqueue(e); }
  get pending() { return this.queue.length; }
  health() { return { pending: this.queue.length, lastSuccessAt: this.lastSuccessAt, status: this.lastStatus }; }
  whoamiUrl() { return this.endpoint ? this.endpoint.replace(/\/ingest(\/?)$/, '/whoami$1') : null; }
  async whoami() {
    const url = this.whoamiUrl();
    if (!url || !this.token) return { ok: false, reason: 'unconfigured' };
    let res;
    try { res = await this.fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${this.token}` } }); }
    catch (e) { return { ok: false, reason: 'network', error: e.message }; }
    if (res.status === 401) return { ok: false, reason: 'unauthorized' };
    if (!res.ok) return { ok: false, reason: 'http', status: res.status };
    let body = {}; try { body = await res.json(); } catch {}
    return { ok: true, ...body };
  }
  haulUrl() { return this.endpoint ? this.endpoint.replace(/\/ingest(\/?)$/, '/haul$1') : null; }
  async haul() {
    const url = this.haulUrl();
    if (!url || !this.token) return { ok: false, reason: 'unconfigured' };
    let res;
    try { res = await this.fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${this.token}` } }); }
    catch (e) { return { ok: false, reason: 'network', error: e.message }; }
    if (res.status === 401) return { ok: false, reason: 'unauthorized' };
    if (!res.ok) return { ok: false, reason: 'http', status: res.status };
    let body = {}; try { body = await res.json(); } catch {}
    return { ok: true, ...body };
  }
  async flush() {
    if (!this.queue.length) return { sent: 0, ok: true };
    if (!this.endpoint || !this.token) { this.lastStatus = 'unconfigured'; return { sent: 0, ok: false, reason: 'unconfigured' }; }
    const batch = this.queue.slice(0, this.maxBatch);
    let res;
    try { res = await this.fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }, body: JSON.stringify({ events: batch }) }); }
    catch (e) { this.lastStatus = 'offline'; return { sent: 0, ok: false, reason: 'network', error: e.message }; }
    if (res.status === 401) { this.queue = []; this.lastStatus = 'unauthorized'; return { sent: 0, ok: false, reason: 'unauthorized' }; }
    if (!res.ok) { this.lastStatus = 'http'; return { sent: 0, ok: false, reason: 'http', status: res.status }; }
    this.queue.splice(0, batch.length);
    this.lastSuccessAt = Date.now(); this.lastStatus = 'ok';
    let body = {}; try { body = await res.json(); } catch {}
    return { sent: batch.length, ok: true, body };
  }
}
