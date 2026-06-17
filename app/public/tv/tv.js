// De Fles — TV-krijtbord (1920×1080, geschaald naar het venster).
// Pixelgetrouwe omzetting van het ontwerp; state komt live van de mini-server.

import * as D from '../defles-data.js';
import { createStateClient } from '../defles-sync.js';

const client = createStateClient();
const board = document.getElementById('board');
const frame = document.getElementById('frame');

const app = {
  data: null, weather: null, liveMusic: null,
  photoIdx: 0, panelIdx: 0, middenIdx: 0,
  logos: {}, wkAll: null, radioData: null, radioKey: '',
  lastPlace: '', nextKey: ''
};

try {
  const cached = JSON.parse(localStorage.getItem('defles-wk-all-v1') || 'null');
  if (cached && cached.length) app.wkAll = cached;
} catch (e) { /* leeg */ }

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mod = (i, n) => (n > 0 ? ((i % n) + n) % n : 0);

// ---------- bouwstenen ----------

function weatherSvg(kind, size) {
  const cloud = 'M7 18 a4.2 4.2 0 1 1 .8-8.3 A5 5 0 0 1 17.5 11 A3.5 3.5 0 0 1 17 18 Z';
  let inner;
  if (kind === 'sun') inner = '<circle cx="12" cy="12" r="4.4"/><path d="M12 2.5v2.6 M12 18.9v2.6 M2.5 12h2.6 M18.9 12h2.6 M5 5l1.8 1.8 M17.2 17.2 19 19 M19 5l-1.8 1.8 M6.8 17.2 5 19"/>';
  else if (kind === 'suncloud') inner = '<circle cx="16.5" cy="7.5" r="3"/><path d="M16.5 1.8v1.5 M22.2 7.5h-1.5 M20.5 3.5l-1.1 1.1"/><path d="M6.5 20 a4 4 0 1 1 .8-7.9 A4.6 4.6 0 0 1 16 13.6 A3.2 3.2 0 0 1 15.5 20 Z"/>';
  else if (kind === 'rain') inner = '<path d="' + cloud + '"/><path d="M8.5 20.5l.8-1.6 M12 21.5l.8-1.6 M15.5 20.5l.8-1.6"/>';
  else if (kind === 'snow') inner = '<path d="' + cloud + '"/><path d="M9 20.3h.01 M12.5 21.3h.01 M16 20.3h.01"/>';
  else if (kind === 'storm') inner = '<path d="' + cloud + '"/><path d="M12.5 18.6 10.8 21.4h2.4l-1.7 2.8"/>';
  else if (kind === 'fog') inner = '<path d="M4 9h14 M3 13h18 M5 17h14"/>';
  else inner = '<path d="' + cloud + '"/>';
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
}

function eqHtml(height, barWidth, color) {
  let bars = '';
  for (let i = 0; i < 4; i++) {
    bars += '<div style="width: ' + barWidth + 'px; height: 100%; border-radius: ' + (barWidth / 1.5).toFixed(2) + 'px; background: ' + color +
      '; transform-origin: bottom; animation: defles-eq ' + (0.7 + i * 0.13).toFixed(2) + 's ease-in-out ' + (i * 0.12).toFixed(2) + 's infinite alternate;"></div>';
  }
  return '<div style="display: flex; gap: ' + (barWidth * 0.8).toFixed(2) + 'px; align-items: flex-end; height: ' + height + 'px;">' + bars + '</div>';
}

function dotsHtml(count, active, palette) {
  const colors = palette === 'light'
    ? { on: '#c2540a', off: 'rgba(74,67,55,0.3)' }
    : { on: '#f4a259', off: 'rgba(242,236,220,0.35)' };
  let kids = '';
  for (let i = 0; i < count; i++) {
    kids += '<div style="width: ' + (i === active ? 26 : 9) + 'px; height: 9px; border-radius: 999px; background: ' +
      (i === active ? colors.on : colors.off) + '; transition: all 0.4s ease;"></div>';
  }
  return '<div style="display: flex; gap: 6px; align-items: center;">' + kids + '</div>';
}

// ---------- afleidingen (zoals renderVals in het ontwerp) ----------

function fmtTime(d) { return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }); }

function deriveTheme(d, now) {
  const theme = d.theme || {};
  const parsed = (theme.matches || []).map((m) => ({ ...m, dt: new Date(m.date + 'T' + (m.time || '12:00') + ':00') }));
  const next = parsed.filter((m) => m.dt > now && !m.score).sort((a, b) => a.dt - b.dt)[0] || null;
  let countdownStr = '';
  if (next) {
    const diff = next.dt - now;
    const dDays = Math.floor(diff / 86400000);
    const dHrs = Math.floor((diff % 86400000) / 3600000);
    const dMin = Math.floor((diff % 3600000) / 60000);
    countdownStr = dDays > 0 ? 'over ' + dDays + 'd ' + dHrs + 'u' : (dHrs > 0 ? 'over ' + dHrs + 'u ' + dMin + 'm' : 'over ' + dMin + ' min');
  }
  // Programmalijst rolt mee met de tijd (laatste uitslag + komende) i.p.v. vast
  // op de eerste wedstrijd te blijven hangen.
  const matchRows = D.scheduleWindow(theme.matches || [], now.getTime(), 4).map((m) => ({
    when: D.formatMatchDateNL(m.date),
    teams: m.home + ' – ' + m.away,
    right: m.score ? m.score : m.time
  }));
  // Stand live uit de uitslagen berekenen i.p.v. te leunen op de (hier vaak lege) API-stand.
  const standingRows = D.computeStandings(theme.matches || [], theme.standings || []).map((s, i) => ({ pos: i + 1, team: s.team, g: s.g, pts: s.pts }));
  return {
    enabled: !!theme.enabled,
    titleCaps: (theme.title || '').toUpperCase(),
    sub: theme.sub || '',
    next, countdownStr, matchRows, standingRows,
    nextKey: next ? next.id + '|' + next.date + '|' + next.time : ''
  };
}

function deriveStock(d) {
  return (d.stock || []).filter((s) => s.on !== false).map((s) => {
    const low = Number(s.qty) <= 2;
    return { name: s.name, qty: s.qty, img: s.img || '', catCaps: (s.cat || '').toUpperCase(), chalkColor: low ? '#f4a259' : 'rgba(242,236,220,0.85)' };
  });
}

function deriveSnacks(d) {
  return (d.snacks || []).filter((s) => s.on !== false).map((s) => ({ name: s.name, img: s.img || '' }));
}

function stockThumbHtml(c, size) {
  if (!c.img) return '';
  return '<div style="width: ' + size + 'px; height: ' + size + 'px; flex-shrink: 0; border-radius: 50%; background: #faf6ec; overflow: hidden; box-shadow: 0 3px 8px rgba(0,0,0,0.3);"><img src="' + esc(c.img) + '" alt="" style="width: 100%; height: 100%; object-fit: cover;"></div>';
}

// Eén "naamregel" (koelkast/hapjes) op het bord
function itemLineHtml(c) {
  return '<div style="display: flex; align-items: center; gap: 10px; border-bottom: 2px dotted rgba(242,236,220,0.3); padding: 5px 2px;">' +
    stockThumbHtml(c, 30) +
    '<div style="font-size: 22px; color: rgba(242,236,220,0.92); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(c.name) + '</div>' +
  '</div>';
}

