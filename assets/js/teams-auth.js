// Використовуємо вже ініціалізований Firebase з твого модуля
import { auth, db } from "./stolarcarp-firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

import {
  collection,
  addDoc,
  doc,
  setDoc,
  getDocs,
  getDoc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// ---------- DOM ----------
const emailInput    = document.getElementById("email");
const passwordInput = document.getElementById("password");
const teamNameInput = document.getElementById("teamName");
const joinCodeInput = document.getElementById("joinCode");

const btnRegister   = document.getElementById("btnRegister");
const btnLogin      = document.getElementById("btnLogin");

const authStatusEl  = document.getElementById("authStatus");
const teamStatusEl  = document.getElementById("teamStatus");

// ---------- Хелпери ----------
function setStatus(el, msg, type = "normal") {
  if (!el) return;
  el.textContent = msg || "";
  if (type === "error")  el.style.color = "#f87171";
  else if (type === "ok") el.style.color = "#4ade80";
  else el.style.color = "#e5e7eb";
}

function setLoading(isLoading) {
  if (btnRegister) btnRegister.disabled = isLoading;
  if (btnLogin)    btnLogin.disabled    = isLoading;
}

function getSelectedRole() {
  const el = document.querySelector('input[name="role"]:checked');
  return el ? el.value : "captain";
}

// генеруємо код команди (для капітана)
function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

// ---------- РЕЄСТРАЦІЯ (капітан / учасник) ----------
if (btnRegister) {
  btnRegister.addEventListener("click", async () => {
    const email    = (emailInput?.value || "").trim();
    const password = (passwordInput?.value || "").trim();
    const role     = getSelectedRole();
    const teamName = (teamNameInput?.value || "").trim();
    const joinCode = (joinCodeInput?.value || "").trim().toUpperCase();

    setStatus(authStatusEl, "");
    setStatus(teamStatusEl, "");

    if (!email || !password) {
      setStatus(authStatusEl, "Введи email і пароль.", "error");
      return;
    }
    if (password.length < 6) {
      setStatus(authStatusEl, "Пароль має містити мінімум 6 символів.", "error");
      return;
    }

    if (role === "captain" && !teamName) {
      setStatus(teamStatusEl, "Введи назву команди для капітана.", "error");
      return;
    }

    if (role === "member" && !joinCode) {
      setStatus(teamStatusEl, "Введи код від капітана.", "error");
      return;
    }

    setLoading(true);

    try {
      let teamId = null;
      let teamData = null;

      // Якщо УЧАСНИК — спочатку шукаємо команду по коду
      if (role === "member") {
        const teamsRef = collection(db, "teams");
        const q = query(teamsRef, where("joinCode", "==", joinCode));
        const snap = await getDocs(q);

        if (snap.empty) {
          setStatus(teamStatusEl, "Команду з таким кодом не знайдено. Перевір код у капітана.", "error");
          setLoading(false);
          return;
        }

        const firstDoc = snap.docs[0];
        teamId = firstDoc.id;
        teamData = firstDoc.data();
      }

      // Створюємо користувача (і капітан, і учасник)
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const user = cred.user;

      // Базовий документ користувача
      const userRef = doc(db, "users", user.uid);

      if (role === "captain") {
        // Генеруємо код команди
        const code = randomCode(6);

        // Створюємо команду
        const teamRef = await addDoc(collection(db, "teams"), {
          name: teamName,
          captainUid: user.uid,
          joinCode: code,
          createdAt: serverTimestamp()
        });

        teamId = teamRef.id;

        // Запис про користувача-капітан
        await setDoc(userRef, {
          email,
          role: "captain",
          teamId,
          createdAt: serverTimestamp()
        });

        setStatus(authStatusEl, "Акаунт капітана створено та залогінено.", "ok");
        setStatus(teamStatusEl, "Команда створена. Код для учасників: " + code, "ok");
      } else {
        // Учасник — приєднуємо до вже існуючої команди
        await setDoc(userRef, {
          email,
          role: "member",
          teamId,
          createdAt: serverTimestamp()
        });

        setStatus(
          authStatusEl,
          "Акаунт учасника створено та залогінено.",
          "ok"
        );
        setStatus(
          teamStatusEl,
          "Ти приєднався до команди: " + (teamData?.name || ""),
          "ok"
        );
      }

      // Чистимо поля (крім email, щоб видно було, хто залогінений)
      if (passwordInput) passwordInput.value = "";
      if (role === "captain" && teamNameInput) teamNameInput.value = "";
      if (role === "member" && joinCodeInput) joinCodeInput.value = "";

    } catch (err) {
      console.error(err);
      let msg = "Помилка реєстрації.";
      if (err.code === "auth/email-already-in-use") msg = "Такий email вже використовується.";
      if (err.code === "auth/invalid-email")       msg = "Невірний формат email.";
      setStatus(authStatusEl, msg, "error");
    } finally {
      setLoading(false);
    }
  });
}

// ---------- ВХІД ----------
if (btnLogin) {
  btnLogin.addEventListener("click", async () => {
    const email    = (emailInput?.value || "").trim();
    const password = (passwordInput?.value || "").trim();

    setStatus(authStatusEl, "");
    setStatus(teamStatusEl, "");

    if (!email || !password) {
      setStatus(authStatusEl, "Введи email і пароль.", "error");
      return;
    }

    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const user = cred.user;

      setStatus(authStatusEl, "Успішний вхід.", "ok");

      // Підтягуємо інфу про роль і команду
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data.teamId) {
          const teamRef = doc(db, "teams", data.teamId);
          const teamSnap = await getDoc(teamRef);
          if (teamSnap.exists()) {
            const team = teamSnap.data();
            if (data.role === "captain") {
              setStatus(
                teamStatusEl,
                `Капітан команди "${team.name}". Код для учасників: ${team.joinCode || "—"}`,
                "ok"
              );
            } else {
              setStatus(
                teamStatusEl,
                `Учасник команди "${team.name}"`,
                "ok"
              );
            }
          } else {
            setStatus(teamStatusEl, "Команду не знайдено (teamId невалідний).", "error");
          }
        } else {
          setStatus(teamStatusEl, "Команда ще не привʼязана до акаунта.", "normal");
        }
      } else {
        setStatus(teamStatusEl, "Профіль користувача у базі ще не створений.", "normal");
      }

      if (passwordInput) passwordInput.value = "";
    } catch (err) {
      console.error(err);
      let msg = "Помилка входу.";
      if (err.code === "auth/user-not-found") msg = "Користувача не знайдено.";
      if (err.code === "auth/wrong-password") msg = "Невірний пароль.";
      setStatus(authStatusEl, msg, "error");
    } finally {
      setLoading(false);
    }
  });
}

// ---------- Слухаємо зміну стану auth (опціонально) ----------
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("Залогінений як:", user.email);
  } else {
    console.log("Не залогінений");
  }
});
