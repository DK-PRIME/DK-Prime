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
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// DOM
const adminSection      = document.getElementById("adminSection");
const judgeSection      = document.getElementById("judgeSection");
const noAccessSection   = document.getElementById("noAccessSection");
const bigActionsSection = document.getElementById("bigActionsSection");

const sysMsg    = document.getElementById("systemMessage");
const userInfo  = document.getElementById("userInfo");
const logoutBtn = document.getElementById("logoutBtn");

// Створення сезону
const createSeasonForm   = document.getElementById("createSeasonForm");
const seasonIdInput      = document.getElementById("seasonIdInput");
const seasonTitleInput   = document.getElementById("seasonTitleInput");
const seasonYearInput    = document.getElementById("seasonYearInput");
const seasonStagesInput  = document.getElementById("seasonStagesInput");

// Активний сезон/етап
const seasonSelect     = document.getElementById("seasonSelect");
const seasonInfo       = document.getElementById("seasonInfo");
const stageSelect      = document.getElementById("stageSelect");
const stageStatusBadge = document.getElementById("stageStatusBadge");
const toggleStageBtn   = document.getElementById("toggleStageBtn");

// Стан
let currentSeasonId    = null;
let currentStageId     = null;
let currentStageIsOpen = false;

// localStorage key
const LS_KEY_ADMIN_STATE = "dkprime_admin_state";

// ================= helpers =================

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

function hideAllSections(){
  adminSection?.classList.add("hidden");
  judgeSection?.classList.add("hidden");
  noAccessSection?.classList.add("hidden");
  bigActionsSection?.classList.add("hidden");
}

function saveLocalAdminState(){
  try{
    const payload = {
      seasonId: currentSeasonId || null,
      stageId : currentStageId  || null
    };
    localStorage.setItem(LS_KEY_ADMIN_STATE, JSON.stringify(payload));
  }catch(e){
    console.warn("Не вдалось зберегти localStorage:", e);
  }
}

function loadLocalAdminState(){
  try{
    const raw = localStorage.getItem(LS_KEY_ADMIN_STATE);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){
    console.warn("Не вдалось прочитати localStorage:", e);
    return null;
  }
}

logoutBtn?.addEventListener("click", async () => {
  try{
    await signOut(auth);
    window.location.href = "./index.html";
  }catch(err){
    console.error(err);
    setMessage("Помилка виходу: " + err.message, "error");
  }
});

// ================= settings/active =================

async function loadActiveSettings(){
  const ref = doc(db, "settings", "active");
  const snap = await getDoc(ref);

  if(snap.exists()){
    const data = snap.data() || {};
    currentSeasonId = data.seasonId || null;
    currentStageId  = data.stageId  || null;
  }else{
    const ls = loadLocalAdminState();
    if(ls){
      currentSeasonId = ls.seasonId || null;
      currentStageId  = ls.stageId  || null;
    }
  }
}

async function saveActiveSettings(){
  const ref = doc(db, "settings", "active");
  await setDoc(ref, {
    seasonId: currentSeasonId || null,
    stageId : currentStageId  || null,
    updatedAt: Date.now()
  }, { merge: true });
  saveLocalAdminState();
}

// ================= Створення сезону + етапів =================

async function createSeasonWithStages(seasonId, title, year, stagesCount){
  const seasonRef = doc(db, "seasons", seasonId);

  const seasonSnap = await getDoc(seasonRef);
  if(seasonSnap.exists()){
    throw new Error(`Сезон з ID "${seasonId}" вже існує.`);
  }

  const yearNum = Number(year) || null;

  await setDoc(seasonRef, {
    title,
    year: yearNum,
    isActive: true,
    openStageId: null,
    createdAt: Date.now()
  });

  const stagesCol = collection(db, "stages");

  // Етапи 1..N
  for(let i = 1; i <= stagesCount; i++){
    const stageId = `${seasonId}_e${i}`;
    const stageRef = doc(stagesCol, stageId);

    await setDoc(stageRef, {
      seasonId,
      title: `Етап ${i}`,
      order: i,
      isOpen: false,
      zones: { A: 8, B: 8, C: 8 }
    });
  }

  // Фінал
  const finalId = `${seasonId}_final`;
  const finalRef = doc(stagesCol, finalId);
  await setDoc(finalRef, {
    seasonId,
    title: "Фінал",
    order: stagesCount + 1,
    isOpen: false,
    zones: { A: 8, B: 8, C: 8 },
    isFinal: true
  });

  // Робимо активним перший етап
  currentSeasonId = seasonId;
  currentStageId  = `${seasonId}_e1`;
  await saveActiveSettings();

  // Оновлюємо у сезоні поле openStageId (поки етап закритий, але зручно мати посилання)
  await updateDoc(seasonRef, { openStageId: null });

  setMessage("Сезон та етапи створено успішно.", "success");
  await loadSeasons(); // перезавантажимо селект
}

createSeasonForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if(!seasonIdInput || !seasonTitleInput || !seasonYearInput || !seasonStagesInput) return;

  const rawId     = seasonIdInput.value.trim();
  const rawTitle  = seasonTitleInput.value.trim();
  const rawYear   = seasonYearInput.value.trim();
  const rawStages = seasonStagesInput.value.trim();

  if(!rawId || !rawTitle || !rawYear || !rawStages){
    setMessage("Заповни всі поля для створення сезону.", "error");
    return;
  }

  const seasonId    = rawId;
  const title       = rawTitle;
  const year        = rawYear;
  const stagesCount = Number(rawStages);

  if(!Number.isFinite(stagesCount) || stagesCount < 1){
    setMessage("Кількість етапів має бути числом від 1.", "error");
    return;
  }

  try{
    setMessage("Створення сезону та етапів...", "info");
    await createSeasonWithStages(seasonId, title, year, stagesCount);
  }catch(err){
    console.error(err);
    setMessage("Помилка створення сезону: " + err.message, "error");
  }
});

// ================= Завантаження сезонів/етапів =================

async function initAdminPanel(){
  try{
    setMessage("Завантаження сезонів та етапів...");
    await loadActiveSettings();
    await loadSeasons();
    setMessage("Доступ надано: організатор.", "success");
  }catch(err){
    console.error(err);
    setMessage("Помилка ініціалізації панелі організатора: " + err.message, "error");
  }
}

async function loadSeasons(){
  if(!seasonSelect) return;

  seasonSelect.disabled = true;
  seasonSelect.innerHTML = `<option value="">Завантаження...</option>`;
  seasonInfo && (seasonInfo.textContent = "");

  const seasonsCol = collection(db, "seasons");
  let q = seasonsCol;
  try{
    q = query(seasonsCol, orderBy("year","asc"));
  }catch(e){
    q = seasonsCol;
  }

  const snap = await getDocs(q);

  seasonSelect.innerHTML = "";

  if(snap.empty){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Сезонів/змагань не знайдено";
    seasonSelect.appendChild(opt);
    seasonSelect.disabled = true;
    if(seasonInfo){
      seasonInfo.textContent = "Створи новий сезон вище.";
    }
    return;
  }

  let foundCurrent = false;

  snap.forEach(docSnap => {
    const data  = docSnap.data() || {};
    const id    = docSnap.id;
    const title = data.title || id;

    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = title;
    seasonSelect.appendChild(opt);

    if(currentSeasonId && currentSeasonId === id){
      opt.selected = true;
      foundCurrent = true;
    }
  });

  if(!foundCurrent){
    const first = seasonSelect.options[0];
    if(first){
      first.selected = true;
      currentSeasonId = first.value || null;
    }else{
      currentSeasonId = null;
    }
  }

  seasonSelect.disabled = false;

  if(seasonInfo){
    seasonInfo.textContent = currentSeasonId
      ? `Поточний сезон: ${seasonSelect.selectedOptions[0]?.textContent || currentSeasonId}`
      : "Сезон ще не обрано.";
  }

  if(currentSeasonId){
    await loadStagesForSeason(currentSeasonId);
  }else{
    stageSelect.disabled = true;
    stageSelect.innerHTML = `<option value="">Спочатку обери сезон</option>`;
    updateStageStatusBadge();
  }
}

async function loadStagesForSeason(seasonId){
  if(!stageSelect) return;

  stageSelect.disabled = true;
  stageSelect.innerHTML = `<option value="">Завантаження етапів...</option>`;
  currentStageIsOpen = false;
  updateStageStatusBadge();
  toggleStageBtn && (toggleStageBtn.disabled = true);

  if(!seasonId){
    stageSelect.innerHTML = `<option value="">Спочатку обери сезон</option>`;
    return;
  }

  const stagesCol = collection(db, "stages");
  let q = query(stagesCol, where("seasonId","==",seasonId));
  try{
    q = query(stagesCol, where("seasonId","==",seasonId), orderBy("order","asc"));
  }catch(e){
    q = query(stagesCol, where("seasonId","==",seasonId));
  }

  const snap = await getDocs(q);

  stageSelect.innerHTML = "";

  if(snap.empty){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Етапів для цього сезону не знайдено";
    stageSelect.appendChild(opt);
    stageSelect.disabled = true;
    updateStageStatusBadge();
    toggleStageBtn && (toggleStageBtn.disabled = true);
    return;
  }

  let foundCurrent = false;

  snap.forEach(docSnap => {
    const data  = docSnap.data() || {};
    const id    = docSnap.id;
    const title = data.title || id;

    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = title;
    stageSelect.appendChild(opt);

    if(currentStageId && currentStageId === id){
      opt.selected = true;
      foundCurrent = true;
    }
  });

  if(!foundCurrent){
    const first = stageSelect.options[0];
    if(first){
      first.selected = true;
      currentStageId = first.value || null;
    }else{
      currentStageId = null;
    }
  }

  stageSelect.disabled = false;

  await updateStageUI();
}

