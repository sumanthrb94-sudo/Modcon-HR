import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { connectFirestoreEmulator, getFirestore, initializeFirestore } from 'firebase/firestore';
import { connectAuthEmulator, getAuth, setPersistence, browserSessionPersistence } from 'firebase/auth';

export const firebaseConfig = {
    apiKey: 'AIzaSyAAl32aMY8mZ36PPcB4wZEc4pOkB2qpFDA',
    authDomain: 'modconhr-b2789.firebaseapp.com',
    projectId: 'modconhr-b2789',
    storageBucket: 'modconhr-b2789.firebasestorage.app',
    messagingSenderId: '257832557844',
    appId: '1:257832557844:web:4dcbba495886cabcc7f601',
    // No `measurementId`: Analytics is not enabled on this project and the app
    // never called getAnalytics. Carrying a stale one would be a value nothing
    // reads that looks like configuration somebody chose.
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

/**
 * Point Firestore at a local emulator, for E2E runs that must not touch the
 * live project.
 *
 * Opt-in and build-time only: `VITE_FIRESTORE_EMULATOR_HOST` is inlined by Vite
 * at build, so a production bundle built without it contains no emulator call
 * at all — there is no runtime switch an end user could flip, and no way for a
 * deployed build to silently talk to localhost.
 *
 * Only Firestore is redirected. Auth stays on the live project because the
 * suite signs in with real accounts, and the emulator's Firestore honours
 * `firestore.rules` the same way production does — which is the point: an E2E
 * run against it exercises the same authorization, without spending the live
 * project's daily quota.
 */
const firestoreEmulator = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST;
if (firestoreEmulator) {
    const [emulatorHost, emulatorPort] = firestoreEmulator.split(':');
    connectFirestoreEmulator(db, emulatorHost, Number(emulatorPort) || 8080);
}

export const auth = getAuth(firebaseApp);

/**
 * Point Auth at a local emulator too, on the same opt-in terms as Firestore.
 *
 * With both redirected a test run touches no live Google service at all: the
 * accounts, their uids and their tokens are the emulator's. Build-time only, so
 * a production bundle carries neither call.
 *
 * `disableWarnings` silences the banner the SDK injects into the page — it
 * overlays the app and the E2E suite clicks through where it sits.
 */
const authEmulator = import.meta.env.VITE_AUTH_EMULATOR_HOST;
if (authEmulator) {
    connectAuthEmulator(auth, `http://${authEmulator}`, { disableWarnings: true });
}

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
