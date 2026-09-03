#!/usr/bin/env node
/**
 * Print the sandbox credentials and a suggested route through the app.
 *
 * Its own step rather than a `console.log` at the end of the seeder, because
 * Vite's own startup banner is printed after it and would otherwise scroll the
 * one thing you actually need — the passwords — off the top of the terminal.
 */
import { SANDBOX_ACCOUNTS, SANDBOX_PASSWORD } from './sandbox-seed.mjs';

const line = '─'.repeat(72);

console.log(`\n${line}`);
console.log('  ModCon HR sandbox — emulated Firebase, nothing reaches the live project');
console.log(line);
console.log(`\n  Password for every account below:  ${SANDBOX_PASSWORD}\n`);

for (const account of SANDBOX_ACCOUNTS) {
  console.log(`  ${account.email.padEnd(22)} ${account.what}`);
}

console.log(`
${line}
  Worth a look, roughly in this order:

  as hr@modcon.test
    Settings → Payroll Compliance   declare EPF (any establishment code) and
                                    watch a payslip change on a profile's
                                    Compensation tab. Nothing is withheld until
                                    you declare something.
    Settings → Salary Structure     set Basic below 50% to see the Code on
                                    Wages finding.
    Payroll → Statutory returns     download the ECR. People with no UAN are
                                    named rather than silently dropped.
    The Board                       post, react, and see today's birthdays.

  as super@modcon.test
    Organizations → Subscriptions   start a ₹1 trial, carry an org, suspend one.
                                    The tenant cannot do any of this to itself.

  two browsers at once
    Sign in as hr@ in one window and employee@ in a private one. A record
    written in either shows up in the other — that is the whole point of the
    Firestore migration, and a single window cannot tell you it worked.

  the trial banner
    The seeded org has 4 days left, so the countdown is on screen. Move it from
    the super admin console to see grace and lock.
${line}
`);
