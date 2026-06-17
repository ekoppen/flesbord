import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScore, computeStandings, scheduleWindow } from '../public/defles-data.js';

test('parseScore leest diverse formaten', () => {
  assert.deepEqual(parseScore('2 – 2'), [2, 2]);
  assert.deepEqual(parseScore('3-1'), [3, 1]);
  assert.deepEqual(parseScore('0:4'), [0, 4]);
  assert.equal(parseScore(''), null);
  assert.equal(parseScore('binnenkort'), null);
  assert.equal(parseScore(null), null);
});

test('computeStandings telt punten uit gespeelde wedstrijden', () => {
  const teams = [{ team: 'Nederland' }, { team: 'Japan' }, { team: 'Zweden' }, { team: 'Tunesië' }];
  const matches = [
    { home: 'Nederland', away: 'Japan', score: '2 – 2' },
    { home: 'Nederland', away: 'Zweden', score: '3 – 1' },
    { home: 'Tunesië', away: 'Nederland', score: '' }   // nog niet gespeeld
  ];
  const rows = computeStandings(matches, teams);
  const by = Object.fromEntries(rows.map((r) => [r.team, r]));
  assert.equal(by['Nederland'].g, 2);
  assert.equal(by['Nederland'].pts, 4);   // gelijkspel (1) + winst (3)
  assert.equal(by['Japan'].g, 1);
  assert.equal(by['Japan'].pts, 1);
  assert.equal(by['Zweden'].pts, 0);
  assert.equal(by['Tunesië'].g, 0);       // ongespeelde wedstrijd telt niet
  assert.equal(rows[0].team, 'Nederland'); // meeste punten bovenaan
});

test('computeStandings: gelijke teams behouden de seed-volgorde (niet alfabetisch)', () => {
  const teams = [{ team: 'Nederland' }, { team: 'Japan' }];
  const rows = computeStandings([{ home: 'Nederland', away: 'Japan', score: '1 – 1' }], teams);
  assert.equal(rows[0].team, 'Nederland');
  assert.equal(rows[1].team, 'Japan');
});

test('computeStandings neemt teams uit de wedstrijden als de seedlijst leeg is', () => {
  const rows = computeStandings([{ home: 'A', away: 'B', score: '1 – 0' }], []);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].team, 'A');
  assert.equal(rows[0].pts, 3);
});

test('scheduleWindow rolt mee: laatste uitslag + komende, chronologisch', () => {
  const NOW = new Date('2026-06-17T22:00:00').getTime();
  const matches = [
    { date: '2026-06-14', time: '22:00', home: 'Nederland', away: 'Japan', score: '2 – 2' },
    { date: '2026-06-20', time: '19:00', home: 'Nederland', away: 'Zweden', score: '' },
    { date: '2026-06-26', time: '01:00', home: 'Tunesië', away: 'Nederland', score: '' }
  ];
  const w = scheduleWindow(matches, NOW, 4);
  assert.equal(w.length, 3);
  assert.equal(w[0].date, '2026-06-14'); // laatste uitslag voorop
  assert.equal(w[1].date, '2026-06-20'); // dan de komende
  assert.equal(w[2].date, '2026-06-26');
});

test('scheduleWindow laat oudere gespeelde wedstrijden vallen', () => {
  const NOW = new Date('2026-06-27T12:00:00').getTime();
  const matches = [
    { date: '2026-06-14', time: '22:00', home: 'Nederland', away: 'Japan', score: '2 – 2' },
    { date: '2026-06-20', time: '19:00', home: 'Nederland', away: 'Zweden', score: '1 – 0' },
    { date: '2026-06-26', time: '01:00', home: 'Tunesië', away: 'Nederland', score: '0 – 3' }
  ];
  const w = scheduleWindow(matches, NOW, 4);
  assert.equal(w.length, 1);              // alles gespeeld -> alleen de laatste uitslag
  assert.equal(w[0].date, '2026-06-26');
});
