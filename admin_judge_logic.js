// admin_judge_logic.js
import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// DOM
const adminSection    = document.getElementById("adminSection");
const judgeSection    = document.getElementById("judgeSection");
const noAccessSection = document.getElementById("noAccessSection");
const sysMsg          = document.getElementById("systemMessage");
const userInfo        = document.getElementById("userInfo");
const logoutBtn       = document.getElementById("logoutBtn");

// елементи адмін-панелі
const seasonSelect        = document.getElementById("seasonSelect");
const stageSelect         = document.getElementById("stageSelect");
const seasonInfo          = document.getElementById("seasonInfo");
const stageStatusBadge    = document.getElementById("stageStatusBadge");
const toggleStageBtn      = document.getElementById("toggleStageBtn");
const createSeasonForm    = document.getElementById("createSeasonForm");

// глобальний стан
let currentSeasonId  = null;
let currentStageId   = null;
let currentStageOpen = false;
let cachedSeasons    = [];
let cachedStagesBySeason = {}; // { seasonId: [ {id, data} ] }

function setMessage(text, type = "info"){
  if(!sysMsg) return;
  sysMsg.textContent = text || "";
  if(type === "error"){
    sysMsg.style.color = "#f97373";
  }else if(type === "success"){
    sysMsg.style.color = "#4ade80";
  }else{
    sysMsg.style.color = "#e5e7eb";
  }
}

function hideAll(){
  adminSection?.classList.add("hidden");
  judgeSection?.classList.add("hidden");
  noAccessSection?.classList.add("hidden");
}

// вихід
logoutBtn?.addEventListener("click", async () => {
  try{
    await signOut(auth);
    window.location.href = "./index.html";
  }catch(err){
    console.error(err);
    setMessage("Помилка виходу: " + err.message, "error");
  }
});

// ==============================
//  AUTH + РОЛІ
// ==============================
onAuthStateChanged(auth, async (user) => {
  if(!user){
    window.location.href = "./index.html";
    return;
  }

  try{
    setMessage("Перевірка ролі користувача...");
    const userDoc = await getDoc(doc(db, "users", user.uid));

    if(!userDoc.exists()){
      userInfo.textContent = `Увійшов: ${user.email} (немає профілю users)`;
      hideAll();
      noAccessSection?.classList.remove("hidden");
      setMessage("Профіль користувача не знайдено.", "error");
      return;
    }

    const data = userDoc.data();
    const role = data.role || "unknown";

    userInfo.textContent = `Увійшов: ${user.email} · роль: ${role}`;
    hideAll();

    if(role === "admin"){
      adminSection?.classList.remove("hidden");
      document.getElementById("bigActionsSection")?.classList.remove("hidden");
      setMessage("Доступ надано: організатор.", "success");
      initAdminPanel();
    }else if(role === "judge"){
      judgeSection?.classList.remove("hidden");
      setMessage("Доступ надано: суддя.", "success");
      // окрема сторінка для суддів (judges.html)
    }else{
      noAccessSection?.classList.remove("hidden");
      setMessage("Недостатньо прав доступу.", "error");
    }
  }catch(err){
    console.error(err);
    hideAll();
    noAccessSection?.classList.remove("hidden");
    setMessage("Помилка завантаження ролі: " + err.message, "error");
  }
});

// ==============================
//  ІНІЦІАЛІЗАЦІЯ АДМІН-ПАНЕЛІ
// ==============================
function initAdminPanel(){
  // завантажити сезони + активний етап
  loadSeasonsAndActive().catch(err => {
    console.error(err);
    setMessage("Помилка ініціалізації панелі організатора: " + err.message, "error");
  });

  // створення сезону
  if(createSeasonForm){
    createSeasonForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try{
        await handleCreateSeasonForm();
      }catch(err){
        console.error(err);
        setMessage("Помилка створення сезону: " + err.message, "error");
      }
    });
  }

  // зміна сезону
  seasonSelect?.addEventListener("change", () => {
    const seasonId = seasonSelect.value || null;
    onSeasonChanged(seasonId);
  });

  // зміна етапу
  stageSelect?.addEventListener("change", () => {
    const stageId = stageSelect.value || null;
    onStageChanged(stageId);
  });

  // відкриття/закриття етапу
  toggleStageBtn?.addEventListener("click", () => {
    if(!currentSeasonId || !currentStageId) return;
    toggleStageOpen().catch(err => {
      console.error(err);
      setMessage("Помилка зміни статусу етапу: " + err.message, "error");
    });
  });
}

