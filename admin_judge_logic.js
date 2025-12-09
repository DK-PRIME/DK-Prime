import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --------- DOM ----------
const userInfoEl = document.getElementById("userInfo");
const systemMessageEl = document.getElementById("systemMessage");

const adminSectionEl = document.getElementById("adminSection");
const noAccessSectionEl = document.getElementById("noAccessSection");
const bigActionsSectionEl = document.getElementById("bigActionsSection");

const seasonSelectEl = document.getElementById("seasonSelect");
const seasonInfoEl = document.getElementById("seasonInfo");
const stageSelectEl = document.getElementById("stageSelect");
const stageStatusBadgeEl = document.getElementById("stageStatusBadge");
const toggleStageBtn = document.getElementById("toggleStageBtn");

const createSeasonForm = document.getElementById("createSeasonForm");
const seasonTypeSelect = document.getElementById("seasonTypeSelect");
const seasonIdInput = document.getElementById("seasonIdInput");
const seasonTitleInput = document.getElementById("seasonTitleInput");
const seasonYearInput = document.getElementById("seasonYearInput");
const seasonStagesInput = document.getElementById("seasonStagesInput");
const ratingStagesInput = document.getElementById("ratingStagesInput");
const bigFishBonusCheckbox = document.getElementById("bigFishBonusCheckbox");

const logoutBtn = document.getElementById("logoutBtn");

// щоб не навішувати обробники по 10 разів
let seasonsLoaded = false;
let currentSeasonId = null;
let currentStageId = null;

// ---------- helpers ----------
function setSystemMessage(text, type = "info") {
  if (!systemMessageEl) return;
  systemMessageEl.textContent = text || "";
  systemMessageEl.style.color =
    type === "error" ? "#f97373" : type === "success" ? "#bbf7d0" : "#9ca3af";
}

function setStageBadge(state) {
  if (!stageStatusBadgeEl) return;
  if (state === "open") {
    stageStatusBadgeEl.textContent = "Статус: реєстрація відкрита";
    stageStatusBadgeEl.className = "chip chip-open";
  } else if (state === "closed") {
    stageStatusBadgeEl.textContent = "Статус: реєстрація закрита";
    stageStatusBadgeEl.className = "chip chip-closed";
  } else {
    stageStatusBadgeEl.textContent = "Статус: не обрано";
    stageStatusBadgeEl.className = "chip chip-muted";
  }
}

// ---------- auth / role ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  userInfoEl.textContent = `Увійшов: ${user.email} · роль: завантаження...`;

  try {
    const userDocRef = doc(db, "users", user.uid);
    const snap = await getDoc(userDocRef);
    const data = snap.exists() ? snap.data() : null;
    const role = data?.role || "guest";

    userInfoEl.textContent = `Увійшов: ${user.email} · роль: ${role}`;

    if (role !== "admin") {
      adminSectionEl.classList.add("hidden");
      bigActionsSectionEl.classList.add("hidden");
      noAccessSectionEl.classList.remove("hidden");
      setSystemMessage(
        "Панель організатора доступна тільки акаунту з роллю admin.",
        "error"
      );
      return;
    }

    // показуємо адмінку
    noAccessSectionEl.classList.add("hidden");
    adminSectionEl.classList.remove("hidden");
    bigActionsSectionEl.classList.remove("hidden");

    await loadSeasons();
  } catch (err) {
    console.error(err);
    setSystemMessage("Помилка перевірки доступу: " + err.message, "error");
  }
});

logoutBtn?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error(err);
  }
});

