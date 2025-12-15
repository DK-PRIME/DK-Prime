// firebase-config.js (COMPAT init for DK Prime)
// Потрібно для competition.html та інших сторінок, які працюють через compat SDK

(function () {
  // ⚠️ твій конфіг (ти мені його дав)
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
    console.error("Firebase SDK (compat) not loaded");
    return;
  }

  try {
    // щоб не було помилки "already exists" при повторних завантаженнях
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    // глобальні, як у твоїй схемі
    window.scAuth = firebase.auth();
    window.scDb = firebase.firestore();

    // при бажанні: локальна сесія (на телефоні/планшеті норм)
    window.scAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
  } catch (e) {
    console.error("firebase-config init error:", e);
  }
})();
