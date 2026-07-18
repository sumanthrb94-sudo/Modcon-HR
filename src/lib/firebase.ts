import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

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
        useFetchStreams: false,
    })
    : getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);

// Analytics requires a browser environment and feature support.
export const analyticsPromise =
    typeof window !== 'undefined' && !isLocalDev
        ? isSupported().then((ok) => (ok ? getAnalytics(firebaseApp) : null))
        : Promise.resolve(null);