// ---------- load seasons & stages ----------
async function loadSeasons() {
  seasonSelectEl.disabled = true;
  stageSelectEl.disabled = true;
  seasonSelectEl.innerHTML =
    '<option value="">Завантаження сезонів...</option>';
  stageSelectEl.innerHTML =
    '<option value="">Спочатку обери сезон</option>';
  setStageBadge("none");
  toggleStageBtn.disabled = true;

  try {
    const q = query(collection(db, "seasons"), orderBy("year", "asc"));
    const snap = await getDocs(q);

    if (snap.empty) {
      seasonSelectEl.innerHTML =
        '<option value="">Сезони / турніри ще не створені</option>';
      seasonSelectEl.disabled = true;
      seasonInfoEl.textContent =
        "Сезони / турніри ще не створені. Створи перший праворуч.";
      setSystemMessage("", "info");
      return;
    }

    // заповнюємо select
    seasonSelectEl.innerHTML = "";
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const opt = document.createElement("option");
      opt.value = docSnap.id;
      opt.textContent = data.title || data.name || docSnap.id;
      seasonSelectEl.appendChild(opt);
    });

    seasonSelectEl.disabled = false;
    seasonsLoaded = true;

    // вішаємо обробник, якщо ще не
    if (!seasonSelectEl.dataset.bound) {
      seasonSelectEl.addEventListener("change", handleSeasonChange);
      seasonSelectEl.dataset.bound = "1";
    }

    // вибираємо перший
    currentSeasonId = seasonSelectEl.value;
    await handleSeasonChange();
  } catch (err) {
    console.error(err);
    setSystemMessage("Помилка завантаження сезонів: " + err.message, "error");
  }
}

async function handleSeasonChange() {
  const seasonId = seasonSelectEl.value;
  currentSeasonId = seasonId || null;
  currentStageId = null;
  stageSelectEl.innerHTML =
    '<option value="">Спочатку обери сезон</option>';
  stageSelectEl.disabled = true;
  setStageBadge("none");
  toggleStageBtn.disabled = true;
  seasonInfoEl.textContent = "";

  if (!seasonId) return;

  try {
    const seasonRef = doc(db, "seasons", seasonId);
    const seasonSnap = await getDoc(seasonRef);
    if (!seasonSnap.exists()) {
      setSystemMessage("Сезон не знайдено у Firestore.", "error");
      return;
    }
    const season = seasonSnap.data();
    seasonInfoEl.textContent =
      `Поточний сезон: ${(season.title || season.name || seasonId)} · ` +
      `тип: ${season.type || "невідомо"}`;

    // тягнемо етапи
    const stagesCol = collection(seasonRef, "stages");
    const stagesSnap = await getDocs(query(stagesCol, orderBy("order", "asc")));

    if (stagesSnap.empty) {
      stageSelectEl.innerHTML =
        '<option value="">У сезоні ще немає етапів</option>';
      stageSelectEl.disabled = true;
      return;
    }

    stageSelectEl.innerHTML = "";
    stagesSnap.forEach((docSnap) => {
      const s = docSnap.data();
      const opt = document.createElement("option");
      opt.value = docSnap.id;
      const label =
        s.label ||
        (s.isFinal ? "Фінал" : `Етап ${s.order || ""}`) ||
        docSnap.id;
      opt.textContent = label;
      stageSelectEl.appendChild(opt);
    });

    stageSelectEl.disabled = false;

    if (!stageSelectEl.dataset.bound) {
      stageSelectEl.addEventListener("change", handleStageChange);
      stageSelectEl.dataset.bound = "1";
    }

    // вибираємо перший етап
    currentStageId = stageSelectEl.value;
    await handleStageChange();
  } catch (err) {
    console.error(err);
    setSystemMessage("Помилка завантаження етапів: " + err.message, "error");
  }
}

async function handleStageChange() {
  const seasonId = currentSeasonId;
  const stageId = stageSelectEl.value;
  currentStageId = stageId || null;
  toggleStageBtn.disabled = !stageId;

  if (!seasonId || !stageId) {
    setStageBadge("none");
    return;
  }

  try {
    const stageRef = doc(db, "seasons", seasonId, "stages", stageId);
    const snap = await getDoc(stageRef);
    if (!snap.exists()) {
      setStageBadge("none");
      setSystemMessage("Етап не знайдено у Firestore.", "error");
      return;
    }
    const stage = snap.data();
    const isOpen = !!stage.isRegistrationOpen;

    setStageBadge(isOpen ? "open" : "closed");
    toggleStageBtn.textContent = isOpen
      ? "Закрити реєстрацію"
      : "Відкрити реєстрацію";
    setSystemMessage("", "info");
  } catch (err) {
    console.error(err);
    setSystemMessage("Помилка читання етапу: " + err.message, "error");
  }
}

