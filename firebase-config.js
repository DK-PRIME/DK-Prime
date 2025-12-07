// firebase-config.js

// ЄДИНИЙ Firebase-конфіг для всього сайту
// Використовуємо одну версію SDK: 11.0.1

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ТВОЯ реальна конфігурація проєкту STOLAR CARP
const firebaseConfig = {
  apiKey: "AIzaSyBU7BSwGl0laDvHGhrvu14nJWpabsjSoNo",
  authDomain: "stolar-carp.firebaseapp.com",
  projectId: "stolar-carp",
  storageBucket: "stolar-carp.appspot.com",
  messagingSenderId: "1019636788370",
  appId: "1:1019636788370:web:af1c1ecadb683df212ca4b",
  measurementId: "G-VWC07QNS7P"
};

// Ініціалізація додатку (робимо це ТІЛЬКИ тут)
export const app  = initializeApp(firebaseConfig);

// Спільні екземпляри auth і db для всіх інших модулів
export const auth = getAuth(app);
export const db   = getFirestore(app);
