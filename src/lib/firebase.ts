import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getFirestore } from 'firebase/firestore';
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
export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);

// Analytics requires a browser environment and feature support.
export const analyticsPromise =
    typeof window !== 'undefined'
        ? isSupported().then((ok) => (ok ? getAnalytics(firebaseApp) : null))
        : Promise.resolve(null);
