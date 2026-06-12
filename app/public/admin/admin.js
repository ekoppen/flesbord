// De Fles — beheerscherm. Alles slaat direct bij elke wijziging op (geen
// save-knop); wijzigingen verschijnen binnen ~2 s op de TV via de mini-server.

import * as D from '../defles-data.js';
import { createStateClient } from '../defles-sync.js';

const client = createStateClient();
const cards = document.getElementById('cards');

const app = { weatherQuery: '', weatherStatus: '', volumioStatus: '', spotifyStatus: '', photoStatus: '', wkStatus: '' };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- opslaan + "opgeslagen ✓" ----------

let flashT = null;
function flashSaved() {
  const el = document.querySelector('[data-saved]');
  if (!el) return;
  el.style.visibility = 'visible';
  clearTimeout(flashT);
  flashT = setTimeout(() => { el.style.visibility = 'hidden'; }, 1800);
}

function mut(fn, rerender) {
  client.mutate(fn);
  flashSaved();
  if (rerender) render();
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = value;
}

// ---------- kaarten ----------

function spotifyConnected(d) { return !!(d.spotifyAuth && d.spotifyAuth.refresh_token); }

function cardScherm(d) {
  const tiles = [
    { key: 'raster', label: 'VAST RASTER', desc: 'Alles tegelijk in beeld: klok, weer, foto, tap en WK.' },
    { key: 'roterend', label: 'ROTEREND VLAK', desc: 'Vaste balk boven; groot vlak wisselt tussen foto’s, tap, WK en voorraad.' }
  ].map((v) => {
    const on = d.variant === v.key;
    return '<button data-act="variant" data-arg="' + v.key + '" style="text-align: left; cursor: pointer; background: ' +
      (on ? 'rgba(244,162,89,0.14)' : 'transparent') + '; border: 2px solid ' + (on ? '#f4a259' : 'rgba(242,236,220,0.3)') +
      '; border-radius: 12px; padding: 14px 18px; font-family: \'Patrick Hand\', cursive;">' +
      '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 26px; letter-spacing: 0.04em; color: #f2ecdc;">' + v.label + '</div>' +
      '<div style="font-size: 15px; color: rgba(242,236,220,0.6); margin-top: 2px; line-height: 1.35;">' + v.desc + '</div>' +
    '</button>';
  }).join('');
  return '<div class="card"><div class="card-h" style="margin-bottom: 14px;">SCHERMINDELING</div>' +
    '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">' + tiles + '</div></div>';
}

function cardWeer(d) {
  return '<div class="card"><div class="card-h" style="margin-bottom: 14px;">WEER</div>' +
    '<div class="lbl">PLAATS</div>' +
    '<div style="display: flex; gap: 10px;">' +
      '<input class="in" data-local="weatherQuery" value="' + esc(app.weatherQuery) + '" placeholder="bv. Apeldoorn" style="flex: 1;">' +
      '<button class="btn-orange" data-act="weatherSearch">ZOEK</button>' +
    '</div>' +
    '<div style="font-size: 16px; color: rgba(242,236,220,0.75); margin-top: 12px;">Huidige plaats: <b style="color: #f2ecdc;">' + esc(d.weatherPlace.name) + '</b></div>' +
    '<div class="status" data-status="weather"' + (app.weatherStatus ? '' : ' style="display:none;"') + '>' + esc(app.weatherStatus) + '</div>' +
  '</div>';
}

function cardTeksten(d) {
  return '<div class="card"><div class="card-h" style="margin-bottom: 14px;">TEKSTEN</div>' +
    '<div class="lbl">WELKOMSTREGEL (boven het logo)</div>' +
    '<input class="in" data-bind="welkom" value="' + esc(d.welkom) + '" style="width: 100%;">' +
    '<div class="lbl" style="margin: 16px 0 6px;">MEDEDELING (leeg = verbergen)</div>' +
    '<textarea class="in" data-bind="mededeling" rows="3" style="width: 100%; resize: vertical;">' + esc(d.mededeling) + '</textarea>' +
  '</div>';
}

