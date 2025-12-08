// admin_judge_logic.js
import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ===== DOM елементи =====
const adminSection      = document.getElementById("adminSection");
const judgeSection      = document.getElementById("judgeSection");
const noAccessSection   = document.getElementById("noAccessSection");
const bigActionsSection = document.getElementById("bigActionsSection");

const sysMsg     = document.getElementById("systemMessage");
const userInfoEl = document.getElementById("userInfo");
const logoutBtn  = document.getElementById("logoutBtn");

// Елементи адмінки (сезон/етап)
const seasonSelect     = document.getElementById("seasonSelect");
const seasonInfoEl     = document.getElementById("seasonInfo");
const stageSelect      = document.getElementById("stageSelect");
const stageStatusBadge = document.getElementById("stageStatusBadge");
const toggleStageBtn   = document.getElementById("toggleStageBtn");

// Форма створення сезону / турніру
const createSeasonForm       = document.getElementById("createSeasonForm");
const tournamentTypeSelect   = document.getElementById("tournamentTypeSelect");
const seasonIdInput          = document.getElementById("seasonIdInput");
const seasonTitleInput       = document.getElementById("seasonTitleInput");
const seasonYearInput        = document.getElementById("seasonYearInput");
const seasonStagesInput      = document.getElementById("seasonStagesInput");
const seasonBestOfInput      = document.getElementById("seasonBestOfInput");
const useBigFishBonusInput   = document.getElementById("useBigFishBonusInput");
const seasonConfigBlock      = document.getElementById("seasonConfigBlock");

// ===== Глобальні змінні =====
let currentUser    = null;
let currentSeasonId = null;
let currentStageId  = null;
const seasonsCache = new Map();

// ===== Хелпери =====
function setMessage(text, type = "info") {
  if (!sysMsg) return;
  sysMsg.textContent = text || "";
  if (type === "error")  sysMsg.style.color = "#f97373";
  else if (type === "success") sysMsg.style.color = "#4ade80";
  else sysMsg.style.color = "#e5e7eb";
}

function hideAllSections() {
  adminSection?.classList.add("hidden");
  judgeSection?.classList.add("hidden");
  noAccessSection?.classList.add("hidden");
  bigActionsSection?.classList.add("hidden");
}

function updateStageStatusUI(isOpen) {
  if (!stageStatusBadge || !toggleStageBtn) return;

  if (currentStageId == null) {
    stageStatusBadge.textContent = "Статус: не обрано";
    stageStatusBadge.className = "chip chip-muted";
    toggleStageBtn.disabled = true;
    toggleStageBtn.textContent = "Відкрити реєстрацію";
    return;
  }

  if (isOpen) {
    stageStatusBadge.textContent = "Статус: реєстрація відкрита";
    stageStatusBadge.className = "chip chip-open";
    toggleStageBtn.textContent = "Закрити реєстрацію";
  } else {
    stageStatusBadge.textContent = "Статус: реєстрація закрита";
    stageStatusBadge.className = "chip chip-closed";
    toggleStageBtn.textContent = "Відкрити реєстрацію";
  }
  toggleStageBtn.disabled = false;
}

function updateSeasonInfo(seasonId) {
  if (!seasonInfoEl) return;
  const data = seasonsCache.get(seasonId);
  if (!data) {
    seasonInfoEl.textContent = "";
    return;
  }
  const year   = data.year || "";
  const name   = data.name || data.title || seasonId;
  const stages = data.stagesCount || "";
  const type   = data.type || "season";

  const typeLabel =
    type === "single"
      ? "Одиночний турнір"
      : "Сезон із фіналом";

  seasonInfoEl.textContent =
    `${name}` +
    (year ? ` · ${year}` : "") +
    (stages ? ` · етапів: ${stages}` : "") +
    ` · ${typeLabel}`;
}

function refreshSeasonConfigVisibility() {
  if (!seasonConfigBlock || !tournamentTypeSelect) return;
  const type = tournamentTypeSelect.value || "season";
  if (type === "season") {
    seasonConfigBlock.style.display = "block";
  } else {
    seasonConfigBlock.style.display = "none";
  }
}

