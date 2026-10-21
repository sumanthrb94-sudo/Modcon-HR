/**
 * Leave carried from one financial year into the next.
 *
 * Settings and Apply Leave said Earned Leave "carries forward past 1 April",
 * and nothing did: entitlement counted accrual from the start of the current
 * year only, so every balance reset on 1 April — accumulated Earned Leave the
 * Shops and Establishments Acts require to be carried, gone, and a leaver's
 * encashment short by every carried day.
 *
 * A year's closing balance is what it carried in, plus what it granted, less
 * what was used; the next year carries that in, up to the policy's cap.
 * History only reaches back as far as this app has a record — before that
 * there is nothing to compute from, so the first tracked year carries in what
 * HR uploaded as the opening balance, and earlier years carry nothing.
 *
 * Pure, imports nothing, unit-tested (tests/unit/leaveCarry.test.ts).
 */

export interface CarryInput {
  /** The financial year (its starting calendar year) whose carried-in balance is wanted. */
  readonly year: number;
  /** False when the policy does not carry past 31 March. */
  readonly carriesBeyondYear: boolean;
  /** Most days that may be carried; undefined is no cap. */
  readonly cap?: number;
  /** The first financial year this app has a record of; nothing is computed before it. */
  readonly firstTrackedYear: number;
  /** Opening balance HR uploaded for the first tracked year. */
  readonly openingCarried: number;
  /** Days granted across a whole financial year. */
  readonly grantedInYear: (year: number) => number;
  /** Paid days used in a financial year, including any opening figure. */
  readonly usedInYear: (year: number) => number;
}

function capped(days: number, cap: number | undefined): number {
  const positive = Math.max(0, days);
  return cap === undefined ? positive : Math.min(positive, Math.max(0, cap));
}

/** Days carried into `year`. */
export function carriedInto(input: CarryInput): number {
  if (!input.carriesBeyondYear) return 0;
  if (input.year < input.firstTrackedYear) return 0;
  let carried = capped(input.openingCarried, input.cap);
  // Walk forward from the first tracked year — bounded by the years between,
  // never recursion with nothing to stop it.
  for (let y = input.firstTrackedYear; y < input.year; y += 1) {
    const closing = carried + input.grantedInYear(y) - input.usedInYear(y);
    carried = capped(closing, input.cap);
  }
  return carried;
}