async function updateStageUI(){
  if(!currentStageId){
    currentStageIsOpen = false;
    updateStageStatusBadge();
    toggleStageBtn && (toggleStageBtn.disabled = true);
    await saveActiveSettings();
    return;
  }

  const stageRef = doc(db, "stages", currentStageId);
  const snap = await getDoc(stageRef);

  if(!snap.exists()){
    currentStageIsOpen = false;
    updateStageStatusBadge();
    toggleStageBtn && (toggleStageBtn.disabled = true);
    setMessage("Етап не знайдено у колекції stages.", "error");
    return;
  }

  const data = snap.data() || {};
  currentStageIsOpen = !!data.isOpen;

  updateStageStatusBadge();
  toggleStageBtn && (toggleStageBtn.disabled = false);

  await saveActiveSettings();
}

function updateStageStatusBadge(){
  if(!stageStatusBadge) return;

  stageStatusBadge.classList.remove("chip-open","chip-closed","chip-muted");

  if(!currentStageId){
    stageStatusBadge.textContent = "Статус: не обрано";
    stageStatusBadge.classList.add("chip","chip-muted");
    return;
  }

  if(currentStageIsOpen){
    stageStatusBadge.textContent = "Статус: реєстрація відкрита";
    stageStatusBadge.classList.add("chip","chip-open");
    if(toggleStageBtn){
      toggleStageBtn.textContent = "Закрити реєстрацію";
    }
  }else{
    stageStatusBadge.textContent = "Статус: реєстрація закрита";
    stageStatusBadge.classList.add("chip","chip-closed");
    if(toggleStageBtn){
      toggleStageBtn.textContent = "Відкрити реєстрацію";
    }
  }
}

// подія зміни сезону
seasonSelect?.addEventListener("change", async () => {
  currentSeasonId = seasonSelect.value || null;
  currentStageId  = null;

  if(seasonInfo){
    seasonInfo.textContent = currentSeasonId
      ? `Поточний сезон: ${seasonSelect.selectedOptions[0]?.textContent || currentSeasonId}`
      : "Сезон ще не обрано.";
  }
  await saveActiveSettings();
  await loadStagesForSeason(currentSeasonId);
});

// подія зміни етапу
stageSelect?.addEventListener("change", async () => {
  currentStageId = stageSelect.value || null;
  await updateStageUI();
});

// відкриття/закриття
toggleStageBtn?.addEventListener("click", async () => {
  if(!currentStageId || !currentSeasonId) return;
  try{
    const stageRef  = doc(db, "stages", currentStageId);
    const seasonRef = doc(db, "seasons", currentSeasonId);

    const newState = !currentStageIsOpen;
    await updateDoc(stageRef, { isOpen:newState });

    await updateDoc(seasonRef, {
      openStageId: newState ? currentStageId : null
    });

    currentStageIsOpen = newState;
    updateStageStatusBadge();
    setMessage(
      newState
        ? "Реєстрацію на етап відкрито."
        : "Реєстрацію на етап закрито.",
      "success"
    );
  }catch(err){
    console.error(err);
    setMessage("Помилка зміни статусу етапу: " + err.message, "error");
  }
});

// ================= AUTH + роли =================

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
      hideAllSections();
      noAccessSection?.classList.remove("hidden");
      setMessage("Профіль користувача не знайдено.", "error");
      return;
    }

    const data = userDoc.data() || {};
    const role = data.role || "unknown";

    userInfo.textContent = `Увійшов: ${user.email} · роль: ${role}`;

    hideAllSections();

    if(role === "admin"){
      adminSection?.classList.remove("hidden");
      bigActionsSection?.classList.remove("hidden");
      await initAdminPanel();
    }else if(role === "judge"){
      judgeSection?.classList.remove("hidden");
      setMessage("Доступ надано: суддя (для тебе окрема сторінка judges.html).", "success");
    }else{
      noAccessSection?.classList.remove("hidden");
      setMessage("Недостатньо прав доступу.", "error");
    }
  }catch(err){
    console.error(err);
    hideAllSections();
    noAccessSection?.classList.remove("hidden");
    setMessage("Помилка завантаження ролі: " + err.message, "error");
  }
});