// ===== Події =====
logoutBtn?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "./index.html";
  } catch (err) {
    console.error(err);
    setMessage("Помилка виходу: " + err.message, "error");
  }
});

tournamentTypeSelect?.addEventListener("change", () => {
  refreshSeasonConfigVisibility();
});

// ===== Ініціалізація ролі користувача =====
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "./index.html";
    return;
  }
  currentUser = user;

  try {
    setMessage("Перевірка ролі користувача...");
    const userDoc = await getDoc(doc(db, "users", user.uid));

    if (!userDoc.exists()) {
      userInfoEl.textContent = `Увійшов: ${user.email} (немає профілю users)`;
      hideAllSections();
      noAccessSection?.classList.remove("hidden");
      setMessage("Профіль користувача не знайдено.", "error");
      return;
    }

    const data = userDoc.data();
    const role = data.role || "unknown";

    userInfoEl.textContent = `Увійшов: ${user.email} · роль: ${role}`;
    hideAllSections();

    if (role === "admin") {
      adminSection?.classList.remove("hidden");
      bigActionsSection?.classList.remove("hidden");
      setMessage("Доступ надано: організатор.", "success");
      initAdminPanel();
    } else if (role === "judge") {
      judgeSection?.classList.remove("hidden");
      setMessage("Доступ надано: суддя.", "success");
      // окрема сторінка judges.html буде працювати з активним етапом
    } else {
      noAccessSection?.classList.remove("hidden");
      setMessage("Недостатньо прав доступу.", "error");
    }
  } catch (err) {
    console.error(err);
    hideAllSections();
    noAccessSection?.classList.remove("hidden");
    setMessage("Помилка завантаження ролі: " + err.message, "error");
  }
});

// ===== Логіка адмінки =====
async function initAdminPanel() {
  refreshSeasonConfigVisibility();

  if (!seasonSelect) return;

  seasonSelect.disabled = true;
  stageSelect.disabled  = true;
  stageSelect.innerHTML =
    '<option value="">Спочатку обери сезон</option>';
  updateStageStatusUI(false);

  try {
    // 1) Завантажуємо всі сезони / турніри
    const q = query(collection(db, "seasons"), orderBy("year", "asc"));
    const snap = await getDocs(q);

    seasonsCache.clear();

    if (snap.empty) {
      seasonSelect.innerHTML =
        '<option value="">Сезони / турніри ще не створені</option>';
      setMessage("Сезони / турніри ще не створені. Створи перший праворуч.", "info");
      seasonSelect.disabled = true;
      return;
    }

    let preferredSeasonId = null;
    let optionsHtml = "";

    snap.forEach((docSnap) => {
      const d = docSnap.data();
      seasonsCache.set(docSnap.id, d);

      const name = d.name || d.title || docSnap.id;
      optionsHtml += `<option value="${docSnap.id}">${name}</option>`;

      if (d.activeStageId) {
        preferredSeasonId = docSnap.id;
      }
    });

    seasonSelect.innerHTML = optionsHtml;
    seasonSelect.disabled = false;

    // Вибираємо сезон: з активним етапом або перший
    currentSeasonId = preferredSeasonId || snap.docs[0].id;
    seasonSelect.value = currentSeasonId;
    updateSeasonInfo(currentSeasonId);

    // Завантажуємо етапи для цього сезону / турніру
    const seasonData = seasonsCache.get(currentSeasonId) || {};
    await loadStagesForSeason(
      currentSeasonId,
      seasonData.activeStageId || null
    );

    // Слухачі змін
    seasonSelect.addEventListener("change", async (e) => {
      const newSeasonId = e.target.value;
      currentSeasonId = newSeasonId || null;
      currentStageId  = null;
      updateSeasonInfo(currentSeasonId);
      await loadStagesForSeason(currentSeasonId, null);
    });

    stageSelect.addEventListener("change", async (e) => {
      currentStageId = e.target.value || null;
      await refreshStageStatus();
    });

    toggleStageBtn.addEventListener("click", async () => {
      await toggleStageRegistration();
    });

    // Форма створення сезону / турніру
    if (createSeasonForm) {
      createSeasonForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await handleCreateSeason();
      });
    }

  } catch (err) {
    console.error(err);
    setMessage("Помилка завантаження сезонів: " + err.message, "error");
  }
}

