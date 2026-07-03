export class IngestClient {
  constructor({ endpoint, token, fetchImpl = globalThis.fetch, maxBatch = 100, maxRetries = 5, onDeadLetter = null } = {}) {
    this.endpoint = endpoint; this.token = token; this.fetch = fetchImpl; this.maxBatch = maxBatch;
    this.queue = [];
    this.lastSuccessAt = null; this.lastStatus = 'idle';
    // resilience state
    this.maxRetries = maxRetries;          // consecutive failures of the head batch before dead-lettering
    this.failStreak = 0;                   // consecutive failures (drives backoff)
    this.backoffUntil = 0;                 // epoch ms; flush is a no-op until then
    this.deadLetter = [];                  // batches set aside after repeated failure
    this.onDeadLetter = onDeadLetter;      // callback(events, reason) so the UI can surface "N couldn't sync"
  }
  enqueue(ev) { if (ev) this.queue.push(ev); }
  enqueueAll(evts) { for (const e of evts || []) this.enqueue(e); }
  get pending() { return this.queue.length; }
  health() {
    return {
      pending: this.queue.length, lastSuccessAt: this.lastSuccessAt, status: this.lastStatus,
      failStreak: this.failStreak, deadLettered: this.deadLetter.length,
      backingOff: Date.now() < this.backoffUntil,
    };
  }
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
  async drainAll(max = 100) {
    let total = 0;
    for (let i = 0; i < max && this.queue.length; i++) {
      const r = await this.flush();
      if (!r.ok) return { sent: total, ok: false, reason: r.reason, status: r.status };
      total += r.sent || 0;
      if (!r.sent) break;
    }
    return { sent: total, ok: true };
  }

  // Backoff schedule: 1s, 2s, 4s, 8s, ... capped at 60s.
  _armBackoff() {
    const delay = Math.min(60000, 1000 * Math.pow(2, Math.max(0, this.failStreak - 1)));
    this.backoffUntil = Date.now() + delay;
  }
  _deadLetter(batch, reason) {
    this.queue.splice(0, batch.length);           // remove the poison batch from the head
    this.deadLetter.push({ events: batch, reason, at: Date.now() });
    this.failStreak = 0; this.backoffUntil = 0;    // pipe is unblocked; resume with the rest
    this.lastStatus = 'dead-letter';
    if (this.onDeadLetter) { try { this.onDeadLetter(batch, reason); } catch {} }
  }

  async flush() {
    if (!this.queue.length) return { sent: 0, ok: true };
    if (!this.endpoint || !this.token) { this.lastStatus = 'unconfigured'; return { sent: 0, ok: false, reason: 'unconfigured' }; }
    // honor backoff so a failing batch doesn't hammer every 5s
    if (Date.now() < this.backoffUntil) { this.lastStatus = 'backoff'; return { sent: 0, ok: false, reason: 'backoff' }; }

    // On 413, shrink the batch and retry halves instead of looping forever on an oversize body.
    const size = (this._forceBatch && this._forceBatch > 0) ? Math.min(this._forceBatch, this.queue.length) : this.maxBatch;
    const batch = this.queue.slice(0, size);

    let res;
    try { res = await this.fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }, body: JSON.stringify({ events: batch }) }); }
    catch (e) { this.failStreak++; this._armBackoff(); this.lastStatus = 'offline'; return { sent: 0, ok: false, reason: 'network', error: e.message }; }

    // 401: auth problem. Do NOT nuke the queue — keep events, mark unauthorized, back off.
    // (A transiently bad token during a big catch-up must not silently discard everything queued.)
    if (res.status === 401) { this.failStreak++; this._armBackoff(); this.lastStatus = 'unauthorized'; return { sent: 0, ok: false, reason: 'unauthorized' }; }

    // 413 Payload Too Large: split. If we're already at 1 event and still 413, it's un-sendable -> dead-letter it.
    if (res.status === 413) {
      if (batch.length <= 1) { this._deadLetter(batch, 'payload-too-large'); return { sent: 0, ok: false, reason: 'too-large-dead-lettered' }; }
      this._forceBatch = Math.max(1, Math.floor(batch.length / 2));
      this.lastStatus = 'splitting';
      return { sent: 0, ok: false, reason: 'split-413', nextBatch: this._forceBatch };
    }

    if (!res.ok) {
      this.failStreak++;
      // After maxRetries consecutive failures of the head batch, set it aside so it can't dam the pipe.
      if (this.failStreak >= this.maxRetries) { this._deadLetter(batch, `http-${res.status}`); return { sent: 0, ok: false, reason: 'dead-lettered', status: res.status }; }
      this._armBackoff();
      this.lastStatus = 'http';
      return { sent: 0, ok: false, reason: 'http', status: res.status };
    }

    // success
    this.queue.splice(0, batch.length);
    this._forceBatch = 0; this.failStreak = 0; this.backoffUntil = 0;
    this.lastSuccessAt = Date.now(); this.lastStatus = 'ok';
    let body = {}; try { body = await res.json(); } catch {}
    return { sent: batch.length, ok: true, body };
  }
}
