// register_logic.js
import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const form = document.getElementById("registerForm");
const msg = document.getElementById("registerMessage");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.style.color = "#ef4444";
  msg.textContent = "";

  const fullName = form.fullName.value.trim();
  const email = form.email.value.trim().toLowerCase();
  const password = form.password.value;
  const phone = form.phone.value.trim();
  const teamName = form.teamName.value.trim();
  const agree = form.agree.checked;

  if (!agree) {
    msg.textContent = "Потрібно поставити галочку згоди.";
    return;
  }

  try {
    // 1. Реєструємо користувача в Authentication
    const userCred = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    const uid = userCred.user.uid;

    // 2. Створюємо запис у колекції users
    await setDoc(doc(db, "users", uid), {
      name: fullName,
      email,
      phone,
      role: "captain",            // потім можеш змінити на "admin" руками в Firestore
      createdAt: serverTimestamp()
    });

    // 3. Створюємо команду всередині користувача
    const teamId = teamName.replace(/\s+/g, "_");
    await setDoc(doc(db, "users", uid, "teams", teamId), {
      name: teamName,
      captainUserId: uid,
      phone,
      isVerified: false,
      createdAt: serverTimestamp()
    });

    msg.style.color = "#22c55e";
    msg.textContent = "Акаунт створено! Зараз перейдемо до входу…";

    setTimeout(() => {
      window.location.href = "./index.html";
    }, 1500);
  } catch (error) {
    console.error(error);
    let text = error.message;

    if (error.code === "auth/email-already-in-use") {
      text = "Такий email вже використовується. Спробуй увійти.";
    } else if (error.code === "auth/weak-password") {
      text = "Пароль має бути не менше 6 символів.";
    }

    msg.textContent = "Помилка: " + text;
  }
});
