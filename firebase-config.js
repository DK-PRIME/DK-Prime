// firebase-config.js
// Підключення Firebase SDK (v9 modular) через CDN

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ТВОЯ реальна конфігурація Stolar Carp
const firebaseConfig = {
  apiKey: "AIzaSyBU7BSwGl0laDvHGhrvu14nJWpabsjSoNo",
  authDomain: "stolar-carp.firebaseapp.com",
  projectId: "stolar-carp",
  storageBucket: "stolar-carp.firebasestorage.app",
  messagingSenderId: "1019636788370",
  appId: "1:1019636788370:web:af1c1ecadb683df212ca4b",
  measurementId: "G-VWC07QNS7P"
};

// Ініціалізація
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Експортуємо все, що будемо використовувати в інших файлах
export {
  app,
  auth,
  db,
  // Auth
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  // Firestore
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp
};
