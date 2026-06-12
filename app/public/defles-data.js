// De Fles — gedeelde datalaag: datamodel + alle externe API-koppelingen.
// State-synchronisatie met de mini-server zit in defles-sync.js; dit bestand
// wordt zowel door de browser (TV + beheer) als door de server (defaults) gebruikt.

export const DEFAULT_STATE = {
  variant: 'raster', // 'raster' | 'roterend'
  panelMode: 'auto', // 'auto' (vanzelf wisselen) | 'handmatig' (alleen met de afstandsbediening)
  welkom: 'welkom in',
  mededeling: 'Zondag 14 juni · Nederland – Japan · 22:00 op groot scherm',
  showMusic: true,
  music: { mode: 'handmatig', source: 'Spotify', track: 'Viva Hollandia', artist: 'Wolter Kroes', volumioHost: 'volumio.local', spotifyClientId: '' },
  // Spotify-tokens horen in de gedeelde state: het beheerscherm logt in, de TV
  // (een ander apparaat) leest ze om "nu speelt" op te halen.
  spotifyAuth: null,
  weatherPlace: { name: 'Utrecht', lat: 52.09, lon: 5.12 },
  taps: [
    { id: 't1', name: 'Hertog Jan', style: 'Pilsener · 5,1%', price: '2,80', level: 78, onTap: true },
    { id: 't2', name: 'La Chouffe', style: 'Blond · 8,0%', price: '4,50', level: 52, onTap: true },
    { id: 't3', name: 'La Trappe Tripel', style: 'Tripel · 8,0%', price: '4,20', level: 64, onTap: true }
  ],
  stock: [
    { id: 's1', name: 'Westmalle Dubbel', cat: 'Bier', qty: 12 },
    { id: 's2', name: 'Orval', cat: 'Bier', qty: 6 },
    { id: 's3', name: 'Liefmans Fruitesse', cat: 'Bier', qty: 8 },
    { id: 's4', name: 'Coca-Cola', cat: 'Fris', qty: 24 },
    { id: 's5', name: 'Spa Rood', cat: 'Fris', qty: 18 },
    { id: 's6', name: 'Rioja Crianza', cat: 'Wijn', qty: 4 },
    { id: 's7', name: 'Ketel 1', cat: 'Sterk', qty: 2 },
    { id: 's8', name: 'Jameson', cat: 'Sterk', qty: 1 }
  ],
  photos: [
    { id: 'p1', src: 'https://picsum.photos/seed/defles-a/1400/900', caption: 'Demo-foto — vervang via het beheerscherm' },
    { id: 'p2', src: 'https://picsum.photos/seed/defles-b/1400/900', caption: 'Demo-foto — vervang via het beheerscherm' },
    { id: 'p3', src: 'https://picsum.photos/seed/defles-c/1400/900', caption: 'Demo-foto — vervang via het beheerscherm' }
  ],
  theme: {
    enabled: true,
    title: 'WK 2026',
    sub: 'Groep F · Oranje',
    emblem: null, // eigen embleem/watermerk (transparante PNG); leeg = ingebouwde leeuw
    api: { key: '123', league: '4429', season: '2026', team: 'Netherlands' },
    lastSync: 0,
    matches: [
      { id: 'm1', date: '2026-06-14', time: '22:00', home: 'Nederland', away: 'Japan', score: '' },
      { id: 'm2', date: '2026-06-20', time: '19:00', home: 'Nederland', away: 'Zweden', score: '' },
      { id: 'm3', date: '2026-06-26', time: '01:00', home: 'Tunesië', away: 'Nederland', score: '' }
    ],
    standings: [
      { team: 'Nederland', g: 0, pts: 0 },
      { team: 'Japan', g: 0, pts: 0 },
      { team: 'Zweden', g: 0, pts: 0 },
      { team: 'Tunesië', g: 0, pts: 0 }
    ]
  }
};

// Ingebouwde leeuw (heraldisch, rampant) — opgebouwd uit vormen met een
// gekartelde manen-ring. Wordt diapositief oranje getoond achter het Oranje-paneel.
function maneStarPath(cx, cy, outer, inner, points) {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / points - Math.PI / 2;
    d += (i ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1);
  }
  return d + 'Z';
}
export const LION_SVG =
  '<svg viewBox="0 0 240 280" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%;">' +
    '<g fill="#f4a259" stroke="#f4a259" stroke-linejoin="round" stroke-linecap="round">' +
      '<path fill="none" stroke-width="15" d="M176 150 C212 150 226 108 214 76 C209 62 196 57 188 66"/>' +
      '<circle cx="187" cy="63" r="12"/>' +
      '<ellipse cx="158" cy="168" rx="45" ry="52"/>' +
      '<rect x="134" y="188" width="30" height="74" rx="15"/>' +
      '<ellipse cx="150" cy="262" rx="19" ry="11"/>' +
      '<g transform="rotate(-16 118 132)"><ellipse cx="118" cy="132" rx="45" ry="60"/></g>' +
      '<path fill="none" stroke-width="25" d="M104 112 72 170"/>' +
      '<path fill="none" stroke-width="22" d="M122 120 102 184"/>' +
      '<ellipse cx="68" cy="176" rx="17" ry="11"/>' +
      '<ellipse cx="99" cy="190" rx="16" ry="11"/>' +
      '<path d="' + maneStarPath(74, 66, 53, 39, 13) + '"/>' +
      '<circle cx="72" cy="64" r="30"/>' +
      '<circle cx="53" cy="37" r="11"/>' +
      '<circle cx="92" cy="38" r="10"/>' +
      '<ellipse cx="43" cy="76" rx="20" ry="15"/>' +
    '</g>' +
  '</svg>';

