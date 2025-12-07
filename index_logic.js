// index_logic.js
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";

// ⚠️ ВСТАВ СЮДИ ТОЙ САМИЙ КОНФІГ, ЩО ТИ ВЖЕ ВСТАВЛЯВ У register_logic.js
const firebaseConfig = {
  apiKey: "ТВОЙ_API_KEY",
  authDomain: "stolar-carp.firebaseapp.com",
  projectId: "stolar-carp",
  storageBucket: "stolar-carp.appspot.com",
  messagingSenderId: "XXXXXXX",
  appId: "1:XXXXXXX:web:YYYYYYYY",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------------- DOM елементи ----------------
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const authMessage = document.getElementById("authMessage");
const userStatus = document.getElementById("userStatus");
const logoutButton = document.getElementById("logoutButton");
const adminLinks = document.getElementById("adminLinks");

// Захисна перевірка
function safeEl(el) {
  if (!el) console.warn("Елемент не знайдений");
  return el;
}

// ---------------- Допоміжні функції ----------------
async function loadUserRole(uid) {
  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      // документа немає – повертаємо гість
      return "guest";
    }
    const data = snap.data();
    return data.role || "guest";
  } catch (err) {
    console.error("Помилка читання ролі:", err);
    return "guest";
  }
}

function showLoggedOutUI() {
  if (safeEl(loginForm)) loginForm.classList.remove("hidden");
  if (safeEl(logoutButton)) logoutButton.classList.add("hidden");
  if (safeEl(adminLinks)) adminLinks.classList.add("hidden");
  if (safeEl(userStatus)) userStatus.classList.add("hidden");
  if (safeEl(authMessage)) authMessage.textContent = "";
}

function showLoggedInUI(user, role) {
  if (safeEl(loginForm)) loginForm.classList.add("hidden");
  if (safeEl(logoutButton)) logoutButton.classList.remove("hidden");
  if (safeEl(adminLinks)) adminLinks.classList.remove("hidden");

  if (safeEl(userStatus)) {
    userStatus.textContent = `Увійшов як: ${user.email} (${role})`;
    userStatus.classList.remove("hidden");
  }

  if (safeEl(authMessage)) authMessage.textContent = "";
}

// ---------------- Обробник входу ----------------
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!emailInput || !passwordInput || !authMessage) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    authMessage.textContent = "";

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const user = cred.user;
      // Роль підвантажиться в onAuthStateChanged, але можна і тут
      const role = await loadUserRole(user.uid);
      console.log("Успішний вхід, роль:", role);
      showLoggedInUI(user, role);
    } catch (err) {
      console.error("Помилка входу:", err);
      authMessage.textContent = `Помилка входу: ${err.code || err.message}`;
    }
  });
}

// ---------------- Обробник виходу ----------------
if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      await signOut(auth);
      showLoggedOutUI();
    } catch (err) {
      console.error("Помилка виходу:", err);
      if (authMessage) {
        authMessage.textContent = "Помилка виходу. Спробуйте ще раз.";
      }
    }
  });
}

// ---------------- Відстеження стану входу ----------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    console.log("Користувач вийшов / не залогінений");
    showLoggedOutUI();
    return;
  }

  console.log("Користувач залогінений:", user.email);
  const role = await loadUserRole(user.uid);
  showLoggedInUI(user, role);
});
