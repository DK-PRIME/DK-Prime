// assets/js/stolarcarp-firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// Твій проект STOLAR CARP
const firebaseConfig = {
  apiKey: "AIzaSyBU7BSwGl0laDvHGhrvu14nJWpabsjSoNo",
  authDomain: "stolar-carp.firebaseapp.com",
  projectId: "stolar-carp",
  storageBucket: "stolar-carp.firebasestorage.app",
  messagingSenderId: "1019636788370",
  appId: "1:1019636788370:web:af1c1ecadb683df212ca4b",
  measurementId: "G-VWC07QNS7P"
};

const app = initializeApp(firebaseConfig);

// Експортуємо готові обʼєкти для інших скриптів
export const auth = getAuth(app);
export const db   = getFirestore(app);
