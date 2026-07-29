import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { absolute, readText } from './helpers.mjs';

const config = JSON.parse(readText('scene-config.json'));

test('camera path has unique IDs and progresses from zero to one', () => {
  assert.ok(config.cameraPath.length >= 2);
  assert.equal(config.cameraPath[0].progress, 0);
  assert.equal(config.cameraPath.at(-1).progress, 1);

  const ids = config.cameraPath.map((frame) => frame.id);
  assert.equal(new Set(ids).size, ids.length);

  for (let index = 1; index < config.cameraPath.length; index += 1) {
    assert.ok(
      config.cameraPath[index].progress > config.cameraPath[index - 1].progress,
      `Camera progress is not increasing at ${config.cameraPath[index].id}`,
    );
  }
});

test('every camera frame has finite position, target, and field-of-view values', () => {
  for (const frame of config.cameraPath) {
    for (const vectorName of ['position', 'target']) {
      for (const axis of ['x', 'y', 'z']) {
        assert.ok(
          Number.isFinite(frame[vectorName][axis]),
          `${frame.id}.${vectorName}.${axis} must be finite`,
        );
      }
    }

    assert.ok(Number.isFinite(frame.fov) && frame.fov > 0 && frame.fov < 180);
    assert.ok(['world', 'boat'].includes(frame.space));
    assert.ok(['orbit', 'spline', 'linear'].includes(frame.mode));
  }
});

test('text animation intervals are ordered and bounded', () => {
  for (const item of config.textItems) {
    assert.ok(item.start >= 0, `${item.id} starts before zero`);
    assert.ok(item.start <= item.fullyVisible, `${item.id} visibility order is invalid`);
    assert.ok(
      item.fullyVisible <= item.fadeOutStart,
      `${item.id} fade-out starts too early`,
    );
    assert.ok(item.fadeOutStart <= item.end, `${item.id} end order is invalid`);
    assert.ok(item.end <= 1, `${item.id} ends after one`);
  }
});

test('screen layout media paths exist and dimensions are positive', () => {
  for (const screen of config.screenLayout) {
    assert.ok(screen.w > 0);
    assert.ok(screen.h > 0);
    assert.equal(screen.pos.length, 3);
    assert.equal(screen.rot.length, 3);
    assert.ok(existsSync(absolute(screen.mediaPersistPath)), screen.mediaPersistPath);
  }
});

test('flicker and glasses-rise intervals are bounded and ordered', () => {
  for (const [name, interval] of Object.entries({
    screenFlicker: config.screenFlicker,
    glassesRise: config.glassesRise,
  })) {
    assert.ok(interval.start >= 0, `${name} starts before zero`);
    assert.ok(interval.start < interval.end, `${name} interval is empty or reversed`);
    assert.ok(interval.end <= 1, `${name} ends after one`);
  }
});