// ==============================
//  ЗАВАНТАЖЕННЯ СЕЗОНІВ + ACTIVE
// ==============================
async function loadSeasonsAndActive(){
  setMessage("Завантаження сезонів...");
  cachedSeasons = [];
  cachedStagesBySeason = {};
  currentSeasonId  = null;
  currentStageId   = null;
  currentStageOpen = false;

  // 1) читаємо seasons (без orderBy → БЕЗ індексів)
  const snap = await getDocs(collection(db, "seasons"));
  snap.forEach(d => {
    cachedSeasons.push({ id: d.id, data: d.data() });
  });

  // відсортуємо в JS (за роком та id)
  cachedSeasons.sort((a,b) => {
    const ay = a.data.year || 0;
    const by = b.data.year || 0;
    if(ay !== by) return ay - by;
    return (""+a.id).localeCompare(""+b.id);
  });

  // заповнюємо select
  if(seasonSelect){
    seasonSelect.innerHTML = "";
    if(cachedSeasons.length === 0){
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Немає сезонів";
      seasonSelect.appendChild(opt);
      seasonSelect.disabled = true;
    }else{
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "Оберіть сезон";
      seasonSelect.appendChild(opt0);

      cachedSeasons.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.data.name || s.id;
        seasonSelect.appendChild(opt);
      });
      seasonSelect.disabled = false;
    }
  }

  // 2) читаємо settings/active
  const activeDoc = await getDoc(doc(db, "settings", "active"));
  if(activeDoc.exists()){
    const ad = activeDoc.data();
    if(ad.seasonId){
      currentSeasonId = ad.seasonId;
      if(seasonSelect){
        seasonSelect.value = ad.seasonId;
      }
      updateSeasonInfo();
      // завантажимо етапи цього сезону
      await loadStagesForSeason(ad.seasonId);
      if(ad.stageId){
        currentStageId = ad.stageId;
        if(stageSelect){
          stageSelect.value = ad.stageId;
        }
        const stage = findStageInCache(ad.seasonId, ad.stageId);
        currentStageOpen = !!(stage && stage.data.isOpen);
        updateStageStatusBadge();
      }
    }else{
      updateSeasonInfo();
      resetStageSelect("Спочатку обери сезон");
    }
  }else{
    updateSeasonInfo();
    resetStageSelect("Спочатку обери сезон");
  }

  setMessage("");
}

// ==============================
//  СТВОРЕННЯ СЕЗОНУ + ЕТАПІВ
// ==============================
async function handleCreateSeasonForm(){
  if(!createSeasonForm) return;

  const seasonIdInput   = document.getElementById("seasonIdInput");
  const seasonTitleInput= document.getElementById("seasonTitleInput");
  const seasonYearInput = document.getElementById("seasonYearInput");
  const seasonStagesInput = document.getElementById("seasonStagesInput");

  const seasonId   = seasonIdInput.value.trim();
  const seasonName = seasonTitleInput.value.trim();
  const year       = parseInt(seasonYearInput.value.trim(),10) || new Date().getFullYear();
  const stagesCount= Math.max(1, Math.min(10, parseInt(seasonStagesInput.value.trim(),10) || 5));

  if(!seasonId){
    throw new Error("ID сезону не вказано.");
  }

  setMessage("Створення сезону " + seasonId + "...");

  // 1) перевіряємо, чи сезон вже існує
  const seasonRef = doc(db, "seasons", seasonId);
  const existSnap = await getDoc(seasonRef);
  if(existSnap.exists()){
    throw new Error("Сезон з таким ID вже існує. Видали старий або задай інший ID.");
  }

  // 2) створюємо документ сезону
  await setDoc(seasonRef, {
    name: seasonName || seasonId,
    year: year,
    createdAt: new Date().toISOString()
  });

  // 3) створюємо етапи в колекції stages (одна колекція для всіх сезонів)
  const stagePromises = [];

  for(let i=1;i<=stagesCount;i++){
    const stageId = `${seasonId}_e${i}`;
    const stageRef = doc(db, "stages", stageId);
    stagePromises.push(
      setDoc(stageRef, {
        seasonId: seasonId,
        code: `E${i}`,
        name: `Етап ${i}`,
        index: i,
        isFinal: false,
        isOpen: false
      })
    );
  }

  // фінал
  const finalId = `${seasonId}_final`;
  const finalRef = doc(db, "stages", finalId);
  stagePromises.push(
    setDoc(finalRef, {
      seasonId: seasonId,
      code: "FINAL",
      name: "Фінал",
      index: stagesCount + 1,
      isFinal: true,
      isOpen: false
    })
  );

  await Promise.all(stagePromises);

  // 4) виставляємо active на перший етап
  const firstStageId = `${seasonId}_e1`;
  await setDoc(doc(db, "settings", "active"), {
    seasonId: seasonId,
    stageId: firstStageId,
    isOpen: false
  }, { merge: true });

  setMessage("Сезон та етапи створено успішно.", "success");

  // оновлюємо кеши та селекти
  await loadSeasonsAndActive();
}

// ==============================
//  ЗАВАНТАЖЕННЯ ЕТАПІВ
// ==============================
function resetStageSelect(placeholder){
  if(stageSelect){
    stageSelect.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholder;
    stageSelect.appendChild(opt);
    stageSelect.disabled = true;
  }
  currentStageId   = null;
  currentStageOpen = false;
  updateStageStatusBadge();
}

