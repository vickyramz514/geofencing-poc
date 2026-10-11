import {backoffDelayMs} from '../retry';

describe('backoffDelayMs', () => {
  it('doubles the delay and caps it at 60 seconds', () => {
    expect(backoffDelayMs(1)).toBe(1000);
    expect(backoffDelayMs(2)).toBe(2000);
    expect(backoffDelayMs(3)).toBe(4000);
    expect(backoffDelayMs(4)).toBe(8000);
    expect(backoffDelayMs(10)).toBe(60_000);
  });
});