function deriveTaps(d) {
  return (d.taps || []).filter((t) => t.onTap !== false).map((t) => {
    const src = t.logo || app.logos[(t.name || '').trim().toLowerCase()] || '';
    return {
      name: t.name, style: t.style,
      priceStr: '€ ' + (t.price || '–'),
      levelPct: Math.max(0, Math.min(100, Number(t.level) || 0)) + '%',
      logoSrc: src,
      logoCover: !!t.logo, // eigen logo is al rond bijgesneden: laat het viltje vullen
      logoKey: (t.name || '').trim().toLowerCase(),
      initials: (t.name || '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    };
  });
}

// Middenvlak (raster): foto's afgewisseld met het volledige WK-speelschema
function deriveWkAll(d, now) {
  const theme = d.theme || {};
  const allRaw = (app.wkAll && app.wkAll.length ? app.wkAll : (theme.matches || []));
  const parsed = allRaw.map((m) => ({ ...m, dt: new Date(m.date + 'T' + (m.time || '12:00') + ':00') }));
  const upcoming = parsed.filter((m) => m.dt > now && !m.score).sort((a, b) => a.dt - b.dt);
  const next = upcoming[0] || null;
  let countdown = '';
  if (next) {
    const diff = next.dt - now;
    const dDays = Math.floor(diff / 86400000);
    const dHrs = Math.floor((diff % 86400000) / 3600000);
    const dMin = Math.floor((diff % 3600000) / 60000);
    countdown = dDays > 0 ? 'over ' + dDays + 'd ' + dHrs + 'u' : (dHrs > 0 ? 'over ' + dHrs + 'u ' + dMin + 'm' : 'over ' + dMin + ' min');
  }
  const rows = upcoming.slice(1, 5).map((m) => ({
    when: D.formatMatchDateNL(m.date),
    teams: m.home + ' – ' + m.away,
    time: m.time
  }));
  return { next, countdown, rows };
}

function radioOn(d) { return !!(d.radio && d.radio.enabled && d.radio.slug); }

// Eerstvolgende evenement met teller (blijft staan tot ~5u na aanvang)
function deriveNextEvent(d, now) {
  const parsed = (d.events || []).filter((e) => e.showOnTv !== false)
    .map((e) => ({ e, dt: e.whenISO ? new Date(e.whenISO) : null }))
    .filter((x) => x.dt && !isNaN(x.dt) && x.dt.getTime() > now.getTime() - 5 * 3600000)
    .sort((a, b) => a.dt - b.dt);
  if (!parsed.length) return null;
  const { e, dt } = parsed[0];
  const coming = (e.rsvps || []).filter((r) => r.status !== 'nee').reduce((n, r) => n + (Number(r.count) || 1), 0);
  const whenShort = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(dt).replace(/\./g, '');
  return { title: e.title, whenShort, coming };
}

// Oranje sticker-badge met het aantal aanmeldingen (op de "let op!"-plek).
function eventBadgeHtml(d) {
  const ev = deriveNextEvent(d, new Date());
  if (!ev) return '';
  return '<div data-event-badge style="background: #f4a259; color: #2c3e35; border-radius: 20px; padding: 12px 32px; display: flex; align-items: center; gap: 24px; max-width: 560px; box-shadow: 0 12px 30px rgba(0,0,0,0.42); transform: rotate(-2deg); transform-origin: center;">' +
    '<div style="text-align: center; flex-shrink: 0;">' +
      '<div style="font-size: 15px; letter-spacing: 0.2em; color: rgba(44,62,53,0.7); line-height: 1;">AANMELDINGEN</div>' +
      '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 92px; line-height: 0.8; color: #2c3e35;">' + esc(ev.coming) + '</div>' +
    '</div>' +
    '<div style="width: 2px; align-self: stretch; border-left: 2px dashed rgba(44,62,53,0.3);"></div>' +
    '<div style="min-width: 0;">' +
      '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 36px; line-height: 1; color: #2c3e35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(ev.title) + '</div>' +
      '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 22px; color: rgba(44,62,53,0.8); margin-top: 3px;">' + esc(ev.whenShort) + '</div>' +
    '</div>' +
  '</div>';
}

function midViewsFor(d, now) {
  const views = [];
  if ((d.photos || []).length > 0) views.push('photos');
  if (partyPhotos(d).length > 0) views.push('party');
  if (D.activeAlbum(d.albums, now.getTime())) views.push('albumqr');
  if (d.theme && d.theme.enabled && deriveWkAll(d, now).next) views.push('wk');
  if (radioOn(d)) views.push('radio');
  return views;
}

function logoCoasterHtml(t, size) {
  const initialsSize = Math.round(size * 0.46);
  const imgStyle = t.logoCover
    ? 'width: 100%; height: 100%; object-fit: cover;'
    : 'width: 80%; height: 80%; object-fit: contain;';
  const inner = t.logoSrc
    ? '<img src="' + esc(t.logoSrc) + '" alt="" style="' + imgStyle + '">'
    : '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: ' + initialsSize + 'px; line-height: 1; color: #2c3e35;">' + esc(t.initials) + '</div>';
  return '<div data-logo-for="' + esc(t.logoKey) + '" style="width: ' + size + 'px; height: ' + size + 'px; flex-shrink: 0; border-radius: 50%; background: #faf6ec; box-shadow: 0 ' + (size > 70 ? '6px 16px rgba(0,0,0,0.4)' : '5px 12px rgba(0,0,0,0.35)') + '; transform: rotate(-2deg); display: flex; align-items: center; justify-content: center; overflow: hidden;">' + inner + '</div>';
}

// ---------- embleem / watermerk (diapositief oranje) achter het Oranje-paneel ----------

function emblemWatermark(d, css) {
  const emblem = d.theme && d.theme.emblem;
  const inner = emblem
    ? '<div style="width: 100%; height: 100%; background: #f4a259; -webkit-mask: url(' + emblem + ') center/contain no-repeat; mask: url(' + emblem + ') center/contain no-repeat;"></div>'
    : D.LION_SVG;
  return '<div aria-hidden="true" style="position: absolute; ' + css + '; opacity: 0.13; z-index: 0; pointer-events: none;">' + inner + '</div>';
}

// Wat er in de muziek-pil hoort. null = pil helemaal verbergen:
// bij Volumio/Spotify alleen tonen als er ook écht iets speelt.
function musicView(d) {
  if (!d || !d.showMusic) return null;
  const mode = (d.music && d.music.mode) || 'handmatig';
  if (mode === 'handmatig') {
    return {
      track: d.music.track, artist: d.music.artist,
      sourceCaps: 'NU OP ' + (d.music.source || '').toUpperCase()
    };
  }
  const lm = app.liveMusic;
  return lm && lm.playing && lm.track ? lm : null;
}

function panelsFor(d) {
  const panels = [];
  if ((d.photos || []).length > 0) panels.push('photos');
  if (partyPhotos(d).length > 0) panels.push('party');
  if (D.activeAlbum(d.albums, Date.now())) panels.push('albumqr');
  panels.push('tap');
  if (d.theme && d.theme.enabled) panels.push('theme');
  if ((d.stock || []).length > 0) panels.push('stock');
  if (radioOn(d)) panels.push('radio');
  return panels;
}

// RetroHead — "papier op het bord"-poster met de zenderprogrammering
function radioPosterHtml(d) {
  const r = d.radio || {};
  const data = app.radioData;
  const name = (r.name || (data && data.name) || 'RetroHead').toUpperCase();
  const layers = data && data.logoLayers;
  // Het logo staat absoluut in de rechterbovenhoek (buiten de header-flow), zodat
  // de header compact blijft en het logo flink groot kan zonder lege ruimte.
  let logoInner = '';
  if (r.logo) {
    logoInner = '<div style="width: 100%; height: 100%; transform: rotate(2deg);"><img src="' + esc(r.logo) + '" alt="" style="width: 100%; height: 100%; object-fit: contain;"></div>';
  } else if (layers && layers.length) {
    logoInner = layers.map((l, idx) =>
      '<div style="position: absolute; left: 50%; top: 50%; width: ' + l.widthPct + '%; opacity: ' + l.opacity +
      '; z-index: ' + idx + '; transform: translate(calc(-50% + ' + l.xPct + '%), calc(-50% + ' + l.yPct + '%)) rotate(' + l.rotation + 'deg);">' +
        '<img src="' + esc(l.url) + '" alt="" style="width: 100%; height: auto; display: block;">' +
      '</div>').join('');
  } else if (data && data.logo) {
    logoInner = '<div style="width: 100%; height: 100%; transform: rotate(2deg);"><img src="' + esc(data.logo) + '" alt="" style="width: 100%; height: 100%; object-fit: contain;"></div>';
  }
  const logoHtml = logoInner
    ? '<div style="position: absolute; top: 20px; right: 30px; width: 200px; height: 200px; z-index: 5;">' + logoInner + '</div>'
    : '';
  let body;
  if (!data) {
    body = '<div style="flex: 1; display: flex; align-items: center; justify-content: center; font-family: \'Shadows Into Light Two\', cursive; font-size: 30px; color: rgba(74,67,55,0.6);">Programmering wordt geladen…</div>';
  } else {
    const accent = (data.now && data.now.color) || '#c2540a';
    const clipLine = data.clip
      ? '<div style="font-size: 18px; color: rgba(74,67,55,0.7); margin-top: 4px;">♪ ' + esc(data.clip.title) + (data.clip.artist ? ' — ' + esc(data.clip.artist) : '') + '</div>'
      : '';
    const nowBlock = data.now
      ? '<div style="border: 3px double rgba(194,84,10,0.55); border-radius: 10px; padding: 12px 22px; margin-top: 12px; flex-shrink: 0;">' +
          '<div style="display: flex; align-items: center; gap: 12px; padding-right: ' + (logoInner ? '180px' : '0') + ';">' +
            '<div style="width: 12px; height: 12px; border-radius: 999px; background: ' + accent + ';"></div>' +
            '<div style="font-size: 13px; letter-spacing: 0.26em; color: rgba(74,67,55,0.55);">NU OP DE BUIS</div>' +
            (data.now.start ? '<div style="margin-left: auto; font-size: 16px; color: rgba(74,67,55,0.6);">' + esc(data.now.start) + (data.now.end ? '–' + esc(data.now.end) : '') + '</div>' : '') +
          '</div>' +
          '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 46px; line-height: 1.05; color: #2c3e35; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(data.now.name) + '</div>' +
          clipLine +
        '</div>'
      : '';
    const rows = data.upcoming.length
      ? data.upcoming.map((u) => {
          const t = (u.startAt || '').slice(11, 16);
          const when = u.inMinutes != null ? (u.inMinutes < 60 ? 'over ' + u.inMinutes + ' min' : 'over ' + Math.floor(u.inMinutes / 60) + 'u ' + (u.inMinutes % 60) + 'm') : '';
          return '<div style="display: flex; align-items: baseline; gap: 18px; padding: 8px 4px; border-bottom: 2px dotted rgba(74,67,55,0.25);">' +
            '<div style="width: 64px; font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 30px; line-height: 1; color: ' + ((u.color) || '#c2540a') + '; flex-shrink: 0;">' + esc(t) + '</div>' +
            '<div style="flex: 1; font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 33px; line-height: 1; color: #2c3e35; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(u.name) + '</div>' +
            '<div style="font-size: 16px; color: rgba(74,67,55,0.6); flex-shrink: 0;">' + esc(when) + '</div>' +
          '</div>';
        }).join('')
      : '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 24px; color: rgba(74,67,55,0.55); padding: 14px 4px;">Geen verdere programmering bekend.</div>';
    body =
      nowBlock +
      '<div style="font-size: 13px; letter-spacing: 0.3em; color: rgba(74,67,55,0.5); margin: 14px 4px 2px;">STRAKS</div>' +
      '<div style="flex: 1; min-height: 0; overflow: hidden;">' + rows + '</div>';
  }
  return '<div style="width: 100%; height: 100%; min-height: 0; background: #faf6ec; padding: 24px 34px 22px; box-sizing: border-box; transform: rotate(-0.6deg); box-shadow: 0 10px 30px rgba(0,0,0,0.4); display: flex; flex-direction: column; position: relative;">' +
    '<div style="flex-shrink: 0; padding-right: 200px;">' +
      '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 26px; color: #c2540a; line-height: 1; transform: rotate(-1deg);">' + esc(r.sub || 'nu op de buis') + '</div>' +
      '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 60px; line-height: 1; letter-spacing: 0.08em; color: #2c3e35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(name) + '</div>' +
    '</div>' +
    '<div style="border-top: 3px dashed rgba(74,67,55,0.3); margin: 12px 0 4px; flex-shrink: 0;"></div>' +
    body +
    logoHtml +
    '<div style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%) rotate(2deg); width: 120px; height: 28px; background: rgba(242,236,220,0.45); box-shadow: 0 1px 3px rgba(0,0,0,0.15);"></div>' +
  '</div>';
}

// ---------- deel-templates ----------

function weatherHtml(big) {
  const w = app.weather;
  const d = app.data;
  if (!w) return '<div style="font-size: 17px; color: rgba(242,236,220,0.55);">Weerbericht wordt geladen…</div>';
  const icon = weatherSvg(w.kind, big ? 56 : 40);
  return '<div style="display: flex; align-items: center; gap: ' + (big ? 16 : 14) + 'px;">' +
    '<div style="color: #f4a259; display: flex;">' + icon + '</div>' +
    '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: ' + (big ? 66 : 56) + 'px; line-height: 1;">' + esc(w.temp) + '°</div>' +
    '<div style="min-width: 0;">' +
      '<div style="font-size: ' + (big ? 20 : 18) + 'px; color: #f2ecdc;">' + esc(w.label) + '</div>' +
      '<div style="font-size: ' + (big ? 16 : 15) + 'px; color: rgba(242,236,220,0.55);">' + esc(d.weatherPlace.name) + ' · wind ' + esc(w.wind) + ' km/u</div>' +
    '</div></div>';
}

function musicPillHtml(d, big) {
  const m = musicView(d);
  if (!m) return '';
  const eq = big ? eqHtml(44, 7, '#c2540a') : eqHtml(32, 5.5, '#c2540a');
  return '<div style="margin-left: auto; display: flex; align-items: center; gap: ' + (big ? 22 : 18) + 'px; background: #f2ecdc; border-radius: 999px; padding: ' + (big ? '16px 34px' : '13px 28px') + '; max-width: ' + (big ? 620 : 540) + 'px; box-shadow: 0 8px 22px rgba(0,0,0,0.35); transform: rotate(-0.6deg);">' +
    '<div>' + eq + '</div>' +
    '<div style="min-width: 0;">' +
      '<div data-music-track style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: ' + (big ? 44 : 36) + 'px; line-height: 0.95; color: #2c3e35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(m.track) + '</div>' +
      '<div style="display: flex; align-items: baseline; gap: ' + (big ? 14 : 12) + 'px; margin-top: 2px;">' +
        '<div data-music-artist style="font-family: \'Shadows Into Light Two\', cursive; font-size: ' + (big ? 26 : 22) + 'px; line-height: 1; color: #c2540a; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(m.artist) + '</div>' +
        '<div data-music-source style="font-size: 12px; letter-spacing: 0.24em; color: rgba(44,62,53,0.55); flex-shrink: 0;">' + esc(m.sourceCaps) + '</div>' +
      '</div></div></div>';
}

function topBarHtml(d, raster) {
  const now = new Date();
  const divider = '<div style="width: 2px; align-self: stretch; border-left: 2px dashed rgba(242,236,220,0.3);"></div>';
  const wordmark = raster
    ? '<div style="flex-shrink: 0;">' +
        '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 26px; color: #f4a259; line-height: 1; transform: rotate(-1.5deg);">' + esc(d.welkom) + '</div>' +
        '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 74px; line-height: 0.95; letter-spacing: 0.04em; color: #f2ecdc; text-shadow: 0 0 14px rgba(242,236,220,0.18);">DE FLES</div>' +
        '<div data-tagline style="font-size: 14px; letter-spacing: 0.4em; color: rgba(242,236,220,0.55); margin-top: 2px; height: 18px; overflow: hidden; white-space: nowrap; position: relative;">BAR · TUINHUIS</div>' +
      '</div>'
    : '<div style="flex-shrink: 0;">' +
        '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 25px; color: #f4a259; line-height: 1; transform: rotate(-1.5deg);">' + esc(d.welkom) + '</div>' +
        '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 70px; line-height: 0.95; letter-spacing: 0.04em; color: #f2ecdc; text-shadow: 0 0 14px rgba(242,236,220,0.18);">DE FLES</div>' +
      '</div>';
  const clock = raster
    ? '<div>' +
        '<div data-clock style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 86px; line-height: 0.9; color: #f2ecdc; text-shadow: 0 0 18px rgba(242,236,220,0.2);">' + fmtTime(now) + '</div>' +
        '<div data-date style="font-family: \'Shadows Into Light Two\', cursive; font-size: 24px; color: rgba(242,236,220,0.65); margin-top: 4px;">' + esc(D.formatDateNL(now)) + '</div>' +
      '</div>'
    : '<div>' +
        '<div data-clock style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 80px; line-height: 0.9; color: #f2ecdc;">' + fmtTime(now) + '</div>' +
        '<div data-date style="font-family: \'Shadows Into Light Two\', cursive; font-size: 22px; color: rgba(242,236,220,0.6);">' + esc(D.formatDateNL(now)) + '</div>' +
      '</div>';
  const mededeling = (d.mededeling || '').trim();
  const mededelingTop = raster && mededeling
    ? '<div style="border: 3px double rgba(244,162,89,0.75); border-radius: 12px; padding: 10px 20px; display: flex; align-items: center; gap: 16px; min-width: 0; max-width: 540px; transform: rotate(0.3deg);">' +
        '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 24px; color: #f4a259; flex-shrink: 0; transform: rotate(-2deg);">let op!</div>' +
        '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 30px; line-height: 1.05; color: #f2ecdc; text-wrap: pretty; max-height: 64px; overflow: hidden;">' + esc(mededeling) + '</div>' +
      '</div>'
    : '';
  // Middenstuk: de aanmeldingen-badge staat op de plek van "let op!"; is er geen
  // evenement, dan toont dat plekje de mededeling (raster).
  const middle = '<div data-badge-slot style="display: flex; min-width: 0;">' + (eventBadgeHtml(d) || mededelingTop) + '</div>';
  return '<div style="display: flex; align-items: center; gap: 34px; flex-shrink: 0;">' +
    wordmark + divider + clock + divider +
    '<div data-weather-slot style="display: flex; min-width: 0;">' + weatherHtml(raster) + '</div>' +
    middle +
    '<div data-music-slot style="margin-left: auto; display: flex; min-width: 0;">' + musicPillHtml(d, raster) + '</div>' +
  '</div>';
}

function polaroidShellHtml(src, caption, dots, raster, ns) {
  if (raster) {
    return '<div style="width: 100%; height: 100%; min-height: 0; background: #faf6ec; padding: 16px 16px 64px; box-sizing: border-box; transform: rotate(-1.2deg); box-shadow: 0 10px 30px rgba(0,0,0,0.4); display: flex; flex-direction: column; position: relative;">' +
      '<div style="flex: 1; min-height: 0; overflow: hidden; position: relative; background: #ddd6c6;">' +
        '<img data-' + ns + '-img src="' + esc(src) + '" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; animation: defles-fade 0.9s ease;">' +
      '</div>' +
      '<div style="position: absolute; left: 22px; right: 22px; bottom: 10px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">' +
        '<div data-' + ns + '-caption style="font-family: \'Shadows Into Light Two\', cursive; font-size: 27px; color: #4a4337; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(caption) + '</div>' +
        '<div data-' + ns + '-dots>' + dots + '</div>' +
      '</div>' +
      '<div style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%) rotate(2deg); width: 120px; height: 28px; background: rgba(242,236,220,0.45); box-shadow: 0 1px 3px rgba(0,0,0,0.15);"></div>' +
    '</div>';
  }
  return '<div style="height: 100%; aspect-ratio: 3 / 2.15; max-width: 100%; background: #faf6ec; padding: 14px 14px 56px; box-sizing: border-box; transform: rotate(-1deg); box-shadow: 0 12px 36px rgba(0,0,0,0.45); position: relative;">' +
    '<div style="width: 100%; height: 100%; overflow: hidden; position: relative; background: #ddd6c6;">' +
      '<img data-' + ns + '-img src="' + esc(src) + '" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;">' +
    '</div>' +
    '<div style="position: absolute; left: 20px; right: 20px; bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">' +
      '<div data-' + ns + '-caption style="font-family: \'Shadows Into Light Two\', cursive; font-size: 26px; color: #4a4337; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(caption) + '</div>' +
      '<div data-' + ns + '-dots>' + dots + '</div>' +
    '</div>' +
    '<div style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%) rotate(2deg); width: 110px; height: 26px; background: rgba(242,236,220,0.5); box-shadow: 0 1px 3px rgba(0,0,0,0.15);"></div>' +
  '</div>';
}

function polaroidHtml(d, raster) {
  const photos = d.photos || [];
  if (!photos.length) {
    return '<div style="width: 100%; height: 100%; border: 3px dashed rgba(242,236,220,0.3); border-radius: 12px; display: flex; align-items: center; justify-content: center; box-sizing: border-box;">' +
      '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 32px; color: rgba(242,236,220,0.55);">Nog geen foto’s — voeg ze toe via het beheerscherm</div></div>';
  }
  const p = photos[mod(app.photoIdx, photos.length)];
  const dots = dotsHtml(photos.length, mod(app.photoIdx, photos.length), 'light');
  return polaroidShellHtml(p.src, p.caption || '', dots, raster, 'photo');
}

function partyPhotos(d) {
  return ((d.party && d.party.photos) || []).slice(-40);
}

function partyCaption(p) {
  return p.name ? '— ' + p.name : '';
}

// Deelt bewust app.photoIdx met de curated foto's: elke tick stappen beide
// weergaven één vooruit (elk modulo de eigen lijstlengte).
function partyPolaroidHtml(d, raster) {
  const photos = partyPhotos(d);
  if (!photos.length) return '';
  const p = photos[mod(app.photoIdx, photos.length)];
  const caption = partyCaption(p);
  const dots = dotsHtml(photos.length, mod(app.photoIdx, photos.length), 'light');
  return polaroidShellHtml(p.src, caption, dots, raster, 'party');
}

// "Papier op het bord"-poster met de QR naar het album van de zojuist afgesloten
// avond. De QR komt server-side als SVG, dus dit is gewoon een <img> — geen QR-JS.
function albumQrPosterHtml(d) {
  const al = D.activeAlbum(d.albums, Date.now());
  if (!al) return '';
  return '<div style="width: 100%; height: 100%; min-height: 0; background: #faf6ec; padding: 26px 38px; box-sizing: border-box; transform: rotate(-0.8deg); box-shadow: 0 10px 30px rgba(0,0,0,0.4); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; position: relative; animation: defles-fade 0.9s ease;">' +
    '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 58px; line-height: 1; color: #2c3e35; text-align: center;">Foto’s van vanavond</div>' +
    '<img src="/api/album/' + esc(al.token) + '/qr.svg" alt="" style="width: 230px; height: 230px;">' +
    '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 30px; color: #c2540a;">scan om ze te bewaren</div>' +
    '<div style="font-size: 16px; color: rgba(74,67,55,0.55);">30 dagen beschikbaar</div>' +
    '<div style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%) rotate(-2deg); width: 120px; height: 28px; background: rgba(242,236,220,0.45); box-shadow: 0 1px 3px rgba(0,0,0,0.15);"></div>' +
  '</div>';
}

// ---------- variant A: vast raster ----------

// WK-poster in het middenvlak: zelfde "papier op het bord"-stijl als de polaroid
function wkPosterHtml(d, now) {
  const t = deriveTheme(d, now);
  const wk = deriveWkAll(d, now);
  if (!wk.next) return '';
  const rows = wk.rows.map((m) =>
    '<div style="display: flex; align-items: baseline; gap: 18px; padding: 8px 4px; border-bottom: 2px dotted rgba(74,67,55,0.25);">' +
      '<div style="width: 112px; font-size: 18px; color: rgba(74,67,55,0.6); flex-shrink: 0;">' + esc(m.when) + '</div>' +
      '<div style="flex: 1; font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 35px; line-height: 1; color: #2c3e35; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(m.teams) + '</div>' +
      '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 24px; color: #c2540a; flex-shrink: 0;">' + esc(m.time) + '</div>' +
    '</div>').join('');
  return '<div style="width: 100%; height: 100%; min-height: 0; background: #faf6ec; padding: 26px 38px 22px; box-sizing: border-box; transform: rotate(0.8deg); box-shadow: 0 10px 30px rgba(0,0,0,0.4); display: flex; flex-direction: column; position: relative; animation: defles-fade 0.9s ease;">' +
    '<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 18px; flex-shrink: 0;">' +
      '<div>' +
        '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 26px; color: #c2540a; line-height: 1; transform: rotate(-1deg);">eerstkomende wedstrijden</div>' +
        '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 62px; line-height: 1; letter-spacing: 0.1em; color: #2c3e35;">' + esc(t.titleCaps) + '</div>' +
      '</div>' +
      '<div style="font-size: 14px; letter-spacing: 0.3em; color: rgba(74,67,55,0.5); flex-shrink: 0;">SPEELSCHEMA</div>' +
    '</div>' +
    '<div style="border: 3px double rgba(194,84,10,0.55); border-radius: 10px; padding: 12px 22px; margin-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-shrink: 0;">' +
      '<div style="min-width: 0;">' +
        '<div style="font-size: 13px; letter-spacing: 0.26em; color: rgba(74,67,55,0.55);">NU EERST</div>' +
        '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 50px; line-height: 1; color: #2c3e35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(wk.next.home + ' – ' + wk.next.away) + '</div>' +
        '<div style="font-size: 17px; color: rgba(74,67,55,0.6); margin-top: 2px;">' + esc(D.formatMatchDateNL(wk.next.date) + ' · ' + wk.next.time + ' uur') + '</div>' +
      '</div>' +
      '<div data-countdown-wk style="font-family: \'Shadows Into Light Two\', cursive; font-size: 36px; color: #c2540a; white-space: nowrap; flex-shrink: 0;">' + esc(wk.countdown) + '</div>' +
    '</div>' +
    '<div style="flex: 1; min-height: 0; margin-top: 6px; overflow: hidden; display: flex; flex-direction: column;">' + rows + '</div>' +
    '<div style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%) rotate(-2deg); width: 120px; height: 28px; background: rgba(242,236,220,0.45); box-shadow: 0 1px 3px rgba(0,0,0,0.15);"></div>' +
  '</div>';
}

function midSlotHtml(d) {
  const now = new Date();
  const views = midViewsFor(d, now);
  if (!views.length) {
    return '<div style="width: 100%; height: 100%; border: 3px dashed rgba(242,236,220,0.3); border-radius: 12px; display: flex; align-items: center; justify-content: center; box-sizing: border-box;">' +
      '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 32px; color: rgba(242,236,220,0.55);">Nog geen foto’s — voeg ze toe via het beheerscherm</div></div>';
  }
  const active = views[mod(app.middenIdx, views.length)];
  if (active === 'wk') return wkPosterHtml(d, now);
  if (active === 'radio') return radioPosterHtml(d);
  if (active === 'party') return partyPolaroidHtml(d, true);
  if (active === 'albumqr') return albumQrPosterHtml(d);
  return polaroidHtml(d, true);
}

function rasterHtml(d) {
  const now = new Date();
  const t = deriveTheme(d, now);
  const taps = deriveTaps(d);
  const stock = deriveStock(d);
  const snacks = deriveSnacks(d);

  const stockRows = stock.map(itemLineHtml).join('');
  const snackRows = snacks.map(itemLineHtml).join('');

  // Eén bier op de tap: het viltje groot in de kop van de kaart i.p.v. klein per regel
  const singleTap = taps.length === 1 ? taps[0] : null;
  const tapRows = taps.map((tp) =>
    '<div style="padding: 12px 0; border-bottom: 1px solid rgba(242,236,220,0.12); display: flex; align-items: center; gap: 18px;">' +
      '<div style="flex: 1; min-width: 0;">' +
        '<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 14px;">' +
          '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 41px; line-height: 1; color: #f2ecdc; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(tp.name) + '</div>' +
          '<div style="flex: 1; border-bottom: 2px dotted rgba(242,236,220,0.3); transform: translateY(-7px); min-width: 20px;"></div>' +
          '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 33px; color: #f4a259; flex-shrink: 0;">' + esc(tp.priceStr) + '</div>' +
        '</div>' +
        '<div style="display: flex; align-items: center; gap: 14px; margin-top: 6px;">' +
          '<div style="font-size: 17px; color: rgba(242,236,220,0.55); flex-shrink: 0;">' + esc(tp.style) + '</div>' +
          '<div style="flex: 1; height: 6px; border-radius: 999px; background: rgba(242,236,220,0.15);">' +
            '<div style="height: 6px; border-radius: 999px; background: #f4a259; width: ' + tp.levelPct + ';"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      (singleTap ? '' : logoCoasterHtml(tp, 60)) +
    '</div>').join('');

  const matchRows = t.matchRows.map((m) =>
    '<div style="display: flex; align-items: center; gap: 14px; padding: 8px 2px; border-bottom: 1px dashed rgba(242,236,220,0.18);">' +
      '<div style="width: 92px; font-size: 16px; color: rgba(242,236,220,0.55); flex-shrink: 0;">' + esc(m.when) + '</div>' +
      '<div style="flex: 1; font-size: 20px; color: #f2ecdc; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(m.teams) + '</div>' +
      '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 28px; color: #f4a259;">' + esc(m.right) + '</div>' +
    '</div>').join('');

  const standingRows = t.standingRows.map((s) =>
    '<div style="display: flex; gap: 14px; align-items: center; padding: 4px 2px; font-size: 19px;">' +
      '<div style="width: 22px; color: rgba(242,236,220,0.5);">' + s.pos + '</div>' +
      '<div style="flex: 1; color: #f2ecdc;">' + esc(s.team) + '</div>' +
      '<div style="width: 30px; text-align: right; color: rgba(242,236,220,0.65);">' + esc(s.g) + '</div>' +
      '<div style="width: 30px; text-align: right; font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 26px; color: #f4a259;">' + esc(s.pts) + '</div>' +
    '</div>').join('');

  const nextBlock = t.next
    ? '<div style="border: 2px dashed rgba(244,162,89,0.6); border-radius: 10px; padding: 12px 18px; margin-top: 12px;">' +
        '<div style="font-size: 15px; letter-spacing: 0.26em; color: rgba(242,236,220,0.55);">VOLGENDE WEDSTRIJD</div>' +
        '<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 14px; margin-top: 4px;">' +
          '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 37px; line-height: 1; color: #f2ecdc; min-width: 0;">' + esc(t.next.home + ' – ' + t.next.away) + '</div>' +
          '<div data-countdown style="font-family: \'Shadows Into Light Two\', cursive; font-size: 29px; color: #f4a259; white-space: nowrap;">' + esc(t.countdownStr) + '</div>' +
        '</div>' +
        '<div style="font-size: 16px; color: rgba(242,236,220,0.55); margin-top: 2px;">' + esc(D.formatMatchDateNL(t.next.date) + ' · ' + t.next.time + ' uur') + '</div>' +
      '</div>'
    : '';

  const themePanel = t.enabled
    ? '<div style="flex: 1; min-height: 0; border: 2px solid rgba(242,236,220,0.3); border-radius: 12px; padding: 22px 26px; display: flex; flex-direction: column; overflow: hidden; position: relative;">' +
        emblemWatermark(d, 'right: -26px; bottom: -16px; width: 286px; height: 308px') +
        '<div style="position: relative; z-index: 1; display: flex; flex-direction: column; flex: 1; min-height: 0;">' +
          '<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 14px;">' +
            '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 46px; line-height: 1; letter-spacing: 0.06em; color: #f2ecdc;">' + esc(t.titleCaps) + '</div>' +
            '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 26px; color: #f4a259;">' + esc(t.sub) + '</div>' +
          '</div>' +
          nextBlock +
          '<div style="display: flex; flex-direction: column; margin-top: 8px;">' + matchRows + '</div>' +
          '<div style="margin-top: auto; padding-top: 10px;">' +
            '<div style="display: flex; gap: 14px; font-size: 14px; letter-spacing: 0.2em; color: rgba(242,236,220,0.5); padding: 0 2px 4px;">' +
              '<div style="width: 22px;">#</div><div style="flex: 1;">LAND</div><div style="width: 30px; text-align: right;">G</div><div style="width: 30px; text-align: right;">P</div>' +
            '</div>' + standingRows +
          '</div>' +
        '</div>' +
      '</div>'
    : '';

  return '<div data-screen-label="TV — Krijtbord raster" style="position: absolute; inset: 0; display: flex; flex-direction: column; gap: 22px; padding: 36px 50px 42px; box-sizing: border-box;">' +
    topBarHtml(d, true) +
    '<div style="border-top: 3px dashed rgba(242,236,220,0.35); flex-shrink: 0;"></div>' +
    '<div style="flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 470px; gap: 36px;">' +
      '<div style="display: flex; flex-direction: column; gap: 24px; min-height: 0; min-width: 0;">' +
        '<div data-mid-slot style="flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center;">' + midSlotHtml(d) + '</div>' +
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 22px;">' +
          '<div style="border: 2px solid rgba(242,236,220,0.3); border-radius: 12px; padding: 20px 26px;">' +
            '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 36px; letter-spacing: 0.12em; color: #f2ecdc; margin-bottom: 14px;">IN DE KOELKAST</div>' +
            '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px 22px;">' + stockRows + '</div>' +
          '</div>' +
          '<div style="border: 2px solid rgba(242,236,220,0.3); border-radius: 12px; padding: 20px 26px;">' +
            '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 36px; letter-spacing: 0.12em; color: #f2ecdc; margin-bottom: 14px;">HAPJES</div>' +
            '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px 22px;">' + snackRows + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display: flex; flex-direction: column; gap: 24px; min-height: 0;">' +
        '<div style="border: 2px solid rgba(242,236,220,0.35); box-shadow: 0 0 0 5px transparent, inset 0 0 0 4px #2c3e35, inset 0 0 0 6px rgba(242,236,220,0.2); border-radius: 12px; padding: 26px 30px;">' +
          '<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 20px;">' +
            '<div style="min-width: 0;">' +
              '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 30px; color: #f4a259; line-height: 1; transform: rotate(-1deg);">vers van het vat</div>' +
              '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 56px; letter-spacing: 0.14em; color: #f2ecdc; margin-top: 2px; text-shadow: 0 0 14px rgba(242,236,220,0.18);">OP DE TAP</div>' +
            '</div>' +
            (singleTap ? '<div style="margin: 2px 6px 0 0;">' + logoCoasterHtml(singleTap, 120) + '</div>' : '') +
          '</div>' +
          '<div style="border-top: 3px dashed rgba(242,236,220,0.35); margin: 14px 0 2px;"></div>' +
          '<div style="display: flex; flex-direction: column;">' + tapRows + '</div>' +
        '</div>' +
        themePanel +
      '</div>' +
    '</div>' +
  '</div>';
}

// ---------- variant B: roterend middenvlak ----------

function mainPanelHtml(d, panel) {
  const now = new Date();
  if (panel === 'photos') {
    return '<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 30px; animation: defles-fade 0.7s ease;">' +
      polaroidHtml(d, false) + '</div>';
  }
  if (panel === 'party') {
    return '<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 30px; animation: defles-fade 0.7s ease;">' +
      partyPolaroidHtml(d, false) + '</div>';
  }
  if (panel === 'albumqr') {
    return '<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 30px; animation: defles-fade 0.7s ease;">' +
      albumQrPosterHtml(d) + '</div>';
  }
  if (panel === 'tap') {
    const tapRows = deriveTaps(d).map((tp) =>
      '<div style="padding: 16px 0; border-bottom: 1px solid rgba(242,236,220,0.12); display: flex; align-items: center; gap: 30px;">' +
        '<div style="flex: 1; min-width: 0;">' +
          '<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 24px;">' +
            '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 62px; line-height: 1; color: #f2ecdc; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(tp.name) + '</div>' +
            '<div style="flex: 1; border-bottom: 3px dotted rgba(242,236,220,0.3); transform: translateY(-10px); min-width: 30px;"></div>' +
            '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 48px; color: #f4a259; flex-shrink: 0;">' + esc(tp.priceStr) + '</div>' +
          '</div>' +
          '<div style="font-size: 22px; color: rgba(242,236,220,0.55); margin-top: 4px;">' + esc(tp.style) + '</div>' +
        '</div>' +
        logoCoasterHtml(tp, 88) +
      '</div>').join('');
    return '<div style="position: absolute; inset: 0; padding: 44px 80px; box-sizing: border-box; display: flex; flex-direction: column; animation: defles-fade 0.7s ease;">' +
      '<div style="text-align: center;">' +
        '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 40px; color: #f4a259; line-height: 1; transform: rotate(-1deg);">vers van het vat</div>' +
        '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 96px; line-height: 1; letter-spacing: 0.16em; color: #f2ecdc; text-shadow: 0 0 18px rgba(242,236,220,0.2);">OP DE TAP</div>' +
      '</div>' +
      '<div style="border-top: 3px dashed rgba(242,236,220,0.35); margin: 20px auto 6px; width: 880px;"></div>' +
      '<div style="width: 880px; margin: 0 auto; display: flex; flex-direction: column;">' + tapRows + '</div>' +
    '</div>';
  }
  if (panel === 'theme') {
    const t = deriveTheme(d, now);
    const matchRows = t.matchRows.map((m) =>
      '<div style="display: flex; align-items: center; gap: 18px; padding: 12px 2px; border-bottom: 1px dashed rgba(242,236,220,0.18);">' +
        '<div style="width: 110px; font-size: 19px; color: rgba(242,236,220,0.55); flex-shrink: 0;">' + esc(m.when) + '</div>' +
        '<div style="flex: 1; font-size: 24px; color: #f2ecdc;">' + esc(m.teams) + '</div>' +
        '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 36px; color: #f4a259;">' + esc(m.right) + '</div>' +
      '</div>').join('');
    const standingRows = t.standingRows.map((s) =>
      '<div style="display: flex; gap: 16px; align-items: center; padding: 6px 2px; font-size: 23px;">' +
        '<div style="width: 26px; color: rgba(242,236,220,0.5);">' + s.pos + '</div>' +
        '<div style="flex: 1; color: #f2ecdc;">' + esc(s.team) + '</div>' +
        '<div style="width: 40px; text-align: right; color: rgba(242,236,220,0.65);">' + esc(s.g) + '</div>' +
        '<div style="width: 40px; text-align: right; font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 30px; color: #f4a259;">' + esc(s.pts) + '</div>' +
      '</div>').join('');
    const nextBlock = t.next
      ? '<div style="margin-top: 36px;">' +
          '<div style="font-size: 18px; letter-spacing: 0.3em; color: rgba(242,236,220,0.55);">VOLGENDE WEDSTRIJD</div>' +
          '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 72px; line-height: 1; color: #f2ecdc; margin-top: 10px;">' + esc(t.next.home + ' – ' + t.next.away) + '</div>' +
          '<div data-countdown style="font-family: \'Shadows Into Light Two\', cursive; font-size: 64px; line-height: 1.1; color: #f4a259;">' + esc(t.countdownStr) + '</div>' +
          '<div style="font-size: 22px; color: rgba(242,236,220,0.55); margin-top: 4px;">' + esc(D.formatMatchDateNL(t.next.date) + ' · ' + t.next.time + ' uur') + '</div>' +
        '</div>'
      : '';
    return '<div style="position: absolute; inset: 0; padding: 50px 70px; box-sizing: border-box; display: grid; grid-template-columns: 1fr 600px; gap: 70px; animation: defles-fade 0.7s ease;">' +
      emblemWatermark(d, 'left: -20px; bottom: -30px; width: 520px; height: 560px') +
      '<div style="position: relative; z-index: 1; display: flex; flex-direction: column; justify-content: center;">' +
        '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 38px; color: #f4a259; line-height: 1; transform: rotate(-1deg);">' + esc(t.sub) + '</div>' +
        '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 120px; line-height: 0.95; letter-spacing: 0.05em; color: #f2ecdc; margin-top: 6px; text-shadow: 0 0 18px rgba(242,236,220,0.2);">' + esc(t.titleCaps) + '</div>' +
        nextBlock +
      '</div>' +
      '<div style="position: relative; z-index: 1; display: flex; flex-direction: column; justify-content: center; gap: 28px;">' +
        '<div><div style="font-size: 16px; letter-spacing: 0.26em; color: rgba(242,236,220,0.5); margin-bottom: 6px;">PROGRAMMA</div>' + matchRows + '</div>' +
        '<div>' +
          '<div style="display: flex; gap: 16px; font-size: 15px; letter-spacing: 0.2em; color: rgba(242,236,220,0.5); padding: 0 2px 6px;">' +
            '<div style="width: 26px;">#</div><div style="flex: 1;">LAND</div><div style="width: 40px; text-align: right;">G</div><div style="width: 40px; text-align: right;">P</div>' +
          '</div>' + standingRows +
        '</div>' +
      '</div>' +
    '</div>';
  }
  if (panel === 'radio') {
    return '<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 36px; animation: defles-fade 0.7s ease;">' +
      '<div style="width: 1000px; max-width: 100%; height: 100%;">' + radioPosterHtml(d) + '</div>' +
    '</div>';
  }
  // panel === 'stock'
  const chip = (c) =>
    '<div style="border: 2px solid rgba(242,236,220,0.25); border-radius: 12px; padding: 18px 22px; display: flex; align-items: center; gap: 16px;">' +
      stockThumbHtml(c, 52) +
      '<div style="min-width: 0;">' +
        (c.catCaps ? '<div style="font-size: 15px; letter-spacing: 0.22em; color: rgba(242,236,220,0.5);">' + esc(c.catCaps) + '</div>' : '') +
        '<div style="font-size: 27px; color: #f2ecdc; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(c.name) + '</div>' +
      '</div>' +
    '</div>';
  const chips = deriveStock(d).map(chip).join('');
  const snackChips = deriveSnacks(d).map(chip).join('');
  const snacksBlock = snackChips
    ? '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 64px; line-height: 1; letter-spacing: 0.08em; color: #f2ecdc; margin-top: 36px;">HAPJES</div>' +
      '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 18px;">' + snackChips + '</div>'
    : '';
  return '<div style="position: absolute; inset: 0; padding: 50px 70px; box-sizing: border-box; overflow: hidden; animation: defles-fade 0.7s ease;">' +
    '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 36px; color: #f4a259; line-height: 1; transform: rotate(-1deg);">koud &amp; klaar</div>' +
    '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 88px; line-height: 1; letter-spacing: 0.08em; color: #f2ecdc; text-shadow: 0 0 18px rgba(242,236,220,0.2);">IN DE KOELKAST</div>' +
    '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 32px;">' + chips + '</div>' +
    snacksBlock +
  '</div>';
}

function roterendHtml(d) {
  const panels = panelsFor(d);
  const active = panels[mod(app.panelIdx, panels.length)];
  const mededeling = (d.mededeling || '').trim();
  const mededelingBlock = mededeling
    ? '<div style="flex: 1; min-width: 0; border: 3px double rgba(244,162,89,0.75); border-radius: 12px; padding: 12px 26px; display: flex; align-items: center; gap: 22px;">' +
        '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 27px; color: #f4a259; flex-shrink: 0; transform: rotate(-2deg);">let op!</div>' +
        '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 33px; color: #f2ecdc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(mededeling) + '</div>' +
      '</div>'
    : '<div style="flex: 1;"></div>';
  return '<div data-screen-label="TV — Krijtbord roterend" style="position: absolute; inset: 0; display: flex; flex-direction: column; gap: 22px; padding: 40px 50px; box-sizing: border-box;">' +
    topBarHtml(d, false) +
    '<div data-main-panel style="flex: 1; min-height: 0; border: 2px solid rgba(242,236,220,0.3); border-radius: 14px; position: relative; overflow: hidden;">' +
      mainPanelHtml(d, active) +
    '</div>' +
    '<div style="display: flex; align-items: center; gap: 24px; flex-shrink: 0;">' +
      mededelingBlock +
      '<div data-panel-dots style="flex-shrink: 0; display: flex; margin-left: auto;">' + dotsHtml(panels.length, mod(app.panelIdx, panels.length), 'chalk') + '</div>' +
    '</div>' +
  '</div>';
}

// ---------- renderen & gerichte updates ----------

function renderBoard() {
  const d = app.data;
  if (!d) return;
  app.nextKey = deriveTheme(d, new Date()).nextKey;
  board.innerHTML = d.variant === 'roterend' ? roterendHtml(d) : rasterHtml(d);
}

function setText(sel, text) {
  for (const el of board.querySelectorAll(sel)) el.textContent = text;
}

function applyPhoto() {
  const d = app.data;
  // 1 of 0 foto's: niets om naar te wisselen — niet opnieuw de fade afvuren (anders knippert het bord).
  if (!d || (d.photos || []).length <= 1) return;
  const p = d.photos[mod(app.photoIdx, d.photos.length)];
  const img = board.querySelector('[data-photo-img]');
  if (img) {
    img.src = p.src;
    img.style.animation = 'none';
    void img.offsetWidth;
    img.style.animation = 'defles-fade 0.9s ease';
  }
  setText('[data-photo-caption]', p.caption || '');
  const dots = board.querySelector('[data-photo-dots]');
  if (dots) dots.innerHTML = dotsHtml(d.photos.length, mod(app.photoIdx, d.photos.length), 'light');
}

function applyParty() {
  const d = app.data;
  if (!d) return;
  const photos = partyPhotos(d);
  // 1 of 0 foto's: niets om naar te wisselen — niet opnieuw de fade afvuren (anders knippert het bord).
  if (photos.length <= 1) return;
  const p = photos[mod(app.photoIdx, photos.length)];
  const img = board.querySelector('[data-party-img]');
  if (img) {
    img.src = p.src;
    img.style.animation = 'none';
    void img.offsetWidth;
    img.style.animation = 'defles-fade 0.9s ease';
  }
  setText('[data-party-caption]', partyCaption(p));
  const dots = board.querySelector('[data-party-dots]');
  if (dots) dots.innerHTML = dotsHtml(photos.length, mod(app.photoIdx, photos.length), 'light');
}

function applyMusic() {
  const d = app.data;
  if (!d) return;
  const slot = board.querySelector('[data-music-slot]');
  if (!slot) return;
  const raster = d.variant !== 'roterend';
  const m = musicView(d);
  const hasPill = !!slot.querySelector('[data-music-track]');
  if (!m) {
    if (hasPill) slot.innerHTML = '';   // niets aan het spelen: speler weg
    return;
  }
  if (!hasPill) {
    slot.innerHTML = musicPillHtml(d, raster);
    return;
  }
  setText('[data-music-track]', m.track);
  setText('[data-music-artist]', m.artist);
  setText('[data-music-source]', m.sourceCaps);
}

// Namen achter "DE FLES": F·L·E·S → Femke, Linde, Eelko, Suze. Loopt elke ~30s
// als marquee onder "BAR · TUINHUIS" voorbij, met de eerste letters in accentkleur.
const DEFLES_NAMES = ['FEMKE', 'LINDE', 'EELKO', 'SUZE'];
const NAMES_HTML = DEFLES_NAMES
  .map((n) => '<span style="color: #f4a259;">' + n[0] + '</span>' + n.slice(1))
  .join('<span style="color: rgba(242,236,220,0.4);"> · </span>');

function playNamesMarquee() {
  for (const box of board.querySelectorAll('[data-tagline]')) {
    const span = document.createElement('span');
    // absoluut: telt niet mee voor de logo-breedte, dus de bovenbalk verschuift niet
    span.style.cssText = 'position: absolute; left: 0; top: 0; white-space: nowrap; animation: defles-marquee 11s linear;';
    span.innerHTML = NAMES_HTML;
    span.addEventListener('animationend', () => { box.textContent = 'BAR · TUINHUIS'; }, { once: true });
    box.textContent = '';
    box.appendChild(span);
  }
}

// Korte pop-animatie op de badge zodra het aantal aanmeldingen stijgt.
function pulseBadge() {
  const el = board.querySelector('[data-event-badge]');
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = 'defles-pop 0.9s ease';
}
function currentComing(d) {
  const ev = d ? deriveNextEvent(d, new Date()) : null;
  return ev ? ev.coming : -1;
}

function applyWeather() {
  const d = app.data;
  if (!d) return;
  const slot = board.querySelector('[data-weather-slot]');
  if (slot) slot.innerHTML = weatherHtml(d.variant !== 'roterend');
}

function tick() {
  const now = new Date();
  setText('[data-clock]', fmtTime(now));
  setText('[data-date]', D.formatDateNL(now));
  const d = app.data;
  if (d && d.theme && d.theme.enabled) {
    const t = deriveTheme(d, now);
    if (t.nextKey !== app.nextKey) { renderBoard(); return; }
    if (t.next) setText('[data-countdown]', t.countdownStr);
    const wk = deriveWkAll(d, now);
    if (wk.next) setText('[data-countdown-wk]', wk.countdown);
  }
}

// Viltjes bijwerken zodra een automatisch logo binnenkomt (zonder herrender)
function applyLogo(key) {
  const d = app.data;
  if (!d) return;
  const t = deriveTaps(d).find((x) => x.logoKey === key);
  if (!t) return;
  for (const el of board.querySelectorAll('[data-logo-for="' + CSS.escape(key) + '"]')) {
    const size = parseInt(el.style.width, 10) || 60;
    el.outerHTML = logoCoasterHtml(t, size);
  }
}

async function loadLogos() {
  const d = app.data;
  if (!d) return;
  for (const t of (d.taps || [])) {
    const key = (t.name || '').trim().toLowerCase();
    if (!key || key in app.logos) continue;
    app.logos[key] = '';
    try {
      const src = await D.fetchBeerLogo(t.name);
      if (src) { app.logos[key] = src; applyLogo(key); }
    } catch (e) { /* offline: initialen blijven staan */ }
  }
}

// Volledig WK-programma (alle landen) voor de wisselende middenweergave
async function refetchWkAll() {
  const d = app.data;
  if (!d || !d.theme || !d.theme.enabled) return;
  try {
    const r = await D.fetchWkSchedule({ ...(d.theme.api || {}), team: '' });
    if (!r.matches.length) return;
    app.wkAll = r.matches;
    try { localStorage.setItem('defles-wk-all-v1', JSON.stringify(r.matches)); } catch (e) { /* quota */ }
  } catch (e) { /* offline: cache blijft staan */ }
}

function applyScale() {
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  frame.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
}

// ---------- live koppelingen (falen stil: het bord toont nooit een fout) ----------

let lastPlaceKey = '';

async function refetchWeather() {
  const d = app.data;
  if (!d) return;
  const p = d.weatherPlace;
  lastPlaceKey = p.lat + ',' + p.lon;
  try {
    app.weather = await D.fetchWeather(p);
    applyWeather();
  } catch (e) { /* offline: laat huidige staan */ }
}

function maybeRefetchWeather() {
  const p = app.data && app.data.weatherPlace;
  if (p && lastPlaceKey !== p.lat + ',' + p.lon) refetchWeather();
}

async function refetchMusic() {
  const d = app.data;
  if (!d || !d.music) return;
  const mode = d.music.mode || 'handmatig';
  if (mode === 'volumio') {
    try {
      const m = await D.fetchVolumioState(d.music.volumioHost);
      app.liveMusic = { ...m, sourceCaps: 'NU OP VOLUMIO' };
    } catch (e) { app.liveMusic = null; }
  } else if (mode === 'spotify') {
    try {
      const m = await D.fetchSpotifyNowPlaying(d.spotifyAuth, (auth) => client.mutate((x) => { x.spotifyAuth = auth; }));
      app.liveMusic = m && m.track ? { ...m, sourceCaps: 'NU OP SPOTIFY' } : null;
    } catch (e) { app.liveMusic = null; }
  } else {
    app.liveMusic = null;
  }
  applyMusic();
}

// RetroHead-programmering ophalen via de server-proxy
async function refetchRadio() {
  const d = app.data;
  if (!d || !radioOn(d)) { app.radioData = null; return; }
  try {
    // base/slug staan server-side in de state (SSRF-preventie); niet meesturen
    const res = await fetch('/api/radio?count=4', { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error('radio http ' + res.status);
    const j = await res.json();
    if (j.error) throw new Error(j.error);
    app.radioData = j;
    updateRadioSlot();
  } catch (e) { /* offline: laatst bekende programmering blijft staan */ }
}

// Ververst alleen het radio-paneel als dat nu in beeld is (geen volledige herrender)
function updateRadioSlot() {
  const d = app.data;
  if (!d) return;
  const now = new Date();
  if (d.variant === 'roterend') {
    const panels = panelsFor(d);
    if (panels[mod(app.panelIdx, panels.length)] !== 'radio') return;
    const main = board.querySelector('[data-main-panel]');
    if (main) main.innerHTML = mainPanelHtml(d, 'radio');
  } else {
    const views = midViewsFor(d, now);
    if (!views.length || views[mod(app.middenIdx, views.length)] !== 'radio') return;
    const slot = board.querySelector('[data-mid-slot]');
    if (slot) slot.innerHTML = radioPosterHtml(d);
  }
}

// WK-schema en stand ophalen via TheSportsDB en in de gedeelde state bewaren
async function refetchWk() {
  const d = app.data;
  if (!d || !d.theme || !d.theme.enabled || !d.theme.api) return;
  try {
    const r = await D.fetchWkSchedule(d.theme.api);
    if (!r.matches.length) return;
    const next = JSON.stringify({ m: r.matches, s: r.standings });
    const prev = JSON.stringify({ m: d.theme.matches, s: d.theme.standings });
    if (next === prev) return;
    client.mutate((x) => {
      x.theme.matches = r.matches;
      if (r.standings.length) x.theme.standings = r.standings;
      x.theme.lastSync = Date.now();
    });
    renderBoard();
  } catch (e) { /* offline: cache blijft staan */ }
}

// ---------- afstandsbediening: blader door de grote weergaven ----------

function autoRotate() { return !app.data || (app.data.panelMode || 'auto') === 'auto'; }
// na handmatig bladeren even geen automatische wissel
function autoPaused() { return app.lastManual && Date.now() - app.lastManual < 11000; }

function stepView(delta) {
  const d = app.data;
  if (!d) return;
  app.lastManual = Date.now();
  if (d.variant === 'roterend') {
    app.panelIdx += delta;
    const panels = panelsFor(d);
    const main = board.querySelector('[data-main-panel]');
    if (main) main.innerHTML = mainPanelHtml(d, panels[mod(app.panelIdx, panels.length)]);
    const dots = board.querySelector('[data-panel-dots]');
    if (dots) dots.innerHTML = dotsHtml(panels.length, mod(app.panelIdx, panels.length), 'chalk');
    return;
  }
  // raster: blader door het middenvlak; is er maar één weergave, dan door de foto's
  const views = midViewsFor(d, new Date());
  if (views.length >= 2) {
    app.middenIdx += delta;
    const slot = board.querySelector('[data-mid-slot]');
    if (slot) slot.innerHTML = midSlotHtml(d);
  } else if ((d.photos || []).length > 1 || partyPhotos(d).length > 1) {
    app.photoIdx += delta;
    applyPhoto();
    applyParty();
  }
}

// Wordt door de Android-app aangeroepen bij ◀ ▶ op de afstandsbediening
window.deflesRemote = (dir) => stepView(dir === 'prev' ? -1 : 1);
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') { stepView(1); e.preventDefault(); }
  else if (e.key === 'ArrowLeft') { stepView(-1); e.preventDefault(); }
});

// ---------- start ----------

async function main() {
  applyScale();
  window.addEventListener('resize', applyScale);
  try {
    app.data = await client.load();
  } catch (e) {
    setTimeout(main, 3000); // server nog niet wakker: blijf proberen
    return;
  }
  renderBoard();
  refetchWeather();
  loadLogos();
  setTimeout(refetchMusic, 300);
  setTimeout(refetchWk, 800);
  setTimeout(refetchWkAll, 1200);
  app.radioKey = radioOn(app.data) ? app.data.radio.base + '|' + app.data.radio.slug : '';
  refetchRadio();

  app.lastComing = currentComing(app.data);
  client.watch((d) => {
    const prev = app.lastComing;
    app.data = d;
    renderBoard();
    maybeRefetchWeather();
    loadLogos();
    const now = currentComing(d);
    if (prev != null && now > prev) pulseBadge();   // nieuwe aanmelding → pop
    app.lastComing = now;
    // RetroHead opnieuw ophalen als adres/zender is gewijzigd (of net aangezet)
    const key = radioOn(d) ? d.radio.base + '|' + d.radio.slug : '';
    if (key !== app.radioKey) { app.radioKey = key; app.radioData = null; refetchRadio(); }
  });

  setInterval(tick, 1000);
  setInterval(() => {
    const d = app.data;
    const hasParty = d && partyPhotos(d).length > 0;
    if (!d || ((d.photos || []).length === 0 && !hasParty)) return;
    app.photoIdx++;
    applyPhoto();
    applyParty();
  }, 9000);
  setInterval(() => {
    const d = app.data;
    if (!d || d.variant !== 'roterend' || !autoRotate() || autoPaused()) return;
    app.panelIdx++;
    const panels = panelsFor(d);
    const main = board.querySelector('[data-main-panel]');
    if (main) main.innerHTML = mainPanelHtml(d, panels[mod(app.panelIdx, panels.length)]);
    const dots = board.querySelector('[data-panel-dots]');
    if (dots) dots.innerHTML = dotsHtml(panels.length, mod(app.panelIdx, panels.length), 'chalk');
  }, 12000);
  // Middenvlak (raster): wisselt elke 14 s tussen foto's en het WK-schema
  setInterval(() => {
    const d = app.data;
    if (!d || d.variant === 'roterend' || !autoRotate() || autoPaused()) return;
    const views = midViewsFor(d, new Date());
    if (views.length < 2) return;
    app.middenIdx++;
    const slot = board.querySelector('[data-mid-slot]');
    if (slot) slot.innerHTML = midSlotHtml(d);
  }, 14000);
  setInterval(playNamesMarquee, 30 * 1000);
  setTimeout(playNamesMarquee, 6000); // ook kort na het opstarten een keer
  setInterval(refetchWeather, 15 * 60 * 1000);
  setInterval(refetchMusic, 5000);
  setInterval(refetchWk, 30 * 60 * 1000);
  setInterval(refetchWkAll, 30 * 60 * 1000);
  setInterval(refetchRadio, 30 * 1000);
}

main();
