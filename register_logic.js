// register_logic.js
import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword } from "firebase/auth";
import {
  doc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

const form = document.getElementById("registerForm");
const messageEl = document.getElementById("registerMessage");
const submitBtn = form.querySelector('button[type="submit"]');

function showError(text) {
  messageEl.style.color = "#ef4444";
  messageEl.textContent = text;
}

function showSuccess(text) {
  messageEl.style.color = "#22c55e";
  messageEl.textContent = text;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  messageEl.textContent = "";

  const fullName = form.fullName.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  const phone = form.phone.value.trim();
  const teamName = form.teamName.value.trim();
  const agree = form.agree.checked;

  if (!agree) {
    showError("Потрібно погодитися на обробку персональних даних.");
    return;
  }

  if (!fullName || !email || !password || !phone || !teamName) {
    showError("Будь ласка, заповни всі поля.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Створюємо...";

  try {
    // 1) Створюємо користувача в Auth
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    // 2) Створюємо документ користувача users/{uid}
    await setDoc(doc(db, "users", uid), {
      email,
      name: fullName,
      phone,
      role: "captain",          // звичайні капітани. Себе можеш змінити на "admin" у Firestore
      createdAt: serverTimestamp(),
    });

    // 3) Створюємо команду в колекції teams
    const teamRef = await addDoc(collection(db, "teams"), {
      teamName,
      captainUserId: uid,
      phone,
      createdAt: serverTimestamp(),
    });

    // 4) Прив’язуємо teamId до користувача
    await setDoc(
      doc(db, "users", uid),
      {
        teamId: teamRef.id,
      },
      { merge: true }
    );

    showSuccess("Акаунт і команда створені. Зараз перейдемо на сторінку входу…");

    setTimeout(() => {
      window.location.href = "./index.html";
    }, 1500);
  } catch (err) {
    console.error(err);
    showError("Помилка: " + (err?.message || "не вдалося створити акаунт"));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Створити акаунт і команду";
  }
});