async function loadStagesForSeason(seasonId, preferStageId = null) {
  if (!seasonId || !stageSelect) {
    stageSelect.innerHTML =
      '<option value="">Спочатку обери сезон</option>';
    updateStageStatusUI(false);
    return;
  }

  stageSelect.disabled = true;
  stageSelect.innerHTML = '<option value="">Завантаження етапів...</option>';
  updateStageStatusUI(false);

  try {
    const stagesRef = collection(db, "seasons", seasonId, "stages");
    const snap = await getDocs(query(stagesRef, orderBy("order", "asc")));

    if (snap.empty) {
      stageSelect.innerHTML =
        '<option value="">Етапи ще не створені</option>';
      setMessage("Для цього турніру ще не створені етапи.", "info");
      stageSelect.disabled = true;
      return;
    }

    const stages = [];
    let optionsHtml = "";

    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const id = docSnap.id;
      stages.push({ id, ...d });

      const title = d.title || d.name || id;
      optionsHtml += `<option value="${id}">${title}</option>`;
    });

    stageSelect.innerHTML = optionsHtml;
    stageSelect.disabled = false;

    let chosenStage =
      stages.find((s) => s.id === preferStageId) || stages[0];

    currentStageId = chosenStage.id;
    stageSelect.value = currentStageId;
    updateStageStatusUI(!!chosenStage.isRegistrationOpen);

  } catch (err) {
    console.error(err);
    setMessage("Помилка завантаження етапів: " + err.message, "error");
  }
}

async function refreshStageStatus() {
  if (!currentSeasonId || !currentStageId) {
    updateStageStatusUI(false);
    return;
  }

  try {
    const ref = doc(db, "seasons", currentSeasonId, "stages", currentStageId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      updateStageStatusUI(false);
      setMessage("Обраний етап не знайдено у Firestore.", "error");
      return;
    }

    const data = snap.data();
    updateStageStatusUI(!!data.isRegistrationOpen);
  } catch (err) {
    console.error(err);
    setMessage("Не вдалося оновити статус етапу: " + err.message, "error");
  }
}

async function toggleStageRegistration() {
  if (!currentSeasonId || !currentStageId) {
    setMessage("Спочатку обери сезон та етап.", "error");
    return;
  }

  toggleStageBtn.disabled = true;

  try {
    const stageRef = doc(db, "seasons", currentSeasonId, "stages", currentStageId);
    const stageSnap = await getDoc(stageRef);

    if (!stageSnap.exists()) {
      setMessage("Етап не знайдено у Firestore.", "error");
      toggleStageBtn.disabled = false;
      return;
    }

    const currentOpen = !!stageSnap.data().isRegistrationOpen;
    const newOpen = !currentOpen;

    // Оновлюємо сам етап
    await updateDoc(stageRef, {
      isRegistrationOpen: newOpen,
      updatedAt: serverTimestamp(),
    });

    // Оновлюємо сезон — що цей етап активний і його статус
    await updateDoc(doc(db, "seasons", currentSeasonId), {
      activeStageId: currentStageId,
      activeStageOpen: newOpen,
      updatedAt: serverTimestamp(),
    });

    updateStageStatusUI(newOpen);
    setMessage(
      newOpen
        ? "Реєстрацію на етап відкрито."
        : "Реєстрацію на етап закрито.",
      "success"
    );
  } catch (err) {
    console.error(err);
    setMessage("Помилка зміни статусу етапу: " + err.message, "error");
  } finally {
    toggleStageBtn.disabled = false;
  }
}