export function deepMerge(def, val) {
  if (Array.isArray(def)) return Array.isArray(val) ? val : def;
  if (def && typeof def === 'object') {
    const out = {};
    for (const k of Object.keys(def)) out[k] = val && k in val ? deepMerge(def[k], val[k]) : structuredClone(def[k]);
    return out;
  }
  return val === undefined ? def : val;
}

// Open-Meteo weercodes -> Nederlandse omschrijving + icoonsoort
export function weatherInfo(code) {
  const map = [
    [[0], 'Onbewolkt', 'sun'],
    [[1], 'Vrijwel onbewolkt', 'sun'],
    [[2], 'Half bewolkt', 'suncloud'],
    [[3], 'Bewolkt', 'cloud'],
    [[45, 48], 'Mist', 'fog'],
    [[51, 53, 55, 56, 57], 'Motregen', 'rain'],
    [[61, 63, 65, 66, 67], 'Regen', 'rain'],
    [[71, 73, 75, 77], 'Sneeuw', 'snow'],
    [[80, 81, 82], 'Buien', 'rain'],
    [[85, 86], 'Sneeuwbuien', 'snow'],
    [[95, 96, 99], 'Onweer', 'storm']
  ];
  for (const [codes, label, kind] of map) if (codes.includes(code)) return { label, kind };
  return { label: 'Weer', kind: 'cloud' };
}

export async function fetchWeather(place) {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + place.lat +
    '&longitude=' + place.lon + '&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe%2FAmsterdam';
  const res = await fetch(url);
  if (!res.ok) throw new Error('weather http ' + res.status);
  const j = await res.json();
  const cur = j.current || {};
  return {
    temp: Math.round(cur.temperature_2m),
    wind: Math.round(cur.wind_speed_10m),
    ...weatherInfo(cur.weather_code)
  };
}

export async function geocodePlace(name) {
  const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(name) + '&count=1&language=nl';
  const res = await fetch(url);
  if (!res.ok) throw new Error('geo http ' + res.status);
  const j = await res.json();
  const hit = (j.results || [])[0];
  if (!hit) return null;
  return { name: hit.name, lat: hit.latitude, lon: hit.longitude };
}

export function formatDateNL(d) {
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

export function formatMatchDateNL(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d)) return dateStr || '';
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(/\./g, '');
}

export function uid() { return 'x' + Math.random().toString(36).slice(2, 9); }

// ---- WK-schema via TheSportsDB (gratis sleutel: 123, WK = competitie 4429) ----
const TEAM_NL = {
  'Netherlands': 'Nederland', 'Sweden': 'Zweden', 'Tunisia': 'Tunesië', 'Japan': 'Japan',
  'Germany': 'Duitsland', 'Belgium': 'België', 'France': 'Frankrijk', 'Spain': 'Spanje',
  'England': 'Engeland', 'Croatia': 'Kroatië', 'Italy': 'Italië', 'Argentina': 'Argentinië',
  'Brazil': 'Brazilië', 'Morocco': 'Marokko', 'United States': 'Verenigde Staten', 'USA': 'Verenigde Staten',
  'Switzerland': 'Zwitserland', 'Austria': 'Oostenrijk', 'Denmark': 'Denemarken', 'Norway': 'Noorwegen',
  'Poland': 'Polen', 'Turkey': 'Turkije', 'Greece': 'Griekenland', 'Egypt': 'Egypte',
  'Ivory Coast': 'Ivoorkust', 'South Korea': 'Zuid-Korea', 'Saudi Arabia': 'Saoedi-Arabië',
  'New Zealand': 'Nieuw-Zeeland', 'Uzbekistan': 'Oezbekistan', 'Cape Verde': 'Kaapverdië',
  'Iraq': 'Irak', 'Curacao': 'Curaçao', 'Haiti': 'Haïti', 'Scotland': 'Schotland',
  'Bosnia and Herzegovina': 'Bosnië en Herzegovina', 'Jordan': 'Jordanië', 'Australia': 'Australië',
  'South Africa': 'Zuid-Afrika', 'Hungary': 'Hongarije', 'Czech Republic': 'Tsjechië'
};
export function teamNameNL(name) { return TEAM_NL[name] || name; }

