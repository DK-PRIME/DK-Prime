// index_logic.js

// Підтягуємо вже готові app/auth/db з одного центру
import { auth, db } from "./firebase-config.js";

// Імпортуємо тільки потрібні функції з auth
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// Імпортуємо тільки потрібні функції з Firestore
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ---------------- DOM елементи ----------------
const loginForm     = document.getElementById("loginForm");
const emailInput    = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const authMessage   = document.getElementById("authMessage");
const userStatus    = document.getElementById("userStatus");
const logoutButton  = document.getElementById("logoutButton");
const adminLinks    = document.getElementById("adminLinks");

// Захисна перевірка
function safeEl(el, name = "елемент") {
  if (!el) console.warn(`⚠️ ${name} не знайдений у DOM`);
  return el;
}

// ---------------- Допоміжні функції ----------------
async function loadUserRole(uid) {
  try {
    const ref  = doc(db, "users", uid);
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
  if (safeEl(loginForm, "loginForm"))     loginForm.classList.remove("hidden");
  if (safeEl(logoutButton, "logoutButton")) logoutButton.classList.add("hidden");
  if (safeEl(adminLinks, "adminLinks"))   adminLinks.classList.add("hidden");
  if (safeEl(userStatus, "userStatus")) {
    userStatus.classList.add("hidden");
    userStatus.textContent = "";
  }
  if (safeEl(authMessage, "authMessage")) authMessage.textContent = "";
}

function showLoggedInUI(user, role) {
  if (safeEl(loginForm, "loginForm"))     loginForm.classList.add("hidden");
  if (safeEl(logoutButton, "logoutButton")) logoutButton.classList.remove("hidden");
  if (safeEl(adminLinks, "adminLinks"))   adminLinks.classList.remove("hidden");

  if (safeEl(userStatus, "userStatus")) {
    userStatus.textContent = `Увійшов як: ${user.email} (${role})`;
    userStatus.classList.remove("hidden");
  }

  if (safeEl(authMessage, "authMessage")) authMessage.textContent = "";
}

// ---------------- Обробник входу ----------------
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!emailInput || !passwordInput || !authMessage) return;

    const email    = emailInput.value.trim();
    const password = passwordInput.value;

    authMessage.textContent = "";

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const user = cred.user;

      const role = await loadUserRole(user.uid);
      console.log("✅ Успішний вхід, роль:", role);

      showLoggedInUI(user, role);
    } catch (err) {
      console.error("❌ Помилка входу:", err);
      authMessage.textContent = `Помилка входу: ${err.code || err.message}`;
    }
  });
} else {
  console.warn("⚠️ Форма входу (loginForm) не знайдена");
}

// ---------------- Обробник виходу ----------------
if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      await signOut(auth);
      console.log("ℹ️ Користувач вийшов");
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
    console.log("👋 Користувач не залогінений");
    showLoggedOutUI();
    return;
  }

  console.log("👤 Користувач залогінений:", user.email);
  const role = await loadUserRole(user.uid);
  showLoggedInUI(user, role);
});
