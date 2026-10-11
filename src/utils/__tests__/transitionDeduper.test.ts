import {createTransitionDeduper} from '../transitionDeduper';

describe('transition deduper', () => {
  it('accepts the first transition and drops a repeat inside the window', () => {
    const deduper = createTransitionDeduper(60_000);
    expect(deduper.accept('school-001', 'ENTER', 1_000)).toBe(true);
    expect(deduper.accept('school-001', 'ENTER', 30_000)).toBe(false);
  });

  it('keeps ENTER and EXIT, and a later ENTER after the window', () => {
    const deduper = createTransitionDeduper(60_000);
    expect(deduper.accept('school-001', 'ENTER', 1_000)).toBe(true);
    expect(deduper.accept('school-001', 'EXIT', 2_000)).toBe(true);
    expect(deduper.accept('school-002', 'ENTER', 2_000)).toBe(true);
    expect(deduper.accept('school-001', 'ENTER', 61_000)).toBe(true);
  });
});
