// De Fles — beheerscherm. Alles slaat direct bij elke wijziging op (geen
// save-knop); wijzigingen verschijnen binnen ~2 s op de TV via de mini-server.

import * as D from '../defles-data.js';
import { createStateClient } from '../defles-sync.js';

const client = createStateClient();
const cards = document.getElementById('cards');

const app = { weatherQuery: '', weatherStatus: '', volumioStatus: '', spotifyStatus: '', photoStatus: '', wkStatus: '', radioStatus: '', radioChannels: [], emblemStatus: '', mail: null, mailStatus: '', eventMsg: {} };

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
  const pm = d.panelMode || 'auto';
  const pmPills = [
    { key: 'auto', label: 'AUTOMATISCH' },
    { key: 'handmatig', label: 'HANDMATIG' }
  ].map((m) => {
    const on = pm === m.key;
    return '<button data-act="panelMode" data-arg="' + m.key + '" style="flex: 1; cursor: pointer; background: ' +
      (on ? 'rgba(244,162,89,0.14)' : 'transparent') + '; border: 2px solid ' + (on ? '#f4a259' : 'rgba(242,236,220,0.3)') +
      '; border-radius: 999px; padding: 7px 10px; font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 21px; letter-spacing: 0.05em; color: #f2ecdc;">' + m.label + '</button>';
  }).join('');
  return '<div class="card"><div class="card-h" style="margin-bottom: 14px;">SCHERMINDELING</div>' +
    '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">' + tiles + '</div>' +
    '<div class="lbl" style="margin: 16px 0 6px;">GROTE WEERGAVEN WISSELEN</div>' +
    '<div style="display: flex; gap: 8px;">' + pmPills + '</div>' +
    '<div style="font-size: 14px; color: rgba(242,236,220,0.5); margin-top: 10px; line-height: 1.5;">Bladeren kan altijd met ◀ ▶ op de afstandsbediening van de Chromecast; bij Handmatig wisselt het scherm verder niet vanzelf.</div>' +
  '</div>';
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
      ? '<img src="' + esc(t.logo) + '" alt="" style="width: 100%; height: 100%; object-fit: cover;">'
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
  const rows = d.stock.map((s, i) => {
    const sInit = (s.name || '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '·';
    const sImgInner = s.img
      ? '<img src="' + esc(s.img) + '" alt="" style="width: 100%; height: 100%; object-fit: cover;">'
      : '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 17px; line-height: 1; color: #2c3e35;">' + esc(sInit) + '</div>';
    const sImgRemove = s.img
      ? '<button data-act="rmStockLogo" data-arg="' + i + '" aria-label="Afbeelding verwijderen" title="Afbeelding verwijderen" style="position: absolute; top: -5px; right: -5px; cursor: pointer; width: 17px; height: 17px; border-radius: 999px; border: none; background: rgba(28,24,18,0.85); color: #f2ecdc; font-size: 9px; line-height: 1; padding: 0;">✕</button>'
      : '';
    return '<div class="stock-row">' +
      '<div style="position: relative; width: 41px; height: 41px; align-self: center;">' +
        '<button data-act="pickStockLogo" data-arg="' + i + '" title="Afbeelding uploaden" style="cursor: pointer; width: 41px; height: 41px; border-radius: 999px; border: 2px solid rgba(242,236,220,0.3); background: #faf6ec; padding: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; box-sizing: border-box;">' + sImgInner + '</button>' +
        sImgRemove +
      '</div>' +
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
    '</div>';
  }).join('');
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
    '<div class="lbl" style="margin-bottom: 8px;">EMBLEEM / WATERMERK (achter het Oranje-paneel)</div>' +
    '<input type="file" id="emblem-input" accept="image/*" style="display: none;">' +
    '<div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap;">' +
      '<div style="width: 72px; height: 72px; flex-shrink: 0; border: 2px solid rgba(242,236,220,0.25); border-radius: 12px; background: #2c3e35; display: flex; align-items: center; justify-content: center; overflow: hidden;">' +
        (t.emblem
          ? '<div style="width: 80%; height: 80%; background: #f4a259; -webkit-mask: url(' + t.emblem + ') center/contain no-repeat; mask: url(' + t.emblem + ') center/contain no-repeat;"></div>'
          : '<div style="width: 84%; height: 84%; opacity: 0.85;">' + D.LION_SVG + '</div>') +
      '</div>' +
      '<button class="btn-dash" data-act="pickEmblem" style="font-size: 18px; padding: 8px 16px;">' + (t.emblem ? 'ANDER EMBLEEM' : 'EMBLEEM UPLOADEN') + '</button>' +
      (t.emblem ? '<button class="btn-ghost" data-act="rmEmblem">Terug naar de leeuw</button>' : '') +
      '<div style="font-size: 14px; color: rgba(242,236,220,0.5); line-height: 1.5; flex: 1; min-width: 160px;">Elk logo kan — ook zwart-op-gekleurd zoals het KNVB-logo; de achtergrond wordt automatisch weggehaald en het in diapositief oranje getoond. Leeg = de ingebouwde leeuw.</div>' +
    '</div>' +
    '<div class="status" data-status="emblem"' + (app.emblemStatus ? '' : ' style="display:none;"') + '>' + esc(app.emblemStatus) + '</div>' +
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

function cardRadio(d) {
  const r = d.radio || {};
  const init = (r.name || 'RH').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '·';
  const logoInner = r.logo
    ? '<img src="' + esc(r.logo) + '" alt="" style="width: 100%; height: 100%; object-fit: cover;">'
    : '<div style="font-family: \'Amatic SC\', cursive; font-weight: 700; font-size: 19px; line-height: 1; color: #2c3e35;">' + esc(init) + '</div>';
  const logoRemove = r.logo
    ? '<button data-act="rmRadioLogo" aria-label="Logo verwijderen" title="Logo verwijderen" style="position: absolute; top: -5px; right: -5px; cursor: pointer; width: 17px; height: 17px; border-radius: 999px; border: none; background: rgba(28,24,18,0.85); color: #f2ecdc; font-size: 9px; line-height: 1; padding: 0;">✕</button>'
    : '';
  // Zenderkeuze: opties uit de laatst opgehaalde lijst (+ huidige slug)
  const opts = app.radioChannels.slice();
  if (r.slug && !opts.some((c) => c.slug === r.slug)) opts.unshift({ slug: r.slug, name: r.slug });
  const channelSelect = opts.length
    ? '<select id="radio-channel" class="in" style="width: 100%;">' +
        '<option value="">— kies een zender —</option>' +
        opts.map((c) => '<option value="' + esc(c.slug) + '"' + (r.slug === c.slug ? ' selected' : '') + '>' + esc(c.name || c.slug) + '</option>').join('') +
      '</select>'
    : '<div style="font-size: 14px; color: rgba(242,236,220,0.5); padding: 9px 0;">Vul het adres in en klik op ZOEK ZENDERS.</div>';
  return '<div class="card">' +
    '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">' +
      '<div class="card-h">RADIO — RETROHEAD</div>' +
      toggleHtml('toggleRadio', r.enabled, 'Radio tonen') +
    '</div>' +
    '<div style="font-size: 14px; color: rgba(242,236,220,0.55); margin-bottom: 14px; line-height: 1.5;">Toont de programmering van je eigen RetroHead-zender als extra weergave in het midden van de TV.</div>' +
    '<div class="row2" style="gap: 12px; align-items: end;">' +
      '<div><div class="lbl">RETROHEAD-ADRES</div>' +
        '<div style="display: flex; gap: 10px;">' +
          '<input class="in" data-bind="radio.base" value="' + esc(r.base) + '" placeholder="bv. http://192.168.1.x:8080" style="flex: 1;">' +
          '<button class="btn-orange" data-act="radioChannels">ZOEK ZENDERS</button>' +
        '</div>' +
      '</div>' +
      '<div><div class="lbl">ZENDER</div>' + channelSelect + '</div>' +
    '</div>' +
    '<div class="status" data-status="radio"' + (app.radioStatus ? '' : ' style="display:none;"') + '>' + esc(app.radioStatus) + '</div>' +
    '<div class="row2" style="gap: 12px; margin-top: 16px; align-items: end;">' +
      '<div><div class="lbl">WEERGAVENAAM (leeg = naam van de zender)</div>' +
        '<input class="in" data-bind="radio.name" value="' + esc(r.name) + '" placeholder="RetroHead" style="width: 100%;"></div>' +
      '<div><div class="lbl">ONDERTITEL</div>' +
        '<input class="in" data-bind="radio.sub" value="' + esc(r.sub) + '" placeholder="nu op de buis" style="width: 100%;"></div>' +
    '</div>' +
    '<div style="display: flex; align-items: center; gap: 14px; margin-top: 16px;">' +
      '<div style="position: relative; width: 48px; height: 48px;">' +
        '<button data-act="pickRadioLogo" title="Eigen logo uploaden" style="cursor: pointer; width: 48px; height: 48px; border-radius: 12px; border: 2px solid rgba(242,236,220,0.3); background: #faf6ec; padding: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; box-sizing: border-box;">' + logoInner + '</button>' +
        logoRemove +
      '</div>' +
      '<div style="font-size: 14px; color: rgba(242,236,220,0.5); line-height: 1.5;">Eigen logo (optioneel) — leeg = het logo van de zender zelf. De TV ververst de programmering elke 30 seconden.</div>' +
    '</div>' +
  '</div>';
}

function eventLink(ev) {
  const base = (app.mail && app.mail.publicBase) || (location.origin);
  return base.replace(/\/+$/, '') + '/e/' + encodeURIComponent(ev.id) + '?t=' + encodeURIComponent(ev.token);
}

function cardEvents(d) {
  const evs = d.events || [];
  const rows = evs.map((ev, i) => {
    const rsvps = ev.rsvps || [];
    const coming = rsvps.filter((r) => r.status !== 'nee').reduce((n, r) => n + (Number(r.count) || 1), 0);
    const ja = rsvps.filter((r) => r.status === 'ja').length;
    const msch = rsvps.filter((r) => r.status === 'misschien').length;
    const guestRows = rsvps.length
      ? rsvps.map((r) => {
          const tag = r.status === 'nee' ? 'komt niet' : (r.status === 'misschien' ? 'misschien' : 'komt');
          const col = r.status === 'nee' ? 'rgba(242,236,220,0.45)' : (r.status === 'misschien' ? '#f4a259' : '#8fd6a0');
          return '<div style="display: flex; align-items: baseline; gap: 10px; padding: 5px 2px; border-bottom: 1px dashed rgba(242,236,220,0.15);">' +
            '<div style="flex: 1; min-width: 0; color: #f2ecdc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(r.name) + (Number(r.count) > 1 ? ' <span style="color: rgba(242,236,220,0.55);">+' + (r.count - 1) + '</span>' : '') + (r.note ? ' <span style="font-family: \'Shadows Into Light Two\', cursive; color: rgba(242,236,220,0.6);">“' + esc(r.note) + '”</span>' : '') + '</div>' +
            '<div style="font-size: 13px; color: ' + col + '; flex-shrink: 0;">' + tag + '</div>' +
          '</div>';
        }).join('')
      : '<div style="font-size: 14px; color: rgba(242,236,220,0.45); padding: 6px 2px;">Nog niemand aangemeld.</div>';
    const msg = app.eventMsg[ev.id];
    return '<div style="border: 2px solid rgba(242,236,220,0.2); border-radius: 12px; padding: 18px 20px; margin-bottom: 14px;">' +
      '<div class="row2" style="gap: 12px;">' +
        '<div><div class="lbl">TITEL</div><input class="in" data-bind="events.' + i + '.title" value="' + esc(ev.title) + '" style="width: 100%;"></div>' +
        '<div><div class="lbl">WANNEER</div><input class="in" type="datetime-local" data-bind="events.' + i + '.whenISO" value="' + esc(ev.whenISO) + '" style="width: 100%;"></div>' +
      '</div>' +
      '<div class="lbl" style="margin-top: 12px;">OMSCHRIJVING</div>' +
      '<textarea class="in" data-bind="events.' + i + '.desc" rows="2" style="width: 100%; resize: vertical;">' + esc(ev.desc) + '</textarea>' +
      '<div style="display: flex; align-items: center; gap: 18px; flex-wrap: wrap; margin-top: 12px;">' +
        '<div style="display: flex; align-items: center; gap: 8px;"><span style="font-size: 14px; color: rgba(242,236,220,0.6);">teller op TV</span>' + toggleHtml('evTv', ev.showOnTv !== false, 'Op TV') .replace('data-act="evTv"', 'data-act="evTv" data-arg="' + i + '"') + '</div>' +
        '<div style="display: flex; align-items: center; gap: 8px;"><span style="font-size: 14px; color: rgba(242,236,220,0.6);">aanmelden gesloten</span>' + toggleHtml('evClosed', !!ev.closed, 'Gesloten').replace('data-act="evClosed"', 'data-act="evClosed" data-arg="' + i + '"') + '</div>' +
        '<button class="btn-x" data-act="rmEvent" data-arg="' + i + '" title="Evenement verwijderen" style="margin-left: auto;">✕</button>' +
      '</div>' +
      '<div class="lbl" style="margin-top: 14px;">DEELBARE LINK (plak in je WhatsApp-/Discord-groep)</div>' +
      '<div style="display: flex; gap: 10px; align-items: center;">' +
        '<input class="in" readonly value="' + esc(eventLink(ev)) + '" style="flex: 1; user-select: all;" onclick="this.select()">' +
        '<button class="btn-orange" data-act="copyLink" data-arg="' + i + '">KOPIEER</button>' +
      '</div>' +
      '<div class="lbl" style="margin-top: 14px;">UITNODIGEN PER E-MAIL (één adres per regel)</div>' +
      '<textarea class="in" data-bind="events.' + i + '.inviteList" rows="2" placeholder="naam@voorbeeld.nl" style="width: 100%; resize: vertical;">' + esc(ev.inviteList || '') + '</textarea>' +
      '<div style="display: flex; align-items: center; gap: 14px; margin-top: 10px; flex-wrap: wrap;">' +
        '<button class="btn-dash" data-act="invite" data-arg="' + i + '" style="font-size: 18px;">VERSTUUR UITNODIGINGEN</button>' +
        (msg ? '<div class="status" style="margin: 0;">' + esc(msg) + '</div>' : '') +
      '</div>' +
      '<div class="lbl" style="margin-top: 16px;">AANGEMELD · ' + coming + ' komen <span style="color: rgba(242,236,220,0.45); letter-spacing: 0;">(' + ja + '× ja, ' + msch + '× misschien)</span></div>' +
      '<div>' + guestRows + '</div>' +
    '</div>';
  }).join('');
  return '<div class="card">' +
    '<div class="card-h" style="margin-bottom: 6px;">EVENEMENTEN</div>' +
    '<div style="font-size: 14px; color: rgba(242,236,220,0.55); margin-bottom: 16px; line-height: 1.5;">Plan een bar-avond, deel de link of mail een uitnodiging; gasten laten hun naam achter en je ziet hier wie er komt.</div>' +
    rows +
    '<button class="btn-dash" data-act="addEvent">+ EVENEMENT TOEVOEGEN</button>' +
  '</div>';
}

function cardMail() {
  const m = app.mail || {};
  return '<div class="card">' +
    '<div class="card-h" style="margin-bottom: 6px;">MAILSERVER (voor uitnodigingen)</div>' +
    '<div style="font-size: 14px; color: rgba(242,236,220,0.55); margin-bottom: 16px; line-height: 1.5;">Nodig om uitnodigingen te mailen. Niet verplicht — de deelbare link werkt altijd. Gegevens worden los van de rest opgeslagen en nooit op de TV of publieke pagina getoond.</div>' +
    '<div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px;">' +
      '<div><div class="lbl">SMTP-SERVER</div><input class="in" data-mail="host" value="' + esc(m.host || '') + '" placeholder="mail.voorbeeld.nl" style="width: 100%;"></div>' +
      '<div><div class="lbl">POORT</div><input class="in" data-mail="port" value="' + esc(m.port || 587) + '" placeholder="587" style="width: 100%;"></div>' +
      '<div><div class="lbl">TLS</div>' +
        '<button data-act="mailSecure" aria-label="Directe TLS" style="cursor: pointer; border: none; width: 52px; height: 30px; border-radius: 999px; background: ' + (m.secure ? '#f4a259' : 'rgba(242,236,220,0.25)') + '; position: relative; padding: 0; margin-top: 4px;"><div style="position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 999px; background: #f2ecdc; transform: ' + (m.secure ? 'translateX(22px)' : 'translateX(0)') + '; transition: transform 0.2s ease;"></div></button>' +
      '</div>' +
    '</div>' +
    '<div class="row2" style="gap: 12px; margin-top: 12px;">' +
      '<div><div class="lbl">GEBRUIKERSNAAM</div><input class="in" data-mail="user" value="' + esc(m.user || '') + '" placeholder="naam@voorbeeld.nl" style="width: 100%;"></div>' +
      '<div><div class="lbl">WACHTWOORD' + (m.hasPass ? ' (opgeslagen — leeg laten = ongewijzigd)' : '') + '</div><input class="in" type="password" data-mail="pass" value="" placeholder="' + (m.hasPass ? '••••••••' : '') + '" style="width: 100%;"></div>' +
    '</div>' +
    '<div class="row2" style="gap: 12px; margin-top: 12px;">' +
      '<div><div class="lbl">AFZENDER</div><input class="in" data-mail="from" value="' + esc(m.from || '') + '" placeholder="De Fles <bar@voorbeeld.nl>" style="width: 100%;"></div>' +
      '<div><div class="lbl">PUBLIEK ADRES (voor de links in de mail)</div><input class="in" data-mail="publicBase" value="' + esc(m.publicBase || '') + '" placeholder="https://defles.voorbeeld.nl" style="width: 100%;"></div>' +
    '</div>' +
    '<div style="display: flex; align-items: center; gap: 14px; margin-top: 14px; flex-wrap: wrap;">' +
      '<input class="in" id="mail-test-to" placeholder="testmail naar…" style="width: 220px;">' +
      '<button class="btn-orange" data-act="mailTest">TEST</button>' +
      '<div class="status" data-status="mail"' + (app.mailStatus ? '' : ' style="display:none;"') + '>' + esc(app.mailStatus) + '</div>' +
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
      cardTap(d) + cardVoorraad(d) + cardFotos(d) + cardThema(d) + cardRadio(d) + cardEvents(d) + cardMail() +
      '<div style="display: flex; justify-content: flex-end; padding: 4px;">' +
        '<button class="btn-ghost" data-act="reset">Terug naar voorbeelddata</button>' +
      '</div>' +
    '</div>';
}

// Re-render met behoud van focus + cursorpositie (voor updates van andere apparaten)
function renderPreservingFocus() {
  const act = document.activeElement;
  const attr = act && (act.dataset.bind ? 'data-bind' : act.dataset.local ? 'data-local' : act.dataset.mail ? 'data-mail' : null);
  const key = attr && act.getAttribute(attr);
  const selStart = act && act.selectionStart != null ? act.selectionStart : null;
  render();
  if (key) {
    const sel = '[' + attr + '="' + key + '"]';
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

// Avatar-editor — slepen en zoomen binnen een rond masker, daarna vierkant
// bijgesneden (240px). Hergebruikt voor bierlogo's én voorraad-afbeeldingen.
let pendingCrop = null; // (dataURL) => void, ingesteld vlak voor het kiezen

function openLogoEditor(file, onSave) {
  const M = 280, OUT = 240;            // maskergrootte op scherm / uitvoer in px
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onerror = () => URL.revokeObjectURL(url);
  img.onload = () => {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) { URL.revokeObjectURL(url); return; }
    const minS = Math.max(M / iw, M / ih); // kleinste schaal die het masker vult
    let s = minS;
    let x = (M - iw * s) / 2, y = (M - ih * s) / 2;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position: fixed; inset: 0; z-index: 50; background: rgba(15,24,20,0.72); display: flex; align-items: center; justify-content: center; padding: 20px;';
    overlay.innerHTML =
      '<div style="background: #2c3e35; border: 2px solid rgba(242,236,220,0.35); border-radius: 14px; padding: 24px 28px; width: 340px; max-width: 100%; box-shadow: 0 18px 60px rgba(0,0,0,0.5); box-sizing: border-box;">' +
        '<div class="card-h" style="margin-bottom: 2px;">LOGO BIJSNIJDEN</div>' +
        '<div style="font-size: 14px; color: rgba(242,236,220,0.55); margin-bottom: 16px;">sleep om te verschuiven · schuif of scroll om te zoomen</div>' +
        '<div data-le-mask style="position: relative; width: ' + M + 'px; height: ' + M + 'px; margin: 0 auto; border-radius: 999px; overflow: hidden; background: #faf6ec; border: 2px solid rgba(242,236,220,0.35); cursor: grab; touch-action: none;">' +
          '<img data-le-img alt="" draggable="false" style="position: absolute; left: 0; top: 0; max-width: none; user-select: none; pointer-events: none;">' +
        '</div>' +
        '<input data-le-zoom type="range" min="0" max="100" value="0" style="display: block; width: ' + M + 'px; margin: 18px auto 0; accent-color: #f4a259;">' +
        '<div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px;">' +
          '<button data-le-cancel class="btn-ghost">Annuleren</button>' +
          '<button data-le-save class="btn-orange" style="border-radius: 999px;">GEBRUIK LOGO</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    const maskEl = overlay.querySelector('[data-le-mask]');
    const imEl = overlay.querySelector('[data-le-img]');
    const zoomEl = overlay.querySelector('[data-le-zoom]');
    imEl.src = url;

    function apply() {
      const dw = iw * s, dh = ih * s;
      x = Math.min(0, Math.max(M - dw, x));   // masker blijft altijd gevuld
      y = Math.min(0, Math.max(M - dh, y));
      imEl.style.width = dw + 'px';
      imEl.style.left = x + 'px';
      imEl.style.top = y + 'px';
    }
    function setZoom(frac, cx, cy) {           // (cx,cy) = ankerpunt in het masker
      const ns = minS * (1 + 3 * frac);        // 1× t/m 4×
      const px = (cx - x) / s, py = (cy - y) / s;
      s = ns;
      x = cx - px * s;
      y = cy - py * s;
      apply();
    }
    zoomEl.addEventListener('input', () => setZoom(zoomEl.value / 100, M / 2, M / 2));
    maskEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const v = Math.max(0, Math.min(100, Number(zoomEl.value) - Math.sign(e.deltaY) * 6));
      zoomEl.value = v;
      const r = maskEl.getBoundingClientRect();
      setZoom(v / 100, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    let drag = null;
    maskEl.addEventListener('pointerdown', (e) => {
      drag = { px: e.clientX, py: e.clientY };
      maskEl.setPointerCapture(e.pointerId);
      maskEl.style.cursor = 'grabbing';
    });
    maskEl.addEventListener('pointermove', (e) => {
      if (!drag) return;
      x += e.clientX - drag.px;
      y += e.clientY - drag.py;
      drag = { px: e.clientX, py: e.clientY };
      apply();
    });
    const endDrag = () => { drag = null; maskEl.style.cursor = 'grab'; };
    maskEl.addEventListener('pointerup', endDrag);
    maskEl.addEventListener('pointercancel', endDrag);

    function close() { URL.revokeObjectURL(url); overlay.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-le-cancel]').addEventListener('click', close);
    overlay.querySelector('[data-le-save]').addEventListener('click', () => {
      const cv = document.createElement('canvas');
      cv.width = OUT; cv.height = OUT;
      const ctx = cv.getContext('2d');
      const isPng = /png/i.test(file.type);
      if (!isPng) { ctx.fillStyle = '#faf6ec'; ctx.fillRect(0, 0, OUT, OUT); }
      ctx.drawImage(img, -x / s, -y / s, M / s, M / s, 0, 0, OUT, OUT);
      const src = isPng ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.85);
      if (onSave) onSave(src);
      close();
    });
    apply();
  };
  img.src = url;
}

function addLogoFile(fileList) {
  const f = (fileList && fileList[0]) || null;
  if (!f || !pendingCrop) return;
  openLogoEditor(f, pendingCrop);
  pendingCrop = null;
}

// Embleem/watermerk (bv. de KNVB-leeuw): transparante PNG, verkleind opgeslagen
// (geen bijsnijden — de transparantie bepaalt de vorm; TV kleurt het oranje).
async function searchRadioChannels() {
  const base = (client.get().radio.base || '').trim();
  if (!base) { setStatus('radio', 'Vul eerst het RetroHead-adres in.'); return; }
  setStatus('radio', 'Zenders zoeken…');
  try {
    await client.flush(); // adres eerst server-side opslaan; de server leest het daar
    const res = await fetch('/api/radio/channels');
    const j = await res.json();
    if (!res.ok || j.error) throw new Error(j.error || 'http ' + res.status);
    app.radioChannels = (j.channels || []).filter((c) => c.enabled !== false);
    setStatus('radio', app.radioChannels.length ? app.radioChannels.length + ' zender(s) gevonden ✓' : 'Verbonden, maar geen zenders gevonden.');
    render();
  } catch (e) {
    setStatus('radio', 'Geen verbinding met RetroHead — controleer het adres en of de server het kan bereiken.');
  }
}

// Embleem/watermerk (bv. de KNVB-leeuw) omzetten naar een transparant silhouet.
// Werkt voor transparante PNG's én voor logo's met een effen achtergrond
// (zoals zwart-op-oranje): de achtergrond wordt op kleur weggehaald en de rand
// bijgesneden. De TV toont het silhouet vervolgens in diapositief oranje.
async function inviteEvent(i) {
  const ev = client.get().events[i];
  const emails = (ev.inviteList || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  if (!emails.length) { app.eventMsg[ev.id] = 'Vul eerst e-mailadressen in.'; render(); return; }
  await client.flush(); // zorg dat de server het laatste evenement (token) kent
  app.eventMsg[ev.id] = 'Versturen…'; render();
  try {
    const res = await fetch('/api/events/' + encodeURIComponent(ev.id) + '/invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails })
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'fout');
    app.eventMsg[ev.id] = j.sent + ' verstuurd ✓' + (j.failed && j.failed.length ? ' · ' + j.failed.length + ' mislukt' : '');
  } catch (e) {
    app.eventMsg[ev.id] = 'Mislukt: ' + (e.message || 'controleer de mailserver');
  }
  render();
}

async function mailTest() {
  const el = document.getElementById('mail-test-to');
  const to = el ? el.value.trim() : '';
  if (!to) { setStatus('mail', 'Vul een e-mailadres in.'); return; }
  setStatus('mail', 'Testmail versturen…');
  try {
    await client.flush();
    const res = await fetch('/api/mail/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to }) });
    const j = await res.json();
    setStatus('mail', res.ok ? 'Testmail verstuurd ✓' : (j.error || 'verzenden mislukt'));
  } catch (e) { setStatus('mail', 'Verzenden mislukt — controleer de instellingen.'); }
}

async function addEmblemFile(fileList) {
  const f = (fileList && fileList[0]) || null;
  if (!f) return;
  setStatus('emblem', 'Embleem verwerken…');
  try {
    const url = URL.createObjectURL(f);
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im); im.onerror = rej; im.src = url;
    });
    const maxSide = 512;
    const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
    const cw = Math.round(img.width * ratio), ch = Math.round(img.height * ratio);
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, cw, ch);
    URL.revokeObjectURL(url);

    const id = ctx.getImageData(0, 0, cw, ch);
    const px = id.data;
    // Heeft de afbeelding al echte transparantie? Dan die als vorm gebruiken.
    let transparent = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 240) transparent++;
    const hasAlpha = transparent > cw * ch * 0.02;

    if (!hasAlpha) {
      // Achtergrondkleur schatten uit de vier hoeken en op kleurafstand weghalen
      const corners = [[0, 0], [cw - 1, 0], [0, ch - 1], [cw - 1, ch - 1]];
      let br = 0, bg = 0, bb = 0;
      for (const [x, y] of corners) { const o = (y * cw + x) * 4; br += px[o]; bg += px[o + 1]; bb += px[o + 2]; }
      br /= 4; bg /= 4; bb /= 4;
      const lo = 55, hi = 120; // kleurafstand: < lo = achtergrond, > hi = vorm
      for (let i = 0; i < px.length; i += 4) {
        const d = Math.sqrt((px[i] - br) ** 2 + (px[i + 1] - bg) ** 2 + (px[i + 2] - bb) ** 2);
        let a = (d - lo) / (hi - lo);
        a = a < 0 ? 0 : a > 1 ? 1 : a;
        px[i + 3] = Math.round(a * 255);
      }
      ctx.putImageData(id, 0, 0);
    }

    // Bijsnijden tot de zichtbare vorm zodat het watermerk groot vult
    let minX = cw, minY = ch, maxX = 0, maxY = 0, any = false;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (px[(y * cw + x) * 4 + 3] > 24) {
          any = true;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    let out = cv;
    if (any) {
      const m = 6, sx = Math.max(0, minX - m), sy = Math.max(0, minY - m);
      const sw = Math.min(cw - 1, maxX + m) - sx + 1, sh = Math.min(ch - 1, maxY + m) - sy + 1;
      const t = document.createElement('canvas');
      t.width = sw; t.height = sh;
      t.getContext('2d').drawImage(cv, sx, sy, sw, sh, 0, 0, sw, sh);
      out = t;
    }
    mut((d) => { d.theme.emblem = out.toDataURL('image/png'); }, true);
    setStatus('emblem', '');
  } catch (e) {
    setStatus('emblem', 'Kon het embleem niet verwerken — probeer een ander bestand.');
  }
}

