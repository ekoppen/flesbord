import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, partyLinkStatus, usedPhotoNames } from '../public/defles-data.js';

test('DEFAULT_STATE.party heeft de juiste vorm', () => {
  assert.deepEqual(DEFAULT_STATE.party, { token: null, expiresAt: 0, photos: [] });
});

test('partyLinkStatus: ok wanneer token klopt en niet verlopen', () => {
  const party = { token: 'abc', expiresAt: 1000, photos: [] };
  assert.equal(partyLinkStatus(party, 'abc', 500), 'ok');
});

test('partyLinkStatus: expired wanneer token klopt maar voorbij vervaltijd', () => {
  const party = { token: 'abc', expiresAt: 1000, photos: [] };
  assert.equal(partyLinkStatus(party, 'abc', 1000), 'expired');
  assert.equal(partyLinkStatus(party, 'abc', 2000), 'expired');
});

test('partyLinkStatus: unknown bij ontbrekend of ander token', () => {
  const party = { token: 'abc', expiresAt: 1000, photos: [] };
  assert.equal(partyLinkStatus(party, 'xyz', 500), 'unknown');
  assert.equal(partyLinkStatus(party, '', 500), 'unknown');
  assert.equal(partyLinkStatus({ token: null, expiresAt: 0, photos: [] }, 'abc', 500), 'unknown');
  assert.equal(partyLinkStatus(undefined, 'abc', 500), 'unknown');
});

test('usedPhotoNames verzamelt curated, party én album-foto-bestandsnamen', () => {
  const state = {
    photos: [{ src: '/photos/aaa.jpg' }, { src: 'https://picsum.photos/x' }],
    party: { photos: [{ src: '/photos/bbb.webp' }] },
    albums: [{ photos: [{ src: '/photos/ccc.png' }, { src: '/photos/ddd.jpg' }] }]
  };
  const names = usedPhotoNames(state);
  assert.ok(names.has('aaa.jpg'));
  assert.ok(names.has('bbb.webp'));
  assert.ok(names.has('ccc.png'));
  assert.ok(names.has('ddd.jpg'));
  assert.equal(names.has('x'), false);
  assert.equal(names.size, 4);
});

test('usedPhotoNames is robuust bij ontbrekende velden', () => {
  assert.equal(usedPhotoNames({}).size, 0);
  assert.equal(usedPhotoNames({ photos: null, party: null }).size, 0);
  assert.equal(usedPhotoNames(null).size, 0);
  assert.equal(usedPhotoNames(undefined).size, 0);
});

