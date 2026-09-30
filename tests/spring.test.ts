import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPRING_PRESETS,
  isSpringSettled,
  rubberband,
  rubberbandClamp,
  springStep,
  type SpringConfig,
  type SpringState,
} from '../src/utils/spring';

/** Run a spring at a steady 60fps and report where it went. */
function simulate(
  from: number,
  to: number,
  config: SpringConfig,
  velocity = 0,
  seconds = 1.5
): { final: SpringState; peak: number; frames: number } {
  const frame = 1 / 60;
  let state: SpringState = { value: from, velocity };
  let peak = from;
  let frames = 0;

  for (let elapsed = 0; elapsed < seconds; elapsed += frame) {
    state = springStep(state, to, config, frame);
    peak = Math.max(peak, state.value);
    frames += 1;
    if (isSpringSettled(state, to)) break;
  }

  return { final: state, peak, frames };
}

test('rubberbandClamp leaves in-bounds values untouched', () => {
  for (const value of [180, 260, 359, 500]) {
    assert.equal(rubberbandClamp(value, 180, 500, 320), value);
  }
});

test('rubberbandClamp resists progressively instead of stopping dead', () => {
  const justPast = rubberbandClamp(520, 180, 500, 320);
  const farPast = rubberbandClamp(900, 180, 500, 320);

  assert.ok(justPast > 500, 'the value must follow the pointer past the boundary');
  assert.ok(farPast > justPast, 'further overshoot must still move the surface');
  assert.ok(farPast < 900, 'the resistance must keep the overshoot short of the raw drag');

  const belowMin = rubberbandClamp(60, 180, 500, 320);
  assert.ok(belowMin < 180 && belowMin > 100, 'the lower boundary resists the same way');
});

test('rubberband is monotonic and asymptotic', () => {
  const dimension = 320;
  let previous = -1;

  for (const overshoot of [1, 10, 50, 200, 1000, 100000]) {
    const resisted = rubberband(overshoot, dimension);
    assert.ok(resisted > previous, 'resistance must grow with the overshoot');
    assert.ok(resisted < dimension, 'resistance can never exceed the dimension itself');
    previous = resisted;
  }
});

test('a critically damped spring settles on the target without overshoot', () => {
  const { final, peak } = simulate(0, 100, { damping: 1, response: 0.4 });

  assert.ok(Math.abs(final.value - 100) < 0.2, `expected ~100, got ${final.value}`);
  assert.ok(peak <= 100.5, `critically damped motion overshot to ${peak}`);
});

test('an under-damped spring overshoots, which is why bounce is reserved for momentum', () => {
  const { peak } = simulate(0, 100, { damping: 0.8, response: 0.4 });
  assert.ok(peak > 100.5, `expected the under-damped spring to overshoot, peaked at ${peak}`);
});

test('the spring continues at the handed-over velocity instead of restarting from rest', () => {
  const frame = 1 / 60;
  const fromRest = springStep({ value: 0, velocity: 0 }, 100, SPRING_PRESETS.momentum, frame);
  const thrown = springStep({ value: 0, velocity: 600 }, 100, SPRING_PRESETS.momentum, frame);

  assert.ok(
    thrown.value > fromRest.value,
    'handing the gesture its release velocity must move the value further on the first frame'
  );
  assert.ok(thrown.velocity > 0, 'the spring must carry the velocity forward, not discard it');
});

test('springStep tolerates a stalled frame without teleporting past the target', () => {
  const state = springStep({ value: 0, velocity: 0 }, 100, SPRING_PRESETS.move, 5);

  assert.ok(Number.isFinite(state.value) && Number.isFinite(state.velocity));
  assert.ok(state.value <= 100.01, `a 5s frame must not launch the value (got ${state.value})`);
});

test('isSpringSettled only reports rest once the value is genuinely there', () => {
  assert.equal(isSpringSettled({ value: 100, velocity: 0 }, 100), true);
  assert.equal(isSpringSettled({ value: 92, velocity: 0 }, 100), false);
  assert.equal(isSpringSettled({ value: 100, velocity: 250 }, 100), false);
});
