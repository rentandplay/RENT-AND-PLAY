import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationSound } from '../src/notification-sound.js';
import { createRentalNotifications } from '../src/notifications.js';

function fixture() {
  const target = new EventTarget(), tones = [], contexts = [];
  const sound = createNotificationSound({ target, createContext: () => {
    const audio = { state: 'running', currentTime: 10, destination: {},
      resume: async () => { audio.state = 'running'; },
      close: async () => { audio.state = 'closed'; },
      createOscillator: () => {
        const tone = { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {},
          start: at => { tone.startedAt = at; }, stop: at => { tone.stoppedAt = at; } };
        tones.push(tone); return tone;
      },
      createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} })
    };
    contexts.push(audio); return audio;
  } });
  return { target, sound, tones, contexts };
}

test('audio unlocks through interaction, plays a short chime and releases resources on sign-out', async () => {
  const { target, sound, tones, contexts } = fixture();
  sound.start(); sound.start();
  assert.equal(sound.play(), false);
  assert.equal(contexts.length, 0);
  target.dispatchEvent(new Event('pointerdown'));
  assert.equal(contexts.length, 1);
  assert.equal(sound.play(), true);
  assert.equal(tones.length, 2);
  assert.equal(tones[0].startedAt, 10);
  assert.ok(tones[1].stoppedAt - tones[0].startedAt < 0.5);
  for (const tone of tones) tone.onended();
  contexts[0].state = 'suspended';
  assert.equal(sound.play(), false);
  target.dispatchEvent(new Event('keydown'));
  await Promise.resolve();
  assert.equal(sound.play(), true);
  sound.stop();
  assert.equal(contexts[0].state, 'closed');
  target.dispatchEvent(new Event('keydown'));
  assert.equal(contexts.length, 1);
  assert.equal(sound.play(), false);
  sound.start(); target.dispatchEvent(new Event('keydown'));
  assert.equal(contexts.length, 2);
  sound.stop();
});

test('new notification batches chime once; history, repeated events and older pages stay silent', async () => {
  const { target, sound, tones } = fixture();
  sound.start(); target.dispatchEvent(new Event('pointerdown'));
  const row = id => ({ id, created_at: '2026-11-13T08:00:00Z', is_read: false });
  let incoming = [row('old')];
  const inbox = createRentalNotifications({ api: async () => ({ notifications: incoming, next_cursor: 'older' }), onAlert: () => sound.play() });
  inbox.setAccount('operator');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(tones.length, 0);
  incoming = [row('new-1'), row('new-2'), row('old')];
  await inbox.refresh(); await inbox.refresh();
  assert.equal(tones.length, 2);
  incoming = [row('older-page')];
  await inbox.refresh({ older: true });
  assert.equal(tones.length, 2);
  inbox.setAccount(null); sound.stop();
});

test('unsupported or blocked audio leaves visual notifications usable', () => {
  const target = new EventTarget();
  for (const createContext of [() => null, () => { throw Error('Audio blocked'); }]) {
    const sound = createNotificationSound({ target, createContext });
    sound.start(); target.dispatchEvent(new Event('pointerdown'));
    assert.equal(sound.play(), false); sound.stop();
  }
});