export async function fetchWkSchedule(api) {
  const key = ((api && api.key) || '123').trim();
  const league = ((api && api.league) || '4429').trim();
  const season = ((api && api.season) || '2026').trim();
  const team = ((api && api.team) || '').trim().toLowerCase();
  const base = 'https://www.thesportsdb.com/api/v1/json/' + encodeURIComponent(key);
  async function getJson(path) {
    const res = await fetch(base + path);
    if (!res.ok) throw new Error('api http ' + res.status);
    return res.json();
  }
  let events = [];
  try {
    const j = await getJson('/eventsseason.php?id=' + league + '&s=' + season);
    events = j.events || [];
  } catch (e) { /* probeer fallback hieronder */ }
  if (!events.length) {
    const pastJ = await getJson('/eventspastleague.php?id=' + league).catch(() => ({}));
    const nextJ = await getJson('/eventsnextleague.php?id=' + league).catch(() => ({}));
    events = [...(pastJ.events || []), ...(nextJ.events || [])];
  }
  const norm = events.map((e) => {
    let dt = null;
    if (e.strTimestamp) dt = new Date(e.strTimestamp + (/Z|[+-]\d\d:?\d\d$/.test(e.strTimestamp) ? '' : 'Z'));
    else if (e.dateEvent) dt = new Date(e.dateEvent + 'T' + (e.strTime || '12:00:00') + 'Z');
    if (dt && isNaN(dt)) dt = null;
    const played = e.intHomeScore !== null && e.intHomeScore !== undefined && e.intHomeScore !== '';
    return {
      id: e.idEvent, dt,
      date: dt ? dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0') : (e.dateEvent || ''),
      time: dt ? dt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : (e.strTime || '').slice(0, 5),
      home: teamNameNL(e.strHomeTeam || ''), away: teamNameNL(e.strAwayTeam || ''),
      rawHome: (e.strHomeTeam || '').toLowerCase(), rawAway: (e.strAwayTeam || '').toLowerCase(),
      score: played ? e.intHomeScore + ' – ' + e.intAwayScore : ''
    };
  }).filter((m) => m.home && m.away);
  let filtered = norm;
  if (team) {
    filtered = norm.filter((m) =>
      m.rawHome.includes(team) || m.rawAway.includes(team) ||
      m.home.toLowerCase().includes(team) || m.away.toLowerCase().includes(team));
  }
  filtered.sort((a, b) => (a.dt ? a.dt.getTime() : 0) - (b.dt ? b.dt.getTime() : 0));
  const now = Date.now();
  const played = filtered.filter((m) => m.score || (m.dt && m.dt.getTime() < now - 3 * 3600000));
  const upcoming = filtered.filter((m) => played.indexOf(m) === -1);
  const matches = [...played.slice(-2), ...upcoming].slice(0, 8)
    .map((m) => ({ id: m.id, date: m.date, time: m.time, home: m.home, away: m.away, score: m.score }));

  // Stand: groep van het gekozen team (indien beschikbaar in de API)
  let standings = [];
  try {
    const tj = await getJson('/lookuptable.php?l=' + league + '&s=' + season);
    const rows = (tj.table || []).map((r) => ({
      team: teamNameNL(r.strTeam || r.name || ''),
      raw: (r.strTeam || r.name || '').toLowerCase(),
      g: Number((r.intPlayed != null ? r.intPlayed : r.played) || 0),
      pts: Number((r.intPoints != null ? r.intPoints : r.points) || 0),
      group: r.strGroup || r.strDivision || r.intDivision || ''
    })).filter((r) => r.team);
    if (team) {
      const mine = rows.find((r) => r.raw.includes(team) || r.team.toLowerCase().includes(team));
      standings = mine && mine.group !== '' ? rows.filter((r) => r.group === mine.group) : (mine ? [mine] : []);
    } else {
      standings = rows.slice(0, 8);
    }
    standings = standings.slice(0, 8).map((r) => ({ team: r.team, g: r.g, pts: r.pts }));
  } catch (e) { /* geen stand beschikbaar (bekerfase) */ }
  return { matches, standings };
}

