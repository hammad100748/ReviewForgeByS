import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Firebase Web SDK configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDummyKeyForDevelopment12345",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "reviewforge-dev.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "reviewforge-dev",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "reviewforge-dev.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1234567890:web:abcdef123456",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
