import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyBOQaMdRRI8UFOoXPspLwve5ezwGfnGXAQ',
  authDomain: 'app-gestao-de-despesa.firebaseapp.com',
  projectId: 'app-gestao-de-despesa',
  storageBucket: 'app-gestao-de-despesa.firebasestorage.app',
  messagingSenderId: '809012952625',
  appId: '1:809012952625:web:08451f236790ccbaab1f10',
  measurementId: 'G-SG6ETYVFGC',
};

// Evita reinicializar em hot-reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
