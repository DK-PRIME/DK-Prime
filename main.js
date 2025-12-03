import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

import {
  doc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const btnRegister = document.getElementById("btnRegister");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const authStatus = document.getElementById("authStatus");

const teamSection = document.getElementById("teamSection");
const teamNameInput = document.getElementById("teamName");
const btnCreateTeam = document.getElementById("btnCreateTeam");
const teamStatus = document.getElementById("teamStatus");
const teamsList = document.getElementById("teamsList");

const currentUserInfo = document.getElementById("currentUserInfo");

let unsubscribeTeams = null;

function showStatus(el, msg, isError = false) {
  el.textContent = msg;
  el.style.color = isError ? "#f87171" : "#6ee7b7";
}

// Реєстрація капітана
btnRegister.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password) {
    showStatus(authStatus, "Введи email і пароль", true);
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const user = cred.user;

    await setDoc(doc(db, "users", user.uid), {
      email: user.email,
      role: "captain",
      createdAt: serverTimestamp()
    });

    showStatus(authStatus, "Капітан зареєстрований і залогінений ✅");
  } catch (err) {
    console.error(err);
    showStatus(authStatus, "Помилка реєстрації: " + err.message, true);
  }
});

// Логін
btnLogin.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password) {
    showStatus(authStatus, "Введи email і пароль", true);
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showStatus(authStatus, "Успішний вхід ✅");
  } catch (err) {
    console.error(err);
    showStatus(authStatus, "Помилка входу: " + err.message, true);
  }
});

// Вихід
btnLogout.addEventListener("click", async () => {
  try {
    await signOut(auth);
    showStatus(authStatus, "Вийшов з акаунта");
  } catch (err) {
    console.error(err);
    showStatus(authStatus, "Помилка виходу: " + err.message, true);
  }
});

// Створення тестової команди
btnCreateTeam.addEventListener("click", async () => {
  const name = teamNameInput.value.trim();
  const user = auth.currentUser;

  if (!user) {
    showStatus(teamStatus, "Спочатку увійди в акаунт", true);
    return;
  }
  if (!name) {
    showStatus(teamStatus, "Введи назву команди", true);
    return;
  }

  try {
    const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    await addDoc(collection(db, "testTeams"), {
      name,
      captainUid: user.uid,
      joinCode,
      createdAt: serverTimestamp()
    });

    showStatus(teamStatus, "Команда створена ✅ Код: " + joinCode);
    teamNameInput.value = "";
  } catch (err) {
    console.error(err);
    showStatus(teamStatus, "Помилка створення команди: " + err.message, true);
  }
});

// Слухаємо зміну auth
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUserInfo.textContent = `Залогінений як: ${user.email}`;
    btnLogout.style.display = "block";
    teamSection.style.display = "block";

    if (unsubscribeTeams) unsubscribeTeams();

    const q = query(
      collection(db, "testTeams"),
      orderBy("createdAt", "desc")
    );

    unsubscribeTeams = onSnapshot(q, (snapshot) => {
      teamsList.innerHTML = "";
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const div = document.createElement("div");
        div.textContent =
          `${data.name} | captain: ${data.captainUid.slice(0, 6)}.. | code: ${data.joinCode || "—"}`;
        teamsList.appendChild(div);
      });

      if (snapshot.empty) {
        teamsList.textContent = "Поки що немає команд";
      }
    });
  } else {
    currentUserInfo.textContent = "Не залогінений";
    btnLogout.style.display = "none";
    teamSection.style.display = "none";
    if (unsubscribeTeams) {
      unsubscribeTeams();
      unsubscribeTeams = null;
    }
    teamsList.innerHTML = "";
  }
});
