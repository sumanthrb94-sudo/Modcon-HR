import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { connectFirestoreEmulator, getFirestore, initializeFirestore } from 'firebase/firestore';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

const firebaseConfig = {
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

// Point at the local Firebase Emulator Suite (see `firebase emulators:start`)
// instead of the live project. Opt-in only, via VITE_USE_FIREBASE_EMULATOR=true
// — used for local/CI e2e testing so tests never touch production data.
const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';
if (useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// Analytics requires a browser environment and feature support.
export const analyticsPromise =
    typeof window !== 'undefined' && !isLocalDev && !useEmulator
        ? isSupported().then((ok) => (ok ? getAnalytics(firebaseApp) : null))
        : Promise.resolve(null);