function toggleHtml(act, on, label) {
  return '<button data-act="' + act + '" aria-label="' + esc(label) + '" style="cursor: pointer; border: none; width: 52px; height: 30px; border-radius: 999px; background: ' +
    (on ? '#f4a259' : 'rgba(242,236,220,0.25)') + '; position: relative; padding: 0; flex-shrink: 0;">' +
    '<div style="position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 999px; background: #f2ecdc; box-shadow: 0 1px 3px rgba(0,0,0,0.35); transform: ' +
    (on ? 'translateX(22px)' : 'translateX(0)') + '; transition: transform 0.2s ease;"></div></button>';
}

function cardMuziek(d) {
  const mode = d.music.mode || 'handmatig';
  const pills = [
    { key: 'handmatig', label: 'HANDMATIG' },
    { key: 'volumio', label: 'VOLUMIO' },
    { key: 'spotify', label: 'SPOTIFY' }
  ].map((m) => {
    const on = mode === m.key;
    return '<button data-act="mode" data-arg="' + m.key + '" style="flex: 1; cursor: pointer; background: ' +
      (on ? 'rgba(244,162,89,0.14)' : 'transparent') + '; border: 2px solid ' + (on ? '#f4a259' : 'rgba(242,236,220,0.3)') +
      '; border-radius: 999px; padding: 7px 10px; font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 21px; letter-spacing: 0.05em; color: #f2ecdc;">' + m.label + '</button>';
  }).join('');

  let body = '';
  if (mode === 'handmatig') {
    body =
      '<div style="display: grid; grid-template-columns: 140px 1fr; gap: 12px;">' +
        '<div><div class="lbl">LABEL</div>' +
          '<select class="in" data-bind="music.source" style="width: 100%;">' +
            ['Spotify', 'Volumio', 'Vinyl'].map((o) => '<option value="' + o + '"' + (d.music.source === o ? ' selected' : '') + '>' + o + '</option>').join('') +
          '</select></div>' +
        '<div><div class="lbl">NUMMER</div>' +
          '<input class="in" data-bind="music.track" value="' + esc(d.music.track) + '" style="width: 100%;"></div>' +
      '</div>' +
      '<div class="lbl" style="margin: 16px 0 6px;">ARTIEST</div>' +
      '<input class="in" data-bind="music.artist" value="' + esc(d.music.artist) + '" style="width: 100%;">';
  } else if (mode === 'volumio') {
    body =
      '<div class="lbl">VOLUMIO-ADRES (IP of hostnaam)</div>' +
      '<div style="display: flex; gap: 10px;">' +
        '<input class="in" data-bind="music.volumioHost" value="' + esc(d.music.volumioHost) + '" placeholder="bv. volumio.local of 192.168.1.40" style="flex: 1;">' +
        '<button class="btn-orange" data-act="volumioTest">TEST</button>' +
      '</div>' +
      '<div class="status" data-status="volumio"' + (app.volumioStatus ? '' : ' style="display:none;"') + '>' + esc(app.volumioStatus) + '</div>' +
      '<div style="font-size: 14px; color: rgba(242,236,220,0.5); margin-top: 12px; line-height: 1.5;">De TV vraagt elke 5 seconden via de Volumio-API op wat er speelt. De server en Volumio moeten op hetzelfde netwerk zitten.</div>';
  } else {
    if (spotifyConnected(d)) {
      body =
        '<div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; border: 2px dashed rgba(143,214,160,0.6); border-radius: 10px; padding: 12px 18px;">' +
          '<div style="font-size: 17px; color: #8fd6a0;">Verbonden met Spotify ✓ — de TV toont automatisch wat er speelt.</div>' +
          '<button class="btn-ghost" data-act="spotifyDisconnect" style="padding: 5px 14px; font-size: 14px; flex-shrink: 0; color: rgba(242,236,220,0.7);">Ontkoppelen</button>' +
        '</div>';
    } else {
      body =
        '<div class="lbl">SPOTIFY CLIENT ID</div>' +
        '<input class="in" data-bind="music.spotifyClientId" value="' + esc(d.music.spotifyClientId) + '" placeholder="uit je Spotify Developer Dashboard" style="width: 100%;">' +
        '<div class="lbl" style="margin: 14px 0 6px;">REDIRECT URI (toevoegen in het dashboard)</div>' +
        '<div style="border: 2px dashed rgba(242,236,220,0.3); border-radius: 10px; padding: 9px 14px; font-size: 14px; color: rgba(242,236,220,0.75); word-break: break-all; user-select: all;">' + esc(D.spotifyRedirectUri()) + '</div>' +
        '<button class="btn-pill" data-act="spotifyConnect" style="margin-top: 14px;">VERBIND MET SPOTIFY ↗</button>' +
        '<div style="font-size: 14px; color: rgba(242,236,220,0.5); margin-top: 12px; line-height: 1.5;">Maak gratis een app aan op developer.spotify.com, plak hier de Client ID, voeg de redirect URI toe en log in. Werkt met elk Spotify-account. Let op: Spotify accepteert alleen een 127.0.0.1-adres als redirect — verbind dus één keer vanaf de computer waarop de server draait.</div>';
    }
    body += '<div class="status" data-status="spotify"' + (app.spotifyStatus ? '' : ' style="display:none;"') + '>' + esc(app.spotifyStatus) + '</div>';
  }

  return '<div class="card">' +
    '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">' +
      '<div class="card-h">MUZIEK</div>' +
      '<div style="display: flex; align-items: center; gap: 10px;">' +
        '<div style="font-size: 14px; color: rgba(242,236,220,0.55);">tonen op TV</div>' +
        toggleHtml('toggleMusic', d.showMusic, 'Muziek tonen') +
      '</div>' +
    '</div>' +
    '<div class="lbl">BRON</div>' +
    '<div style="display: flex; gap: 8px; margin-bottom: 16px;">' + pills + '</div>' +
    body +
  '</div>';
}

