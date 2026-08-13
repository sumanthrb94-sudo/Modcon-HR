// Unit tests for turning a Firebase uid into an organisation and a role.
//
// The parsing is pure, so every authorisation branch is asserted here without
// a service account, a network call, or a Firestore project. The branches are
// the whole point: this is the file that decides who may change an
// organisation's check-in policy.
//
// Run: node --experimental-strip-types --test test/firestore-user.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseUserDocument } from "../supabase/functions/_shared/firestoreUser.ts";

test("reads orgId and an hr role", () => {
  assert.deepEqual(
    parseUserDocument({ fields: { orgId: { stringValue: "acme" }, role: { stringValue: "hr" } } }),
    { orgKey: "acme", isHrAdmin: true },
  );
});

test("treats the platform admin role as an org administrator", () => {
  assert.deepEqual(
    parseUserDocument({ fields: { orgId: { stringValue: "acme" }, role: { stringValue: "admin" } } }),
    { orgKey: "acme", isHrAdmin: true },
  );
});

test("an employee is not an administrator", () => {
  assert.deepEqual(
    parseUserDocument({ fields: { orgId: { stringValue: "acme" }, role: { stringValue: "employee" } } }),
    { orgKey: "acme", isHrAdmin: false },
  );
});

// isManager includes admin elsewhere in this app; it does not here. Approving
// leave and configuring the organisation are different authorities.
test("a manager is not an org administrator", () => {
  assert.deepEqual(
    parseUserDocument({ fields: { orgId: { stringValue: "acme" }, role: { stringValue: "manager" } } }),
    { orgKey: "acme", isHrAdmin: false },
  );
});

test("a document with no role at all is not an administrator", () => {
  assert.deepEqual(
    parseUserDocument({ fields: { orgId: { stringValue: "acme" } } }),
    { orgKey: "acme", isHrAdmin: false },
  );
});

// The direction a missing answer has to fail. An account with no orgId is
// unassigned, and resolving it to the incumbent organisation is the bug that
// let self-registration read another company's data.
test("an account with no orgId resolves to nobody, not the default tenant", () => {
  assert.equal(parseUserDocument({ fields: { role: { stringValue: "hr" } } }), null);
});

test("an empty orgId resolves to nobody", () => {
  assert.equal(
    parseUserDocument({ fields: { orgId: { stringValue: "" }, role: { stringValue: "hr" } } }),
    null,
  );
});

test("a whitespace-only orgId resolves to nobody", () => {
  assert.equal(
    parseUserDocument({ fields: { orgId: { stringValue: "   " }, role: { stringValue: "hr" } } }),
    null,
  );
});

test("a missing document resolves to nobody", () => {
  assert.equal(parseUserDocument(null), null);
});

test("a document with no fields resolves to nobody", () => {
  assert.equal(parseUserDocument({}), null);
});
