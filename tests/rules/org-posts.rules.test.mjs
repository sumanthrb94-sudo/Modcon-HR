/**
 * The Board — security-rules tests.
 *
 * The board is the one place in this app where every employee writes something
 * everybody else reads, which makes it the one place where "who may change
 * what" is not a matter of hiding a control. What these tests claim:
 *
 *   1. Attribution cannot be forged, on a post or a reply, and `createdAt` is
 *      the server's — so the order of the board is not a function of whose
 *      laptop clock is wrong.
 *   2. **You may react as yourself and nobody else.** `reactions` is a map of
 *      uid → emoji and an update may touch only the caller's own key. This is
 *      the rule the storage shape was chosen for.
 *   3. An ordinary employee cannot pin, and cannot reach a post by editing
 *      some other field — every update path is restricted to the keys it is
 *      about, so "react" cannot double as "rewrite what this says".
 *   4. Tenants are separated: another organisation's board is unreadable.
 *
 * Run with `npm run test:rules`.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modcon-hr';
const HOST = '127.0.0.1';
const PORT = 8080;

const USERS = {
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a' },
  colleagueA: { uid: 'colleague-a', email: 'colleague-a@example.com', role: 'employee', orgId: 'org-a' },
  employeeB: { uid: 'employee-b', email: 'employee-b@example.com', role: 'employee', orgId: 'org-b' },
};

let testEnv;

function as(user) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}

function post(overrides = {}) {
  return {
    orgId: 'org-a',
    kind: 'post',
    body: 'The Bengaluru office is closed on Friday for the annual audit.',
    authorUid: USERS.employeeA.uid,
    authorName: 'Employee A',
    authorEmployeeId: 'emp-a1',
    createdAt: serverTimestamp(),
    reactions: {},
    commentCount: 0,
    pinned: false,
    ...overrides,
  };
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: HOST, port: PORT, rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

async function seed() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const user of Object.values(USERS)) {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: user.email,
        role: user.role,
        orgId: user.orgId,
      });
    }
    await setDoc(doc(db, 'org_posts', 'post-1'), {
      ...post(),
      createdAt: new Date('2026-09-01T04:00:00Z'),
      reactions: { [USERS.colleagueA.uid]: '👍' },
    });
    await setDoc(doc(db, 'org_posts', 'post-b'), {
      ...post({ orgId: 'org-b', authorUid: USERS.employeeB.uid }),
      createdAt: new Date('2026-09-01T04:00:00Z'),
    });
  });
}

beforeEach(seed);

describe('posting', () => {
  it('an ordinary employee posts to their own organisation', async () => {
    await assertSucceeds(setDoc(doc(as(USERS.employeeA), 'org_posts', 'p-new'), post()));
  });

  it('the author cannot be forged', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'org_posts', 'p-forged'), post({ authorUid: USERS.hrA.uid })),
    );
  });

  it('the timestamp must be the server’s', async () => {
    // Otherwise a post backdates itself to the top of everyone's board.
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'org_posts', 'p-backdated'),
        post({ createdAt: '2020-01-01T00:00:00.000Z' }),
      ),
    );
  });

  it('an empty post is refused, and an enormous one', async () => {
    await assertFails(setDoc(doc(as(USERS.employeeA), 'org_posts', 'p-empty'), post({ body: '' })));
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'org_posts', 'p-huge'), post({ body: 'x'.repeat(3001) })),
    );
  });

  it('an employee cannot post straight to the top of the board', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'org_posts', 'p-pinned'), post({ pinned: true })),
    );
  });

  it('an administrator can', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.hrA), 'org_posts', 'p-pinned-hr'),
        post({ pinned: true, authorUid: USERS.hrA.uid }),
      ),
    );
  });

  it('a post cannot arrive with reactions already on it', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'org_posts', 'p-preloved'),
        post({ reactions: { [USERS.colleagueA.uid]: '👏' } }),
      ),
    );
  });

  it('cannot post into another organisation', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'org_posts', 'p-cross'), post({ orgId: 'org-b' })),
    );
  });
});

describe('reacting', () => {
  it('an employee reacts as themselves', async () => {
    await assertSucceeds(
      updateDoc(doc(as(USERS.employeeA), 'org_posts', 'post-1'), {
        reactions: { [USERS.colleagueA.uid]: '👍', [USERS.employeeA.uid]: '🎉' },
      }),
    );
  });

  it('and can take it back', async () => {
    await assertSucceeds(
      updateDoc(doc(as(USERS.colleagueA), 'org_posts', 'post-1'), { reactions: {} }),
    );
  });

  it('cannot react on somebody else’s behalf', async () => {
    // The rule the whole map shape exists for.
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'org_posts', 'post-1'), {
        reactions: { [USERS.colleagueA.uid]: '👍', [USERS.hrA.uid]: '🎉' },
      }),
    );
  });

  it('cannot remove somebody else’s reaction', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'org_posts', 'post-1'), { reactions: {} }),
    );
  });

  it('cannot invent a reaction outside the offered set', async () => {
    // Free-text here would put arbitrary strings on everyone's board.
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'org_posts', 'post-1'), {
        reactions: { [USERS.colleagueA.uid]: '👍', [USERS.employeeA.uid]: 'get back to work' },
      }),
    );
  });

  it('cannot smuggle an edit in alongside a reaction', async () => {
    // "React" must not double as "rewrite what this post says".
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'org_posts', 'post-1'), {
        reactions: { [USERS.colleagueA.uid]: '👍', [USERS.employeeA.uid]: '🎉' },
        body: 'Actually the office is open, come in',
      }),
    );
  });
});

describe('editing, pinning and removing', () => {
  it('the author rewords their own post', async () => {
    await assertSucceeds(
      updateDoc(doc(as(USERS.employeeA), 'org_posts', 'post-1'), {
        body: 'Correction: the office is closed on Thursday.',
        editedAt: serverTimestamp(),
      }),
    );
  });

  it('a colleague cannot reword it', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.colleagueA), 'org_posts', 'post-1'), { body: 'Something else' }),
    );
  });

  it('an ordinary employee cannot pin', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'org_posts', 'post-1'), { pinned: true }),
    );
  });

  it('an administrator pins', async () => {
    await assertSucceeds(updateDoc(doc(as(USERS.hrA), 'org_posts', 'post-1'), { pinned: true }));
  });

  it('the author deletes their own post', async () => {
    await assertSucceeds(deleteDoc(doc(as(USERS.employeeA), 'org_posts', 'post-1')));
  });

  it('an administrator deletes anybody’s', async () => {
    await assertSucceeds(deleteDoc(doc(as(USERS.hrA), 'org_posts', 'post-1')));
  });

  it('a colleague cannot delete somebody else’s', async () => {
    await assertFails(deleteDoc(doc(as(USERS.colleagueA), 'org_posts', 'post-1')));
  });

  it('anybody in the org may move the reply count, and nothing else', async () => {
    await assertSucceeds(
      updateDoc(doc(as(USERS.colleagueA), 'org_posts', 'post-1'), { commentCount: 1 }),
    );
    await assertFails(
      updateDoc(doc(as(USERS.colleagueA), 'org_posts', 'post-1'), {
        commentCount: 1,
        pinned: true,
      }),
    );
  });
});

describe('replies', () => {
  function comment(overrides = {}) {
    return {
      orgId: 'org-a',
      body: 'Thanks for the heads up.',
      authorUid: USERS.colleagueA.uid,
      authorName: 'Colleague A',
      createdAt: serverTimestamp(),
      ...overrides,
    };
  }

  it('an employee replies', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.colleagueA), 'org_posts/post-1/comments', 'c-1'), comment()),
    );
  });

  it('the author of a reply cannot be forged', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.colleagueA), 'org_posts/post-1/comments', 'c-forged'),
        comment({ authorUid: USERS.hrA.uid }),
      ),
    );
  });

  it('a reply cannot be edited by anybody, including its author', async () => {
    // A conversation people rely on is not one where earlier turns change
    // under later ones. Removal is allowed; rewriting is not.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'org_posts/post-1/comments', 'c-existing'), {
        ...comment(),
        createdAt: new Date('2026-09-01T05:00:00Z'),
      });
    });
    await assertFails(
      updateDoc(doc(as(USERS.colleagueA), 'org_posts/post-1/comments', 'c-existing'), {
        body: 'changed my mind',
      }),
    );
  });

  it('its author removes it, and so does an administrator', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'org_posts/post-1/comments', 'c-del'), {
        ...comment(),
        createdAt: new Date('2026-09-01T05:00:00Z'),
      });
    });
    await assertFails(deleteDoc(doc(as(USERS.employeeA), 'org_posts/post-1/comments', 'c-del')));
    await assertSucceeds(deleteDoc(doc(as(USERS.colleagueA), 'org_posts/post-1/comments', 'c-del')));
  });
});

describe('tenant separation', () => {
  it('another organisation’s board is unreadable', async () => {
    await assertFails(getDoc(doc(as(USERS.employeeA), 'org_posts', 'post-b')));
  });

  it('a list must filter on the organisation', async () => {
    const db = as(USERS.employeeA);
    await assertFails(getDocs(collection(db, 'org_posts')));
    await assertSucceeds(getDocs(query(collection(db, 'org_posts'), where('orgId', '==', 'org-a'))));
  });

  it('another organisation’s member cannot react on this board', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.employeeB), 'org_posts', 'post-1'), {
        reactions: { [USERS.colleagueA.uid]: '👍', [USERS.employeeB.uid]: '🎉' },
      }),
    );
  });
});
