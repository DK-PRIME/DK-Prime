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

const adminSection    = document.getElementById("adminSection");
const judgeSection    = document.getElementById("judgeSection");
const noAccessSection = document.getElementById("noAccessSection");
const sysMsg          = document.getElementById("systemMessage");
const userInfo        = document.getElementById("userInfo");
const logoutBtn       = document.getElementById("logoutBtn");

// admin controls
const seasonSelect     = document.getElementById("seasonSelect");
const seasonInfo       = document.getElementById("seasonInfo");
const stageSelect      = document.getElementById("stageSelect");
const stageStatusBadge = document.getElementById("stageStatusBadge");
const toggleStageBtn   = document.getElementById("toggleStageBtn");

// стан
let currentSeasonId    = null;
let currentStageId     = null;
let currentStageIsOpen = false;

// localStorage ключ
const LS_KEY_ADMIN_STATE = "dkprime_admin_state";

// ---- helpers ----
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

logoutBtn?.addEventListener("click", async () => {
  try{
    await signOut(auth);
    window.location.href = "./index.html";
  }catch(err){
    console.error(err);
    setMessage("Помилка виходу: " + err.message, "error");
  }
});

// ----- settings/active -----

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

// ----- Admin panel -----

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
      seasonInfo.textContent = "Створи документи у Firestore → seasons.";
    }
    return;
  }

  let foundCurrent = false;

  snap.forEach(docSnap => {
    const data = docSnap.data() || {};
    const id   = docSnap.id;
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
      ? `Поточний сезон/змагання: ${seasonSelect.selectedOptions[0]?.textContent || currentSeasonId}`
      : "Сезон/змагання ще не обрано.";
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
    opt.textContent = "Етапів цього сезону не знайдено";
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
    setMessage("Етап не знайдено у Firestore (stages).", "error");
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

// зміна сезону
seasonSelect?.addEventListener("change", async () => {
  currentSeasonId = seasonSelect.value || null;
  currentStageId  = null;

  if(seasonInfo){
    seasonInfo.textContent = currentSeasonId
      ? `Поточний сезон/змагання: ${seasonSelect.selectedOptions[0]?.textContent || currentSeasonId}`
      : "Сезон/змагання ще не обрано.";
  }
  await saveActiveSettings();
  await loadStagesForSeason(currentSeasonId);
});

// зміна етапу
stageSelect?.addEventListener("change", async () => {
  currentStageId = stageSelect.value || null;
  await updateStageUI();
});

// відкриття/закриття реєстрації
toggleStageBtn?.addEventListener("click", async () => {
  if(!currentStageId) return;
  try{
    const stageRef = doc(db, "stages", currentStageId);
    const newState = !currentStageIsOpen;
    await updateDoc(stageRef, { isOpen:newState });
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

// ----- AUTH + Ролі -----

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
    hideAll();
    noAccessSection?.classList.remove("hidden");
    setMessage("Помилка завантаження ролі: " + err.message, "error");
  }
});
