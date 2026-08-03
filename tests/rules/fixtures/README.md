# Rules fixtures

## `deployed-baseline-61339dd.rules`

A byte-identical copy of `firestore.rules` as of commit `61339dd`
("feat: per-organisation feature flags, so a rollout can be staged"), which is
the last ruleset [tenant-isolation-spec.md](../../../docs/tenant-isolation-spec.md)
§10 records as **deployed** (steps 1 and 2, both marked Done). Everything after
it — G7, the invite org-stamp requirement, and the identity-collection list
scoping — is still sitting in the working tree unreleased.

It exists so `deploy-rehearsal.rules.test.mjs` can answer the question that
matters before a rules deploy and that no other suite here can: **what changes
for real accounts when this ships**. A test that only runs the working tree's
ruleset can say "the new rules are correct"; it cannot say "deploying them
today locks out every account that has not been backfilled", which is the
actual risk on the board.

**This file is a snapshot, not a source.** It is not the deployed ruleset — it
is the best reconstruction available from git, because reading the live one
needs `firebase login` and the Rules API. Treat its verdict as "what this diff
does", not "what production does".

### Refreshing it

After a rules deploy, re-cut it from the commit that was deployed and rename to
match:

```bash
git show <deployed-sha>:firestore.rules > tests/rules/fixtures/deployed-baseline-<short-sha>.rules
```

Then update the path in `deploy-rehearsal.rules.test.mjs` and this file. If the
rehearsal suite goes green with no assertions left describing a *change*, the
tree and the deployed ruleset agree and there is nothing to deploy.
