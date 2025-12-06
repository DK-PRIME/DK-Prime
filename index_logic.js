// index_logic.js
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// DOM елементи
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const authMessage = document.getElementById("authMessage");
const userStatus = document.getElementById("userStatus");
const logoutButton = document.getElementById("logoutButton");
const adminLinks = document.getElementById("adminLinks");
const authSection = document.getElementById("authSection");

// Допоміжні функції
function showAdminUI(user, userDoc) {
  if (!user || !userDoc || userDoc.role !== "admin") {
    // не адмін → форма логіну
    authSection.classList.remove("hidden");
    adminLinks.classList.add("hidden");
    logoutButton.classList.add("hidden");
    userStatus.classList.add("hidden");
    return;
  }

  // адмін
  authSection.classList.remove("hidden");
  loginForm.classList.add("hidden");
  logoutButton.classList.remove("hidden");
  adminLinks.classList.remove("hidden");

  userStatus.textContent = `Увійшов як: ${userDoc.name || user.email} (admin)`;
  userStatus.classList.remove("hidden");
  authMessage.textContent = "";
}

function showLoggedOutUI() {
  loginForm.classList.remove("hidden");
  logoutButton.classList.add("hidden");
  adminLinks.classList.add("hidden");
  userStatus.classList.add("hidden");
  authMessage.textContent = "";
}

// Слухач стану авторизації
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showLoggedOutUI();
    return;
  }

  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      authMessage.textContent = "Немає профілю користувача в Firestore.";
      showLoggedOutUI();
      return;
    }

    const data = snap.data();
    showAdminUI(user, data);
  } catch (err) {
    console.error("Помилка читання Firestore:", err);
    authMessage.textContent = "Помилка читання даних користувача.";
    showLoggedOutUI();
  }
});

// Обробка форми логіну
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authMessage.textContent = "";

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // далі onAuthStateChanged сам оновить UI
      console.log("Вхід успішний:", cred.user.uid);
    } catch (err) {
      console.error(err);
      authMessage.textContent = `Помилка входу: ${err.code || err.message}`;
    }
  });
}

// Вихід
if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      await signOut(auth);
      showLoggedOutUI();
    } catch (err) {
      console.error(err);
      authMessage.textContent = "Помилка виходу.";
    }
  });
}
