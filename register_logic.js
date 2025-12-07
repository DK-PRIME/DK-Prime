// register_logic.js
import { auth, db } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  collection,
  addDoc,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// -------------------------------
// DOM
// -------------------------------
const form = document.getElementById("registerForm");
const msgEl = document.getElementById("registerMessage");

function showMessage(text, isError = true) {
  if (!msgEl) return;
  msgEl.textContent = text || "";
  msgEl.style.color = isError ? "#ef4444" : "#22c55e";
}

function makeJoinCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// -------------------------------
// Обробка форми
// -------------------------------
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();                           // ← щоб сторінка не перезавантажувалася
    showMessage("");

    const submitBtn = form.querySelector("button[type='submit']");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Створюємо...";
    }

    const fullName  = form.fullName.value.trim();
    const email     = form.email.value.trim();
    const password  = form.password.value;
    const phone     = form.phone.value.trim();
    const teamName  = form.teamName.value.trim();
    const agree     = form.agree.checked;

    if (!agree) {
      showMessage("Потрібно дати згоду на обробку персональних даних.");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Створити акаунт і команду";
      }
      return;
    }

    try {
      // 1) Створюємо користувача в Auth
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const user = cred.user;

      // 2) Записуємо його профіль у Firestore: users/{uid}
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, {
        email,
        name: fullName,
        phone,
        role: "admin",              // ти зараз капітан/адмін, далі зробимо ролі judge etc
        createdAt: serverTimestamp()
      });

      // 3) Створюємо тестову команду в testTeams (як у тебе вже є)
      const teamRef = await addDoc(collection(db, "testTeams"), {
        captainUID: user.uid,
        name: teamName,
        phone,
        joinCode: makeJoinCode(),
        createdAt: serverTimestamp()
      });

      console.log("Створена команда з id:", teamRef.id);

      showMessage("Акаунт і команда успішно створені!", false);

      // 4) Перекидаємо назад на вхід в адмінку
      setTimeout(() => {
        window.location.href = "./index.html";
      }, 800);
    } catch (err) {
      console.error("Помилка реєстрації:", err);
      showMessage(`Помилка: ${err.code || err.message}`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Створити акаунт і команду";
      }
    }
  });
}
