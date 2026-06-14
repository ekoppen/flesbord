import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, albumByToken, albumStatus, activeAlbum } from '../public/defles-data.js';

const mk = (over) => Object.assign({ id: 'a', token: 't', title: 'x', whenISO: '', createdAt: 1000, expiresAt: 5000, eventId: '', photos: [] }, over);

test('DEFAULT_STATE.albums is een lege lijst', () => {
  assert.deepEqual(DEFAULT_STATE.albums, []);
});

test('albumByToken vindt op token, anders null', () => {
  const albums = [mk({ token: 'aaa' }), mk({ token: 'bbb' })];
  assert.equal(albumByToken(albums, 'bbb').token, 'bbb');
  assert.equal(albumByToken(albums, 'zzz'), null);
  assert.equal(albumByToken(albums, ''), null);
  assert.equal(albumByToken(undefined, 'aaa'), null);
});

test('albumStatus: ok vóór verval, expired erna, unknown bij null', () => {
  const al = mk({ expiresAt: 5000 });
  assert.equal(albumStatus(al, 4999), 'ok');
  assert.equal(albumStatus(al, 5000), 'expired');
  assert.equal(albumStatus(al, 6000), 'expired');
  assert.equal(albumStatus(null, 1), 'unknown');
});

test('activeAlbum: nieuwste niet-verlopen album met showOnTv', () => {
  const albums = [
    mk({ id: 'a', createdAt: 1000, expiresAt: 9_999_999, showOnTv: true }),
    mk({ id: 'b', createdAt: 4000, expiresAt: 9_999_999, showOnTv: true }),
    mk({ id: 'c', createdAt: 5000, expiresAt: 9_999_999, showOnTv: false })
  ];
  assert.equal(activeAlbum(albums, 5000).id, 'b');                 // nieuwste mét showOnTv (c staat uit)
  assert.equal(activeAlbum([mk({ showOnTv: false })], 5000), null);
  assert.equal(activeAlbum([mk({ createdAt: 1, expiresAt: 2, showOnTv: true })], 5000), null); // verlopen
  assert.equal(activeAlbum([], 5000), null);
});
