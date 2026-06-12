// De Fles — browserkant van de gedeelde state. TV en beheerscherm zijn aparte
// apparaten; de state leeft op de mini-server en wijzigingen komen live binnen
// via Server-Sent Events (met een poll als vangnet).

export function createStateClient() {
  const clientId = 'c' + Math.random().toString(36).slice(2, 10);
  let state = null;
  let saveTimer = null;
  let saving = false;

  async function load() {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error('state http ' + res.status);
    state = await res.json();
    return state;
  }

  async function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!state) return;
    saving = true;
    try {
      await fetch('/api/state?client=' + clientId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });
    } catch (e) { /* offline: volgende wijziging probeert het opnieuw */ }
    saving = false;
  }

  // Wijzig de state en sla (gebundeld, na 300 ms rust) op naar de server.
  function mutate(fn) {
    if (!state) return;
    fn(state);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 300);
  }

  // Roept cb aan bij wijzigingen van andere apparaten. Retourneert stopfunctie.
  function watch(cb) {
    let es = null;
    function open() {
      es = new EventSource('/api/events');
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.origin === clientId) return;       // eigen wijziging, al verwerkt
          if (saveTimer || saving) return;            // lokale niet-verzonden edits winnen
          state = msg.state;
          cb(state);
        } catch (e) { /* negeer kapot bericht */ }
      };
      // EventSource verbindt zelf opnieuw bij netwerkfouten.
    }
    open();
    const iv = setInterval(async () => {
      if (es && es.readyState === EventSource.OPEN) return;
      if (saveTimer || saving) return;
      try { cb(await load()); } catch (e) { /* server (nog) niet bereikbaar */ }
    }, 15000);
    return () => { if (es) es.close(); clearInterval(iv); };
  }

  return { clientId, load, mutate, flush, watch, get: () => state };
}
