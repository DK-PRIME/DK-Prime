import { auth, db } from "./stolarcrap-firebase.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

const notLogged = document.getElementById("account-not-logged");
const logged = document.getElementById("account-logged");
const emailEl = document.getElementById("acc-email");
const roleEl = document.getElementById("acc-role");
const teamEl = document.getElementById("acc-team");
const codeWrap = document.getElementById("acc-code-wrap");
const codeEl = document.getElementById("acc-code");
const btnLogout = document.getElementById("acc-logout");
const statusEl = document.getElementById("acc-status");

function setStatus(msg) {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
}

// Слухаємо логін / логаут
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // не залогінений
    if (logged) logged.style.display = "none";
    if (notLogged) notLogged.style.display = "block";
    setStatus("");
    return;
  }

  // залогінений
  if (notLogged) notLogged.style.display = "none";
  if (logged) logged.style.display = "block";

  emailEl.textContent = user.email || "";

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      roleEl.textContent = "Роль: не визначена";
      teamEl.textContent = "Команда: не привʼязана";
      if (codeWrap) codeWrap.style.display = "none";
      return;
    }

    const data = userSnap.data();
    const isCaptain = data.role === "captain";

    roleEl.textContent = "Роль: " + (isCaptain ? "капітан" : "учасник");

    if (data.teamId) {
      const teamRef = doc(db, "teams", data.teamId);
      const teamSnap = await getDoc(teamRef);

      if (teamSnap.exists()) {
        const team = teamSnap.data();
        teamEl.textContent = "Команда: " + (team.name || "(без назви)");

        if (isCaptain) {
          codeWrap.style.display = "block";
          codeEl.textContent = team.joinCode || "—";
        } else {
          codeWrap.style.display = "none";
        }
      } else {
        teamEl.textContent = "Команда: (не знайдено)";
        codeWrap.style.display = "none";
      }
    } else {
      teamEl.textContent = "Команда: ще не привʼязана";
      codeWrap.style.display = "none";
    }
  } catch (err) {
    console.error(err);
    setStatus("Помилка завантаження даних акаунта.");
  }
});

// Вихід
if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    try {
      await signOut(auth);
      setStatus("Ти вийшов з акаунта.");
    } catch (err) {
      console.error(err);
      setStatus("Помилка виходу.");
    }
  });
}