// ---------- events (delegatie) ----------

let mailSaveTimer = null;
function scheduleMailSave() {
  clearTimeout(mailSaveTimer);
  mailSaveTimer = setTimeout(async () => {
    try {
      const res = await fetch('/api/mail', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(app.mail || {})
      });
      app.mail = await res.json(); // genormaliseerde, gemaskeerde versie terug
    } catch (e) { /* offline: volgende wijziging probeert opnieuw */ }
  }, 600);
}

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'file-input') return;
  if (el.dataset.mail) { app.mail = app.mail || {}; app.mail[el.dataset.mail] = el.value; scheduleMailSave(); return; }
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
  if (e.target.id === 'emblem-input') {
    addEmblemFile(e.target.files);
    e.target.value = '';
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'radio-channel') {
    const slug = e.target.value;
    const ch = app.radioChannels.find((c) => c.slug === slug);
    mut((d) => { d.radio.slug = slug; if (ch && !(d.radio.name || '').trim()) d.radio.name = ch.name || ''; }, true);
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
    case 'panelMode': mut((d) => { d.panelMode = arg; }, true); break;
    case 'mode': mut((d) => { d.music.mode = arg; }, true); break;
    case 'toggleMusic': mut((d) => { d.showMusic = !d.showMusic; }, true); break;
    case 'toggleTheme': mut((d) => { d.theme.enabled = !d.theme.enabled; }, true); break;
    case 'addTap': mut((d) => { d.taps.push({ id: D.uid(), name: '', style: '', price: '', level: 100, onTap: true }); }, true); break;
    case 'rmTap': mut((d) => { d.taps.splice(i, 1); }, true); break;
    case 'toggleTap': mut((d) => { d.taps[i].onTap = !(d.taps[i].onTap !== false); }, true); break;
    case 'pickLogo': { pendingCrop = (src) => mut((d) => { if (d.taps[i]) d.taps[i].logo = src; }, true); const f = document.getElementById('logo-input'); if (f) f.click(); break; }
    case 'rmLogo': mut((d) => { delete d.taps[i].logo; }, true); break;
    case 'pickStockLogo': { pendingCrop = (src) => mut((d) => { if (d.stock[i]) d.stock[i].img = src; }, true); const f = document.getElementById('logo-input'); if (f) f.click(); break; }
    case 'rmStockLogo': mut((d) => { delete d.stock[i].img; }, true); break;
    case 'pickEmblem': { const f = document.getElementById('emblem-input'); if (f) f.click(); break; }
    case 'rmEmblem': mut((d) => { d.theme.emblem = null; }, true); break;
    case 'toggleRadio': mut((d) => { d.radio.enabled = !d.radio.enabled; }, true); break;
    case 'radioChannels': searchRadioChannels(); break;
    case 'addEvent': mut((d) => { if (!d.events) d.events = []; d.events.push({ id: D.uid(), title: 'Nieuwe avond', whenISO: '', desc: '', token: D.token(), showOnTv: true, closed: false, inviteList: '', rsvps: [] }); }, true); break;
    case 'rmEvent': { if (window.confirm('Dit evenement en alle aanmeldingen verwijderen?')) mut((d) => { d.events.splice(i, 1); }, true); break; }
    case 'evTv': mut((d) => { d.events[i].showOnTv = !(d.events[i].showOnTv !== false); }, true); break;
    case 'evClosed': mut((d) => { d.events[i].closed = !d.events[i].closed; }, true); break;
    case 'copyLink': {
      const ev = client.get().events[i];
      const link = eventLink(ev);
      const done = () => { app.eventMsg[ev.id] = 'Link gekopieerd ✓'; render(); setTimeout(() => { delete app.eventMsg[ev.id]; render(); }, 2500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, done); else done();
      break;
    }
    case 'invite': inviteEvent(i); break;
    case 'mailSecure': { app.mail = app.mail || {}; app.mail.secure = !app.mail.secure; scheduleMailSave(); render(); break; }
    case 'mailTest': mailTest(); break;
    case 'pickRadioLogo': { pendingCrop = (src) => mut((d) => { d.radio.logo = src; }, true); const f = document.getElementById('logo-input'); if (f) f.click(); break; }
    case 'rmRadioLogo': mut((d) => { d.radio.logo = null; }, true); break;
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
  try { app.mail = await (await fetch('/api/mail')).json(); } catch (e) { app.mail = {}; }

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