// ---- Bierlogo's: automatisch opgezocht via Wikipedia, met cache in localStorage ----
const LOGO_CACHE_KEY = 'defles-beer-logos-v1';
function logoCache() {
  try { return JSON.parse(localStorage.getItem(LOGO_CACHE_KEY) || '{}'); } catch (e) { return {}; }
}
export async function fetchBeerLogo(name) {
  const key = (name || '').trim().toLowerCase();
  if (!key) return null;
  const cache = logoCache();
  if (key in cache) return cache[key];
  async function tryWiki(lang, search) {
    const url = 'https://' + lang + '.wikipedia.org/w/api.php?action=query&format=json&origin=*' +
      '&prop=pageimages&piprop=thumbnail&pithumbsize=320&generator=search&gsrlimit=1&gsrsearch=' +
      encodeURIComponent(search);
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    const pages = (j.query && j.query.pages) || {};
    const first = Object.values(pages)[0];
    return first && first.thumbnail ? first.thumbnail.source : null;
  }
  let src = null;
  try { src = await tryWiki('nl', name + ' bier'); } catch (e) { /* offline */ }
  if (!src) { try { src = await tryWiki('en', name + ' beer'); } catch (e) { /* offline */ } }
  const c = logoCache();
  c[key] = src;
  try { localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(c)); } catch (e) { /* quota */ }
  return src;
}

// ---- Volumio — via de server-proxy (/api/volumio), want Volumio stuurt geen
// CORS-headers en de TV-browser mag het apparaat dan niet rechtstreeks bevragen.
export async function fetchVolumioState(host) {
  const h = (host || '').trim();
  if (!h) throw new Error('geen host');
  const res = await fetch('/api/volumio?host=' + encodeURIComponent(h), { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error('volumio http ' + res.status);
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return { track: j.track || '', artist: j.artist || '', playing: !!j.playing };
}

// ---- Spotify (PKCE-login met eigen client-id, geen secret nodig) ----
// De tokens leven in de gedeelde state (state.spotifyAuth): het beheerscherm
// verbindt, de TV gebruikt en ververst ze. Alleen de PKCE-verifier blijft
// lokaal, die is enkel nodig op het apparaat dat de login start.
const SPOTIFY_PKCE_KEY = 'defles-spotify-pkce';

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function spotifyRedirectUri() {
  return location.origin + location.pathname;
}

export async function spotifyLogin(clientId) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = b64url(new Uint8Array(digest));
  localStorage.setItem(SPOTIFY_PKCE_KEY, JSON.stringify({ verifier, clientId }));
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: spotifyRedirectUri(),
    scope: 'user-read-currently-playing user-read-playback-state',
    code_challenge_method: 'S256',
    code_challenge: challenge
  });
  location.href = 'https://accounts.spotify.com/authorize?' + params.toString();
}

async function spotifyTokenRequest(body) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  });
  if (!res.ok) throw new Error('spotify token http ' + res.status);
  return res.json();
}

// Vangt de ?code= terugkeer van Spotify op; geeft het auth-object terug
// (om in de gedeelde state te bewaren) of null.
export async function spotifyHandleRedirect() {
  const code = new URLSearchParams(location.search).get('code');
  if (!code) return null;
  let pkce = null;
  try { pkce = JSON.parse(localStorage.getItem(SPOTIFY_PKCE_KEY) || 'null'); } catch (e) { /* leeg */ }
  history.replaceState(null, '', spotifyRedirectUri());
  if (!pkce) return null;
  const j = await spotifyTokenRequest({
    grant_type: 'authorization_code', code,
    redirect_uri: spotifyRedirectUri(),
    client_id: pkce.clientId, code_verifier: pkce.verifier
  });
  localStorage.removeItem(SPOTIFY_PKCE_KEY);
  return {
    access_token: j.access_token, refresh_token: j.refresh_token,
    expires_at: Date.now() + (j.expires_in || 3600) * 1000, clientId: pkce.clientId
  };
}

// Geeft een geldig access-token; ververst stil indien (bijna) verlopen en
// meldt het nieuwe auth-object via onUpdate zodat het in de state belandt.
export async function spotifyFreshToken(auth, onUpdate) {
  if (!auth || !auth.refresh_token) return null;
  if (Date.now() < auth.expires_at - 30000) return auth.access_token;
  const j = await spotifyTokenRequest({
    grant_type: 'refresh_token', refresh_token: auth.refresh_token, client_id: auth.clientId
  });
  const next = {
    ...auth,
    access_token: j.access_token,
    refresh_token: j.refresh_token || auth.refresh_token,
    expires_at: Date.now() + (j.expires_in || 3600) * 1000
  };
  if (onUpdate) onUpdate(next);
  return next.access_token;
}

export async function fetchSpotifyNowPlaying(auth, onUpdate) {
  const token = await spotifyFreshToken(auth, onUpdate);
  if (!token) return null;
  const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (res.status === 204) return { track: '', artist: '', playing: false };
  if (!res.ok) throw new Error('spotify http ' + res.status);
  const j = await res.json();
  return {
    track: j.item ? j.item.name : '',
    artist: j.item && j.item.artists ? j.item.artists.map((a) => a.name).join(', ') : '',
    playing: !!j.is_playing
  };
}
