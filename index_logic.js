// index_logic.js
// Логіка входу/виходу та показу адмінських лінків

import {
  auth,
  db,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  doc,
  getDoc
} from "./firebase-config.js";

const loginForm    = document.getElementById("loginForm");
const emailInput   = document.getElementById("emailInput");
const passwordInput= document.getElementById("passwordInput");
const authMessage  = document.getElementById("authMessage");
const userStatus   = document.getElementById("userStatus");
const logoutButton = document.getElementById("logoutButton");
const adminLinks   = document.getElementById("adminLinks");

// Два твоїх адмінські емейли
const ADMIN_EMAILS = [
  "d.n.i.o.n.i.r@gmail.com",
  "djachok2125@gmail.com",
  "djachok2025@gmail.com"
];

function setAuthMessage(msg, isError = true) {
  if (!authMessage) return;
  authMessage.style.color = isError ? "#ef4444" : "#22c55e";
  authMessage.textContent = msg || "";
}

function setUserStatus(text) {
  if (!userStatus) return;
  userStatus.textContent = text || "";
  userStatus.classList.remove("hidden");
}

function showAdminUI() {
  if (adminLinks) adminLinks.classList.remove("hidden");
  if (logoutButton) logoutButton.classList.remove("hidden");
  if (loginForm) loginForm.classList.add("hidden");
}

function showGuestUI() {
  if (adminLinks) adminLinks.classList.add("hidden");
  if (logoutButton) logoutButton.classList.add("hidden");
  if (loginForm) loginForm.classList.remove("hidden");
  if (userStatus) userStatus.classList.add("hidden");
}

// Перевіряємо роль в Firestore: users/{uid}.role === "admin"
async function isAdminUser(user) {
  if (!user) return false;

  // Якщо email входить у список — вважаємо адміном одразу
  if (user.email && ADMIN_EMAILS.includes(user.email)) {
    return true;
  }

  try {
    const ref  = doc(db, "users", user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) return false;
    const data = snap.data();
    return data.role === "admin";
  } catch (e) {
    console.error("Помилка читання ролі:", e);
    return false;
  }
}

// Обробка сабміту форми логіну
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setAuthMessage("");

    const email = (emailInput?.value || "").trim();
    const pass  = passwordInput?.value || "";

    if (!email || !pass) {
      setAuthMessage("Введи email і пароль.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, pass);
      setAuthMessage("Вхід успішний.", false);
      // onAuthStateChanged сам оновить інтерфейс
    } catch (err) {
      console.error("Login error:", err);
      setAuthMessage("Помилка входу: " + (err.message || "невідома помилка"));
    }
  });
}

// Кнопка виходу
if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      await signOut(auth);
      setAuthMessage("Вихід виконано.", false);
    } catch (err) {
      console.error("Logout error:", err);
      setAuthMessage("Помилка виходу: " + (err.message || "невідома помилка"));
    }
  });
}

// Слухаємо зміну стану авторизації
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showGuestUI();
    setAuthMessage("");
    return;
  }

  const admin = await isAdminUser(user);

  if (admin) {
    showAdminUI();
    setUserStatus(`Адмін: ${user.email}`);
    setAuthMessage("");
  } else {
    // Залогінився не-адмін → не показуємо адмінські лінки
    showGuestUI();
    setUserStatus(`Користувач: ${user.email} (без доступу до адмінки)`);
    setAuthMessage("Цей акаунт не має прав адміністратора.");
  }
});