async function loadStagesForSeason(seasonId){
  if(!seasonId){
    resetStageSelect("Спочатку обери сезон");
    return;
  }

  // якщо вже в кеші — не тягнемо знов
  if(cachedStagesBySeason[seasonId]){
    fillStageSelectFromCache(seasonId);
    return;
  }

  setMessage("Завантаження етапів сезону " + seasonId + "...");

  const qStages = query(
    collection(db, "stages"),
    where("seasonId","==", seasonId)
  );
  const snap = await getDocs(qStages);

  const arr = [];
  snap.forEach(d => arr.push({ id:d.id, data:d.data() }));

  // сортуємо в JS, щоб не треба було composite index
  arr.sort((a,b) => {
    const ai = a.data.index || 0;
    const bi = b.data.index || 0;
    return ai - bi;
  });

  cachedStagesBySeason[seasonId] = arr;
  fillStageSelectFromCache(seasonId);

  setMessage("");
}

function fillStageSelectFromCache(seasonId){
  const arr = cachedStagesBySeason[seasonId] || [];
  if(stageSelect){
    stageSelect.innerHTML = "";
    if(arr.length === 0){
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Немає етапів";
      stageSelect.appendChild(opt);
      stageSelect.disabled = true;
    }else{
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "Оберіть етап";
      stageSelect.appendChild(opt0);

      arr.forEach(st => {
        const opt = document.createElement("option");
        opt.value = st.id;
        opt.textContent = st.data.name || st.id;
        stageSelect.appendChild(opt);
      });
      stageSelect.disabled = false;
    }
  }
}

// ==============================
//  ЗМІНА СЕЗОНУ / ЕТАПУ
// ==============================
function onSeasonChanged(seasonId){
  currentSeasonId = seasonId || null;
  updateSeasonInfo();
  if(!seasonId){
    resetStageSelect("Спочатку обери сезон");
    return;
  }
  loadStagesForSeason(seasonId).catch(err => {
    console.error(err);
    setMessage("Помилка завантаження етапів: " + err.message, "error");
  });
}

function onStageChanged(stageId){
  currentStageId = stageId || null;
  const stage = findStageInCache(currentSeasonId, currentStageId);
  currentStageOpen = !!(stage && stage.data.isOpen);
  updateStageStatusBadge();

  // збережемо вибраний етап у settings/active (без зміни isOpen)
  if(currentSeasonId && currentStageId){
    setDoc(doc(db, "settings", "active"), {
      seasonId: currentSeasonId,
      stageId: currentStageId
    }, { merge:true }).catch(console.error);
  }
}

function findStageInCache(seasonId, stageId){
  if(!seasonId || !stageId) return null;
  const arr = cachedStagesBySeason[seasonId] || [];
  return arr.find(s => s.id === stageId) || null;
}

// ==============================
//  ВІДКРИТТЯ / ЗАКРИТТЯ РЕЄСТРАЦІЇ
// ==============================
async function toggleStageOpen(){
  if(!currentSeasonId || !currentStageId) return;

  const newOpen = !currentStageOpen;

  const stageRef = doc(db, "stages", currentStageId);
  await updateDoc(stageRef, { isOpen: newOpen });

  // оновлюємо кеш
  const st = findStageInCache(currentSeasonId, currentStageId);
  if(st){
    st.data.isOpen = newOpen;
  }

  // оновлюємо settings/active
  await setDoc(doc(db, "settings", "active"), {
    seasonId: currentSeasonId,
    stageId: currentStageId,
    isOpen: newOpen
  }, { merge:true });

  currentStageOpen = newOpen;
  updateStageStatusBadge();
  setMessage(newOpen ? "Реєстрацію відкрито." : "Реєстрацію закрито.", "success");
}

function updateSeasonInfo(){
  if(!seasonInfo){
    return;
  }
  if(!currentSeasonId){
    seasonInfo.textContent = "Поточний сезон не обрано.";
    return;
  }
  const s = cachedSeasons.find(x => x.id === currentSeasonId);
  const title = s ? (s.data.name || s.id) : currentSeasonId;
  seasonInfo.textContent = "Поточний сезон: " + title;
}

function updateStageStatusBadge(){
  if(!stageStatusBadge) return;

  if(!currentStageId){
    stageStatusBadge.className = "chip chip-muted";
    stageStatusBadge.textContent = "Статус: не обрано";
    toggleStageBtn && (toggleStageBtn.disabled = true);
    return;
  }

  toggleStageBtn && (toggleStageBtn.disabled = false);

  if(currentStageOpen){
    stageStatusBadge.className = "chip chip-open";
    stageStatusBadge.textContent = "Статус: реєстрація відкрита";
    if(toggleStageBtn) toggleStageBtn.textContent = "Закрити реєстрацію";
  }else{
    stageStatusBadge.className = "chip chip-closed";
    stageStatusBadge.textContent = "Статус: реєстрація закрита";
    if(toggleStageBtn) toggleStageBtn.textContent = "Відкрити реєстрацію";
  }
}
