import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getAuth, setPersistence, browserSessionPersistence } from 'firebase/auth';

export const firebaseConfig = {
    apiKey: 'AIzaSyCDTZ1Sc3ajyKE7fKnzDguzoIphn9tDRQU',
    authDomain: 'modcon-hr.firebaseapp.com',
    projectId: 'modcon-hr',
    storageBucket: 'modcon-hr.firebasestorage.app',
    messagingSenderId: '1073004872818',
    appId: '1:1073004872818:web:4edb04f9dba2564a832eeb',
    measurementId: 'G-K1S5CCNGLK',
};

export const firebaseApp = initializeApp(firebaseConfig);
const isLocalDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const db = isLocalDev
    ? initializeFirestore(firebaseApp, {
        experimentalForceLongPolling: true,
    })
    : getFirestore(firebaseApp);

export const auth = getAuth(firebaseApp);

/**
 * There is no automatic sign-in. Closing the app signs you out.
 *
 * Firebase defaults to `browserLocalPersistence`, which writes the session to
 * localStorage and restores it on every later visit — so anyone reopening the
 * browser, or opening the URL on a shared or unattended machine, landed inside
 * the previous user's organisation without presenting a credential. For an HR
 * product that is the whole directory, payroll and attendance of a company
 * behind a browser tab somebody forgot to close.
 *
 * `browserSessionPersistence` keeps the session in sessionStorage instead: it
 * survives a refresh and in-app navigation, which the app needs to function at
 * all, and dies with the tab. `inMemoryPersistence` would drop it on every
 * reload, which signs people out mid-form rather than making anything safer.
 *
 * Applied to the *current* session as well as future ones, so a session already
 * persisted in localStorage by an earlier build is migrated rather than left
 * behind to keep auto-signing that browser in.
 *
 * Awaited before sign-in (see `signInEmail` in lib/auth.tsx) — a sign-in that
 * won the race against this promise would be written with the old persistence
 * and outlive the tab anyway.
 */
export const authPersistenceReady = setPersistence(auth, browserSessionPersistence).catch(
    (error) => {
        // Private-mode Safari and storage-partitioned contexts can reject this.
        // Log rather than swallow: the consequence is a session that behaves
        // like the old default, which is exactly the thing worth knowing about.
        console.error('Could not restrict auth persistence to this tab:', error);
    },
);

// Analytics requires a browser environment and feature support.
export const analyticsPromise =
    typeof window !== 'undefined' && !isLocalDev
        ? isSupported().then((ok) => (ok ? getAnalytics(firebaseApp) : null))
        : Promise.resolve(null);
