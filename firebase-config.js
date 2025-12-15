// firebase-config.js
// ЄДИНА ініціалізація Firebase (compat) для DK Prime
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyBU7BSwGl0laDvHGhrvu14nJWpabsjSoNo",
    authDomain: "stolar-carp.firebaseapp.com",
    projectId: "stolar-carp",
    storageBucket: "stolar-carp.firebasestorage.app",
    messagingSenderId: "1019636788370",
    appId: "1:1019636788370:web:af1c1ecadb683df212ca4b",
    measurementId: "G-VWC07QNS7P"
  };

  if (!window.firebase) {
    console.error("Firebase SDK not loaded (compat scripts missing).");
    return;
  }

  if (firebase.apps.length === 0) firebase.initializeApp(firebaseConfig);

  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();

  // глобальні (як у STOLAR CARP)
  window.scAuth = auth;
  window.scDb = db;
  window.scStorage = storage;

  // сумісність
  window.auth = auth;
  window.db = db;
  window.storage = storage;
})();