toggleStageBtn?.addEventListener("click", async () => {
  const seasonId = currentSeasonId;
  const stageId = currentStageId;
  if (!seasonId || !stageId) return;

  try {
    const stageRef = doc(db, "seasons", seasonId, "stages", stageId);
    const snap = await getDoc(stageRef);
    if (!snap.exists()) return;

    const current = !!snap.data().isRegistrationOpen;
    const next = !current;

    await updateDoc(stageRef, {
      isRegistrationOpen: next,
      updatedAt: serverTimestamp()
    });

    // зберігаємо в сезоні, який етап активний
    const seasonRef = doc(db, "seasons", seasonId);
    await updateDoc(seasonRef, {
      activeStageId: stageId,
      activeStageOpen: next,
      updatedAt: serverTimestamp()
    });

    setStageBadge(next ? "open" : "closed");
    toggleStageBtn.textContent = next
      ? "Закрити реєстрацію"
      : "Відкрити реєстрацію";

    setSystemMessage(
      next
        ? "Реєстрацію для цього етапу відкрито."
        : "Реєстрацію для цього етапу закрито.",
      "success"
    );
  } catch (err) {
    console.error(err);
    setSystemMessage("Помилка зміни статусу етапу: " + err.message, "error");
  }
});

// ---------- створення сезону / турніру ----------
createSeasonForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const type = seasonTypeSelect.value || "season_final";
  const seasonId = seasonIdInput.value.trim();
  const title = seasonTitleInput.value.trim();
  const year = Number(seasonYearInput.value || new Date().getFullYear());
  const numStages = Number(seasonStagesInput.value || 1);
  const ratingStages = Number(ratingStagesInput.value || 0);
  const bigFishBonusEnabled = !!bigFishBonusCheckbox.checked;

  if (!seasonId || !title || !year || !numStages) {
    setSystemMessage("Заповни ID, назву, рік і кількість етапів.", "error");
    return;
  }

  if (type === "season_final" && ratingStages > numStages) {
    setSystemMessage(
      "Кількість етапів для рейтингу не може бути більшою за кількість етапів сезону.",
      "error"
    );
    return;
  }

  const seasonRef = doc(db, "seasons", seasonId);

  try {
    setSystemMessage("Створюю сезон та етапи...", "info");

    // основний документ сезону
    await setDoc(seasonRef, {
      id: seasonId,
      title,
      year,
      type,
      numStages,
      ratingStages: type === "season_final" ? ratingStages : 0,
      bigFishBonusEnabled,
      activeStageId: null,
      activeStageOpen: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // підколекція stages
    const stagesCol = collection(seasonRef, "stages");

    if (type === "season_final") {
      // звичайні етапи
      for (let i = 1; i <= numStages; i++) {
        const stageId = `${seasonId}_e${i}`;
        await setDoc(doc(stagesCol, stageId), {
          id: stageId,
          seasonId,
          order: i,
          label: `Етап ${i}`,
          isFinal: false,
          isRegistrationOpen: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      // фінал
      const finalStageId = `${seasonId}_final`;
      await setDoc(doc(stagesCol, finalStageId), {
        id: finalStageId,
        seasonId,
        order: numStages + 1,
        label: "Фінал",
        isFinal: true,
        isRegistrationOpen: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      // одиночне змагання: один етап без фіналу
      const stageId = `${seasonId}_main`;
      await setDoc(doc(stagesCol, stageId), {
        id: stageId,
        seasonId,
        order: 1,
        label: "Основний етап",
        isFinal: false,
        isRegistrationOpen: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    setSystemMessage("Сезон / турнір успішно створено.", "success");

    // очищаємо форму тільки частково
    // seasonId залишаємо, щоб не друкувати заново
    seasonTitleInput.value = "";
    // оновлюємо список сезонів
    await loadSeasons();
  } catch (err) {
    console.error(err);
    setSystemMessage("Помилка створення сезону: " + err.message, "error");
  }
});
