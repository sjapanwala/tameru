// One injectable clock. Everything that needs "today" asks a Clock,
// so tests and the debug panel can fake the date.

import { addDays, localDateOf } from './dates';
import type { LocalDate } from './types';

export interface Clock {
  today(): LocalDate;
  now(): Date;
}

export const systemClock: Clock = {
  today: () => localDateOf(new Date()),
  now: () => new Date(),
};

/** A clock that can be pinned to a date and moved, for tests and the debug panel. */
export class MutableClock implements Clock {
  private pinned: LocalDate | null;
  constructor(pinned: LocalDate | null = null, private readonly base: Clock = systemClock) {
    this.pinned = pinned;
  }
  today(): LocalDate {
    return this.pinned ?? this.base.today();
  }
  now(): Date {
    if (!this.pinned) return this.base.now();
    // Keep the real time of day on the pinned date (time-of-day suggestions use it).
    const real = this.base.now();
    const [y, m, d] = this.pinned.split('-').map(Number) as [number, number, number];
    return new Date(y, m - 1, d, real.getHours(), real.getMinutes(), real.getSeconds());
  }
  set(date: LocalDate | null): void {
    this.pinned = date;
  }
  advance(days: number): void {
    this.pinned = addDays(this.today(), days);
  }
  get isPinned(): boolean {
    return this.pinned !== null;
  }
}

export const fixedClock = (d: LocalDate): MutableClock => new MutableClock(d);
