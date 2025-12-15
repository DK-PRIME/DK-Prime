// firebase-config.js (DK Prime)
// compat 10.12.2

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
    console.error("Firebase SDK not loaded");
    return;
  }

  if (firebase.apps.length === 0) firebase.initializeApp(firebaseConfig);

  window.scAuth = firebase.auth();
  window.scDb = firebase.firestore();
  window.scStorage = firebase.storage();

  // сумісність (якщо десь використовується)
  window.auth = window.scAuth;
  window.db = window.scDb;
  window.storage = window.scStorage;
})();
