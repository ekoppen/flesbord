import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, albumByToken, albumStatus, freshAlbum } from '../public/defles-data.js';

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

test('freshAlbum: nieuwste binnen het venster én niet verlopen', () => {
  const albums = [
    mk({ id: 'oud', createdAt: 1000, expiresAt: 9_999_999 }),
    mk({ id: 'nieuw', createdAt: 4000, expiresAt: 9_999_999 })
  ];
  assert.equal(freshAlbum(albums, 5000, 2000).id, 'nieuw');
  assert.equal(freshAlbum(albums, 8000, 2000), null);
  assert.equal(freshAlbum([mk({ createdAt: 4000, expiresAt: 4500 })], 5000, 2000), null);
  assert.equal(freshAlbum([], 5000, 2000), null);
});