async function handleCreateSeason() {
  const type =
    (tournamentTypeSelect?.value || "season").trim(); // "season" | "single"

  const seasonId   = (seasonIdInput?.value || "").trim();
  const title      = (seasonTitleInput?.value || "").trim();
  const yearValue  = (seasonYearInput?.value || "").trim();
  const stagesStr  = (seasonStagesInput?.value || "").trim();
  const bestOfStr  = (seasonBestOfInput?.value || "").trim();
  const bigFishOn  = !!useBigFishBonusInput?.checked;

  if (!seasonId || !title || !yearValue) {
    setMessage("Заповни ID, назву та рік турніру.", "error");
    return;
  }

  const year = Number(yearValue);

  let stagesCount, bestCount;

  if (type === "season") {
    if (!stagesStr) {
      setMessage("Для сезону вкажи кількість етапів.", "error");
      return;
    }
    stagesCount = Math.max(1, Number(stagesStr) || 1);

    if (!bestOfStr) {
      setMessage("Для сезону вкажи, скільки етапів брати до рейтингу.", "error");
      return;
    }
    bestCount = Number(bestOfStr) || stagesCount;
    if (bestCount < 1) bestCount = 1;
    if (bestCount > stagesCount) bestCount = stagesCount;
  } else {
    // Одиночний турнір — один етап, без фіналу, без рейтингу сезону
    stagesCount = 1;
    bestCount   = null;
  }

  try {
    const seasonRef = doc(db, "seasons", seasonId);

    const baseData = {
      type,                 // "season" або "single"
      name: title,
      year,
      stagesCount,
      hasFinal: type === "season",
      finalTeamsCount: type === "season" ? 18 : null,
      activeStageId: "e1",
      activeStageOpen: false,
      createdAt: serverTimestamp(),
    };

    if (type === "season") {
      baseData.ratingConfig = {
        mode: "best_of",          // беремо N найкращих етапів
        bestCount: bestCount,     // скільки саме
        totalPlanned: stagesCount // скільки всього етапів
      };
    } else {
      baseData.ratingConfig = null;
    }

    // Схема нарахування балів для цього турніру
    baseData.scoring = {
      strategy: "place_as_points",  // місце = бали
      bigFishEnabled: bigFishOn,    // чи застосовувати бонус
      bigFishThresholdKg: 13,       // поріг великої риби
      bigFishBonusPerStage: -1,     // -1 бал за етап, якщо є 13+ кг
      bigFishOncePerStage: true,    // тільки 1 раз за етап для команди
      missStagePenalty: 9           // штраф за пропущений етап (для сезону)
    };

    await setDoc(seasonRef, baseData);

    // 2) Створюємо етапи
    const stagesRef = collection(db, "seasons", seasonId, "stages");

    if (type === "single") {
      // Одиночний турнір: один етап e1
      await setDoc(doc(stagesRef, "e1"), {
        title: "Один етап",
        order: 1,
        type: "stage",
        isRegistrationOpen: false,
        createdAt: serverTimestamp(),
      });
    } else {
      // Сезон: етапи e1..eN + фінал
      for (let i = 1; i <= stagesCount; i++) {
        const stageId = `e${i}`;
        await setDoc(doc(stagesRef, stageId), {
          title: `Етап ${i}`,
          order: i,
          type: "stage",
          isRegistrationOpen: false,
          createdAt: serverTimestamp(),
        });
      }

      await setDoc(doc(stagesRef, "final"), {
        title: "Фінал",
        order: stagesCount + 1,
        type: "final",
        isRegistrationOpen: false,
        createdAt: serverTimestamp(),
      });
    }

    setMessage("Турнір і етапи успішно створені.", "success");

    // Оновлюємо список сезонів / турнірів в UI
    await initAdminPanel();
  } catch (err) {
    console.error(err);
    setMessage("Помилка створення турніру: " + err.message, "error");
  }
}

// Початкова синхронізація видимості
refreshSeasonConfigVisibility();