function cardTap(d) {
  const rows = d.taps.map((t, i) => {
    const on = t.onTap !== false;
    const dim = on ? '1' : '0.45';
    const initials = (t.name || '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '·';
    const logoInner = t.logo
      ? '<img src="' + esc(t.logo) + '" alt="" style="width: 80%; height: 80%; object-fit: contain;">'
      : '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 19px; line-height: 1; color: #2c3e35;">' + esc(initials) + '</div>';
    const logoRemove = t.logo
      ? '<button data-act="rmLogo" data-arg="' + i + '" aria-label="Eigen logo verwijderen" title="Eigen logo verwijderen" style="position: absolute; top: -5px; right: -5px; cursor: pointer; width: 17px; height: 17px; border-radius: 999px; border: none; background: rgba(28,24,18,0.85); color: #f2ecdc; font-size: 9px; line-height: 1; padding: 0;">✕</button>'
      : '';
    return '<div class="tap-row">' +
      // even hoog als de invoervelden, zodat de rij strak uitlijnt
      '<div style="position: relative; width: 41px; height: 41px; align-self: center; opacity: ' + dim + ';">' +
        '<button data-act="pickLogo" data-arg="' + i + '" title="Eigen logo uploaden" style="cursor: pointer; width: 41px; height: 41px; border-radius: 999px; border: 2px solid rgba(242,236,220,0.3); background: #faf6ec; padding: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; box-sizing: border-box;">' + logoInner + '</button>' +
        logoRemove +
      '</div>' +
      '<input class="in" data-bind="taps.' + i + '.name" value="' + esc(t.name) + '" placeholder="Naam" style="opacity: ' + dim + ';">' +
      '<input class="in" data-bind="taps.' + i + '.style" value="' + esc(t.style) + '" placeholder="Stijl · %" style="opacity: ' + dim + ';">' +
      '<input class="in" data-bind="taps.' + i + '.price" value="' + esc(t.price) + '" placeholder="€ 0,00" style="opacity: ' + dim + ';">' +
      '<div style="display: flex; align-items: center; gap: 8px; opacity: ' + dim + ';">' +
        '<input type="range" min="0" max="100" data-bind="taps.' + i + '.level" data-num="1" value="' + esc(t.level) + '" style="flex: 1; accent-color: #f4a259;">' +
        '<div data-level-val style="width: 38px; font-size: 15px; color: rgba(242,236,220,0.75); text-align: right;">' + esc(t.level || 0) + '%</div>' +
      '</div>' +
      '<div style="display: flex; align-items: center; justify-content: flex-end; gap: 7px;">' +
        '<div style="font-size: 13px; color: rgba(242,236,220,0.55);">tap</div>' +
        '<button data-act="toggleTap" data-arg="' + i + '" aria-label="Op de tap" title="Op de tap tonen" style="cursor: pointer; border: none; width: 46px; height: 27px; border-radius: 999px; background: ' + (on ? '#f4a259' : 'rgba(242,236,220,0.25)') + '; position: relative; padding: 0; flex-shrink: 0;">' +
          '<div style="position: absolute; top: 3px; left: 3px; width: 21px; height: 21px; border-radius: 999px; background: #f2ecdc; box-shadow: 0 1px 3px rgba(0,0,0,0.35); transform: ' + (on ? 'translateX(19px)' : 'translateX(0)') + '; transition: transform 0.2s ease;"></div>' +
        '</button>' +
      '</div>' +
      '<button class="btn-x" data-act="rmTap" data-arg="' + i + '" aria-label="Verwijder">✕</button>' +
    '</div>';
  }).join('');
  const onTapCount = d.taps.filter((t) => t.onTap !== false).length;
  return '<div class="card">' +
    '<div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px;">' +
      '<div class="card-h">BIEREN <span style="font-size: 24px; color: rgba(242,236,220,0.55);">· ' + onTapCount + ' op de tap</span></div>' +
      '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 18px; color: rgba(242,236,220,0.55);">alleen bieren met de schakelaar aan staan op TV · klik op het rondje voor een eigen logo</div>' +
    '</div>' +
    '<input type="file" id="logo-input" accept="image/*" style="display: none;">' +
    '<div style="display: flex; flex-direction: column; gap: 10px;">' + rows + '</div>' +
    '<button class="btn-dash" data-act="addTap" style="margin-top: 14px;">+ BIER TOEVOEGEN</button>' +
  '</div>';
}

function cardVoorraad(d) {
  const cats = ['Bier', 'Fris', 'Wijn', 'Sterk', 'Overig'];
  const rows = d.stock.map((s, i) =>
    '<div class="stock-row">' +
      '<input class="in" data-bind="stock.' + i + '.name" value="' + esc(s.name) + '" placeholder="Naam">' +
      '<select class="in" data-bind="stock.' + i + '.cat">' +
        cats.map((c) => '<option value="' + c + '"' + (s.cat === c ? ' selected' : '') + '>' + c + '</option>').join('') +
      '</select>' +
      '<div style="display: flex; align-items: center; gap: 6px;">' +
        '<button class="btn-step" data-act="qtyMinus" data-arg="' + i + '">−</button>' +
        '<div data-qty="' + i + '" style="flex: 1; text-align: center; font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 26px;">' + esc(s.qty) + '</div>' +
        '<button class="btn-step" data-act="qtyPlus" data-arg="' + i + '">+</button>' +
      '</div>' +
      '<button class="btn-x" data-act="rmStock" data-arg="' + i + '" aria-label="Verwijder">✕</button>' +
    '</div>').join('');
  return '<div class="card">' +
    '<div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px;">' +
      '<div class="card-h">VOORRAAD</div>' +
      '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 18px; color: rgba(242,236,220,0.55);">aantallen zijn voor je eigen overzicht — op TV staan alleen de namen</div>' +
    '</div>' +
    '<div class="stock-grid">' + rows + '</div>' +
    '<button class="btn-dash" data-act="addStock" style="margin-top: 14px;">+ ARTIKEL TOEVOEGEN</button>' +
  '</div>';
}

function cardFotos(d) {
  const thumbs = d.photos.map((p, i) =>
    '<div style="background: #faf6ec; padding: 8px 8px 4px; box-shadow: 0 6px 16px rgba(0,0,0,0.35); transform: rotate(-0.8deg);">' +
      '<div style="position: relative; height: 110px; background: #ddd6c6;">' +
        '<img src="' + esc(p.src) + '" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;">' +
        '<button data-act="rmPhoto" data-arg="' + i + '" aria-label="Verwijder foto" style="position: absolute; top: 6px; right: 6px; cursor: pointer; width: 28px; height: 28px; border-radius: 999px; border: none; background: rgba(28,24,18,0.65); color: #f2ecdc; font-size: 13px; line-height: 1;">✕</button>' +
      '</div>' +
      '<input data-bind="photos.' + i + '.caption" value="' + esc(p.caption) + '" placeholder="bijschrift…" style="width: 100%; border: none; padding: 7px 6px 5px; font-family: \'Shadows Into Light Two\', cursive; font-size: 17px; background: transparent; color: #4a4337; outline: none; box-sizing: border-box;">' +
    '</div>').join('');
  return '<div class="card">' +
    '<div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px;">' +
      '<div class="card-h">FOTO’S</div>' +
      '<div style="font-family: \'Shadows Into Light Two\', cursive; font-size: 18px; color: rgba(242,236,220,0.55);">' + d.photos.length + ' van max. 12 · foto’s worden verkleind opgeslagen</div>' +
    '</div>' +
    '<input type="file" id="file-input" accept="image/*" multiple style="display: none;">' +
    '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px;">' +
      thumbs +
      '<button class="btn-dash" data-act="pickFiles" style="min-height: 150px; border-radius: 12px; font-size: 24px;">+ FOTO’S UPLOADEN</button>' +
    '</div>' +
    '<div class="status" data-status="photo"' + (app.photoStatus ? '' : ' style="display:none;"') + '>' + esc(app.photoStatus) + '</div>' +
    '<div style="font-size: 14px; color: rgba(242,236,220,0.5); margin-top: 12px;">Insturen door gasten (bv. via Discord) kan later als koppeling worden toegevoegd.</div>' +
  '</div>';
}

function cardThema(d) {
  const t = d.theme;
  const previewMatches = t.matches.map((m) =>
    '<div style="display: flex; align-items: center; gap: 14px; padding: 7px 2px; border-bottom: 1px dashed rgba(242,236,220,0.18);">' +
      '<div style="width: 130px; font-size: 15px; color: rgba(242,236,220,0.55); flex-shrink: 0;">' + esc(D.formatMatchDateNL(m.date) + ' · ' + m.time) + '</div>' +
      '<div style="flex: 1; font-size: 17px; color: #f2ecdc; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(m.home + ' – ' + m.away) + '</div>' +
      '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 24px; color: #f4a259;">' + esc(m.score || '') + '</div>' +
    '</div>').join('');
  const previewStandings = t.standings.map((s, i) =>
    '<div style="display: flex; align-items: center; gap: 12px; padding: 6px 2px; border-bottom: 1px dashed rgba(242,236,220,0.18); font-size: 16px;">' +
      '<div style="width: 20px; color: rgba(242,236,220,0.5);">' + (i + 1) + '</div>' +
      '<div style="flex: 1; color: #f2ecdc;">' + esc(s.team) + '</div>' +
      '<div style="width: 28px; text-align: right; color: rgba(242,236,220,0.6);">' + esc(s.g) + '</div>' +
      '<div style="width: 28px; text-align: right; font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 22px; color: #f4a259;">' + esc(s.pts) + '</div>' +
    '</div>').join('');
  const lastSyncStr = t.lastSync ? new Date(t.lastSync).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'nog niet';
  return '<div class="card">' +
    '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">' +
      '<div class="card-h">THEMA — WK VOETBAL</div>' +
      toggleHtml('toggleTheme', t.enabled, 'Thema tonen') +
    '</div>' +
    '<div class="row2" style="gap: 12px; margin-bottom: 20px;">' +
      '<div><div class="lbl">TITEL</div><input class="in" data-bind="theme.title" value="' + esc(t.title) + '" style="width: 100%;"></div>' +
      '<div><div class="lbl">ONDERTITEL</div><input class="in" data-bind="theme.sub" value="' + esc(t.sub) + '" style="width: 100%;"></div>' +
    '</div>' +
    '<div class="lbl" style="margin-bottom: 8px;">SCHEMA &amp; STAND VIA API — TheSportsDB</div>' +
    '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1.4fr; gap: 12px;">' +
      '<div><div class="lbl">API-SLEUTEL</div><input class="in" data-bind="theme.api.key" value="' + esc(t.api.key) + '" placeholder="123" style="width: 100%;"></div>' +
      '<div><div class="lbl">COMPETITIE-ID</div><input class="in" data-bind="theme.api.league" value="' + esc(t.api.league) + '" placeholder="4429" style="width: 100%;"></div>' +
      '<div><div class="lbl">SEIZOEN</div><input class="in" data-bind="theme.api.season" value="' + esc(t.api.season) + '" placeholder="2026" style="width: 100%;"></div>' +
      '<div><div class="lbl">TEAMFILTER (leeg = alles)</div><input class="in" data-bind="theme.api.team" value="' + esc(t.api.team) + '" placeholder="bv. Netherlands" style="width: 100%;"></div>' +
    '</div>' +
    '<div style="display: flex; align-items: center; gap: 16px; margin-top: 14px; flex-wrap: wrap;">' +
      '<button class="btn-orange" data-act="wkSync" style="border-radius: 999px; font-size: 24px; padding: 8px 24px; box-shadow: 0 6px 16px rgba(0,0,0,0.3);">NU OPHALEN</button>' +
      '<div class="status" data-status="wk" style="margin-top: 0;' + (app.wkStatus ? '' : ' display:none;') + '">' + esc(app.wkStatus) + '</div>' +
      '<div style="margin-left: auto; font-size: 14px; color: rgba(242,236,220,0.5);">Laatst opgehaald: ' + esc(lastSyncStr) + '</div>' +
    '</div>' +
    '<div style="font-size: 14px; color: rgba(242,236,220,0.5); margin-top: 10px; line-height: 1.5;">Gratis sleutel “123” · competitie 4429 = FIFA World Cup · teamnamen in het Engels (bv. “Netherlands”). De TV ververst het schema zelf elk half uur.</div>' +
    '<div style="display: grid; grid-template-columns: 1fr 320px; gap: 28px; margin-top: 18px;" class="row2">' +
      '<div><div class="lbl">OPGEHAALD SCHEMA</div>' + previewMatches + '</div>' +
      '<div><div class="lbl">STAND</div>' + previewStandings + '</div>' +
    '</div>' +
  '</div>';
}

function render() {
  const d = client.get();
  if (!d) return;
  cards.innerHTML =
    '<div style="display: flex; flex-direction: column; gap: 20px;">' +
      '<div class="row2">' + cardScherm(d) + cardWeer(d) + '</div>' +
      '<div class="row2">' + cardTeksten(d) + cardMuziek(d) + '</div>' +
      cardTap(d) + cardVoorraad(d) + cardFotos(d) + cardThema(d) +
      '<div style="display: flex; justify-content: flex-end; padding: 4px;">' +
        '<button class="btn-ghost" data-act="reset">Terug naar voorbeelddata</button>' +
      '</div>' +
    '</div>';
}

// Re-render met behoud van focus + cursorpositie (voor updates van andere apparaten)
function renderPreservingFocus() {
  const act = document.activeElement;
  const key = act && (act.dataset.bind || act.dataset.local);
  const selStart = act && act.selectionStart != null ? act.selectionStart : null;
  render();
  if (key) {
    const sel = act.dataset.bind ? '[data-bind="' + key + '"]' : '[data-local="' + key + '"]';
    const el = cards.querySelector(sel);
    if (el) {
      el.focus();
      if (selStart != null && el.setSelectionRange) try { el.setSelectionRange(selStart, selStart); } catch (e) { /* type zonder selectie */ }
    }
  }
}

// ---------- statussen ----------

function setStatus(key, text) {
  app[key + 'Status'] = text;
  const el = cards.querySelector('[data-status="' + key + '"]');
  if (el) {
    el.textContent = text;
    el.style.display = text ? '' : 'none';
  }
}

// ---------- acties ----------

async function searchWeather() {
  const q = app.weatherQuery.trim();
  if (!q) return;
  setStatus('weather', 'Zoeken…');
  try {
    const hit = await D.geocodePlace(q);
    if (!hit) { setStatus('weather', 'Plaats niet gevonden.'); return; }
    app.weatherQuery = '';
    mut((d) => { d.weatherPlace = hit; }, true);
  } catch (e) {
    setStatus('weather', 'Zoeken mislukt — controleer de internetverbinding.');
  }
}

async function testVolumio() {
  const host = client.get().music.volumioHost;
  setStatus('volumio', 'Verbinding testen…');
  try {
    const m = await D.fetchVolumioState(host);
    setStatus('volumio', m.track ? 'Verbonden ✓ — nu: ' + m.track + (m.artist ? ' — ' + m.artist : '') : 'Verbonden ✓ — er speelt nu niets.');
  } catch (e) {
    setStatus('volumio', 'Geen verbinding. Controleer het adres en of de server op hetzelfde netwerk zit.');
  }
}

async function syncWk() {
  setStatus('wk', 'Schema ophalen…');
  try {
    const r = await D.fetchWkSchedule(client.get().theme.api);
    if (!r.matches.length) {
      setStatus('wk', 'Geen wedstrijden gevonden — controleer competitie-ID, seizoen en teamfilter.');
      return;
    }
    mut((d) => {
      d.theme.matches = r.matches;
      if (r.standings.length) d.theme.standings = r.standings;
      d.theme.lastSync = Date.now();
    }, true);
    setStatus('wk', r.matches.length + ' wedstrijden opgehaald ✓' + (r.standings.length ? ' · stand bijgewerkt' : ' · geen stand beschikbaar'));
  } catch (e) {
    setStatus('wk', 'Ophalen mislukt — controleer de API-sleutel en internetverbinding.');
  }
}

async function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const room = 12 - client.get().photos.length;
  if (room <= 0) { setStatus('photo', 'Maximaal 12 foto’s — verwijder er eerst een paar.'); return; }
  setStatus('photo', 'Bezig met verwerken…');
  const newPhotos = [];
  for (const f of files.slice(0, room)) {
    try {
      const url = URL.createObjectURL(f);
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i); i.onerror = rej; i.src = url;
      });
      const maxSide = 1280;
      const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
      const cw = Math.round(img.width * ratio), ch = Math.round(img.height * ratio);
      const cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
      URL.revokeObjectURL(url);
      // Upload naar de server; de state verwijst naar het bestand (klein houden)
      const res = await fetch('/api/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: cv.toDataURL('image/jpeg', 0.72) })
      });
      if (!res.ok) throw new Error('upload http ' + res.status);
      const j = await res.json();
      newPhotos.push({ id: D.uid(), src: j.src, caption: '' });
    } catch (e) { /* sla onleesbaar bestand over */ }
  }
  if (newPhotos.length) mut((d) => { d.photos = d.photos.concat(newPhotos); }, true);
  setStatus('photo', newPhotos.length ? '' : 'Uploaden mislukt — probeer het opnieuw.');
}

// Eigen bierlogo: verkleind (max 240px) als PNG bij het bier opslaan
let logoTapIdx = null;
async function addLogoFile(fileList) {
  const f = (fileList && fileList[0]) || null;
  const i = logoTapIdx;
  if (!f || i == null) return;
  try {
    const url = URL.createObjectURL(f);
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im); im.onerror = rej; im.src = url;
    });
    const maxSide = 240;
    const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
    const cw = Math.round(img.width * ratio), ch = Math.round(img.height * ratio);
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
    URL.revokeObjectURL(url);
    const src = cv.toDataURL('image/png');
    mut((d) => { if (d.taps[i]) d.taps[i].logo = src; }, true);
  } catch (e) { /* onleesbaar bestand: niets doen */ }
}

// ---------- events (delegatie) ----------

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'file-input') return;
  if (el.dataset.local) { app[el.dataset.local] = el.value; return; }
  const bind = el.dataset.bind;
  if (!bind) return;
  const val = el.dataset.num ? Number(el.value) : el.value;
  mut((d) => setPath(d, bind, val));
  if (el.type === 'range') {
    const lab = el.parentElement.querySelector('[data-level-val]');
    if (lab) lab.textContent = el.value + '%';
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'file-input') {
    addFiles(e.target.files);
    e.target.value = '';
  }
  if (e.target.id === 'logo-input') {
    addLogoFile(e.target.files);
    e.target.value = '';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.local === 'weatherQuery') searchWeather();
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const arg = btn.dataset.arg;
  const i = Number(arg);
  switch (act) {
    case 'variant': mut((d) => { d.variant = arg; }, true); break;
    case 'mode': mut((d) => { d.music.mode = arg; }, true); break;
    case 'toggleMusic': mut((d) => { d.showMusic = !d.showMusic; }, true); break;
    case 'toggleTheme': mut((d) => { d.theme.enabled = !d.theme.enabled; }, true); break;
    case 'addTap': mut((d) => { d.taps.push({ id: D.uid(), name: '', style: '', price: '', level: 100, onTap: true }); }, true); break;
    case 'rmTap': mut((d) => { d.taps.splice(i, 1); }, true); break;
    case 'toggleTap': mut((d) => { d.taps[i].onTap = !(d.taps[i].onTap !== false); }, true); break;
    case 'pickLogo': { logoTapIdx = i; const f = document.getElementById('logo-input'); if (f) f.click(); break; }
    case 'rmLogo': mut((d) => { delete d.taps[i].logo; }, true); break;
    case 'addStock': mut((d) => { d.stock.push({ id: D.uid(), name: '', cat: 'Bier', qty: 6 }); }, true); break;
    case 'rmStock': mut((d) => { d.stock.splice(i, 1); }, true); break;
    case 'qtyMinus': {
      mut((d) => { d.stock[i].qty = Math.max(0, Number(d.stock[i].qty) - 1); });
      const el = cards.querySelector('[data-qty="' + i + '"]');
      if (el) el.textContent = client.get().stock[i].qty;
      break;
    }
    case 'qtyPlus': {
      mut((d) => { d.stock[i].qty = Number(d.stock[i].qty) + 1; });
      const el = cards.querySelector('[data-qty="' + i + '"]');
      if (el) el.textContent = client.get().stock[i].qty;
      break;
    }
    case 'rmPhoto': mut((d) => { d.photos.splice(i, 1); }, true); break;
    case 'pickFiles': { const f = document.getElementById('file-input'); if (f) f.click(); break; }
    case 'weatherSearch': searchWeather(); break;
    case 'volumioTest': testVolumio(); break;
    case 'wkSync': syncWk(); break;
    case 'spotifyConnect': {
      const id = (client.get().music.spotifyClientId || '').trim();
      if (!id) { setStatus('spotify', 'Vul eerst je Spotify Client ID in.'); break; }
      client.flush().then(() => D.spotifyLogin(id));
      break;
    }
    case 'spotifyDisconnect': mut((d) => { d.spotifyAuth = null; }, true); break;
    case 'reset': {
      if (window.confirm('Alles terugzetten naar de voorbeelddata?')) {
        mut((d) => {
          const keepAuth = d.spotifyAuth;
          Object.assign(d, structuredClone(D.DEFAULT_STATE));
          d.spotifyAuth = keepAuth;
        }, true);
      }
      break;
    }
  }
});

// ---------- start ----------

async function main() {
  try {
    await client.load();
  } catch (e) {
    cards.innerHTML = '<div class="card" style="text-align: center; font-size: 18px;">Kan de server niet bereiken — opnieuw proberen…</div>';
    setTimeout(main, 3000);
    return;
  }

  // Terugkeer van Spotify-login afhandelen (?code=...)
  if (new URLSearchParams(location.search).get('code')) {
    app.spotifyStatus = 'Verbinden met Spotify…';
    render();
    try {
      const auth = await D.spotifyHandleRedirect();
      if (auth) {
        mut((d) => { d.spotifyAuth = auth; d.music.mode = 'spotify'; });
        await client.flush();
        app.spotifyStatus = '';
      } else {
        app.spotifyStatus = 'Verbinden mislukt — probeer opnieuw.';
      }
    } catch (e) {
      app.spotifyStatus = 'Verbinden mislukt — controleer Client ID en redirect URI.';
    }
  }

  render();
  client.watch(() => renderPreservingFocus());
}

main();
