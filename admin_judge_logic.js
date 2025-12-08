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
  orderBy,
  addDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// DOM-посилання
const adminSection    = document.getElementById("adminSection");
const judgeSection    = document.getElementById("judgeSection");
const noAccessSection = document.getElementById("noAccessSection");
const sysMsg          = document.getElementById("systemMessage");
const userInfo        = document.getElementById("userInfo");
const logoutBtn       = document.getElementById("logoutBtn");

// Admin: season/stage/draw
const seasonSelect      = document.getElementById("seasonSelect");
const seasonInfo        = document.getElementById("seasonInfo");
const stageSelect       = document.getElementById("stageSelect");
const stageStatusBadge  = document.getElementById("stageStatusBadge");
const toggleStageBtn    = document.getElementById("toggleStageBtn");
const drawGenerateBtn   = document.getElementById("drawGenerateBtn");
const drawReloadBtn     = document.getElementById("drawReloadBtn");
const drawMessage       = document.getElementById("drawMessage");
const drawTableBody     = document.getElementById("drawTableBody");

// Judge UI
const judgeStageLabel   = document.getElementById("judgeStageLabel");
const judgeZoneLabel    = document.getElementById("judgeZoneLabel");
const judgeTeamSelect   = document.getElementById("judgeTeamSelect");
const judgeWeightInput  = document.getElementById("judgeWeightInput");
const judgeBigCheckbox  = document.getElementById("judgeBigCheckbox");
const judgeAddBtn       = document.getElementById("judgeAddBtn");
const judgeMessage      = document.getElementById("judgeMessage");
const judgeTableBody    = document.getElementById("judgeTableBody");

// Стан
let currentSeasonId    = null;
let currentStageId     = null;
let currentStageIsOpen = false;

// для судді
let currentJudgeZone   = null;
let currentJudgeStageTitle = "";
let cachedZoneTeams    = [];   // [{teamName, sectorNumber}, ...]

// -------------------------
// Допоміжні функції
// -------------------------

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

// -------------------------
// SETTINGS/ACTIVE
// -------------------------

async function loadActiveSettings(){
  const activeRef = doc(db, "settings", "active");
  const snap = await getDoc(activeRef);
  if(!snap.exists()) return;
  const data = snap.data() || {};
  currentSeasonId = data.seasonId || null;
  currentStageId  = data.stageId  || null;
}

async function saveActiveSettings(){
  const activeRef = doc(db, "settings", "active");
  const payload = {
    seasonId: currentSeasonId || null,
    stageId : currentStageId  || null,
    updatedAt: Date.now()
  };
  await setDoc(activeRef, payload, { merge:true });
}

// -------------------------
// ADMIN: Seasons / Stages
// -------------------------

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
    if(stageSelect){
      stageSelect.disabled = true;
      stageSelect.innerHTML = `<option value="">Спочатку обери сезон</option>`;
    }
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
  drawGenerateBtn && (drawGenerateBtn.disabled = true);
  drawReloadBtn && (drawReloadBtn.disabled = true);
  drawTableBody && (drawTableBody.innerHTML = "");
  drawMessage && (drawMessage.textContent = "");

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
    drawGenerateBtn && (drawGenerateBtn.disabled = true);
    drawReloadBtn && (drawReloadBtn.disabled = true);
    return;
  }

  const stageRef = doc(db, "stages", currentStageId);
  const snap = await getDoc(stageRef);

  if(!snap.exists()){
    currentStageIsOpen = false;
    updateStageStatusBadge();
    toggleStageBtn && (toggleStageBtn.disabled = true);
    drawGenerateBtn && (drawGenerateBtn.disabled = true);
    drawReloadBtn && (drawReloadBtn.disabled = true);
    setMessage("Етап не знайдено у Firestore (stages).", "error");
    return;
  }

  const data = snap.data() || {};
  currentStageIsOpen = !!data.isOpen;

  updateStageStatusBadge();
  toggleStageBtn && (toggleStageBtn.disabled = false);
  drawGenerateBtn && (drawGenerateBtn.disabled = false);
  drawReloadBtn && (drawReloadBtn.disabled = false);

  await saveActiveSettings();
  await loadDrawingsForStage(); // оновити таблицю жеребкування
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

// -------------------------
// ADMIN: Жеребкування
// -------------------------

function shuffleArray(arr){
  for(let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Генерація жеребкування:
 * - беремо підтверджені заявки з registrations
 * - будуємо список секторів по зонах
 * - випадково роздаємо команди
 * - пишемо в drawings
 */
drawGenerateBtn?.addEventListener("click", async () => {
  if(!currentStageId) return;

  if(!confirm("Перегенерувати жеребкування для цього етапу? Попереднє буде перезаписане.")){
    return;
  }

  try{
    drawMessage.textContent = "Генерація жеребкування...";
    drawTableBody.innerHTML = "";

    // 1. читаємо етап (щоб знати конфіг зон, якщо є)
    const stageRef = doc(db, "stages", currentStageId);
    const stageSnap = await getDoc(stageRef);
    if(!stageSnap.exists()){
      drawMessage.textContent = "Етап не знайдено (stages).";
      return;
    }
    const stageData = stageSnap.data() || {};
    const zonesConfig = stageData.zones || { A:8, B:8, C:8 };

    // 2. підтверджені заявки
    const regCol = collection(db, "registrations");
    const regQ = query(regCol, where("stageId","==",currentStageId), where("isApproved","==",true));
    const regSnap = await getDocs(regQ);

    if(regSnap.empty){
      drawMessage.textContent = "Немає підтверджених заявок для жеребкування.";
      return;
    }

    const teams = [];
    regSnap.forEach(d => {
      const data = d.data() || {};
      if(data.teamName){
        teams.push({
          teamName: data.teamName
        });
      }
    });

    // 3. формуємо список секторів
    const slots = [];
    for(const zoneKey of Object.keys(zonesConfig)){
      const count = Number(zonesConfig[zoneKey]) || 0;
      for(let s = 1; s <= count; s++){
        slots.push({ zone: zoneKey, sectorNumber:s });
      }
    }
    shuffleArray(slots);

    if(slots.length < teams.length){
      drawMessage.textContent = "Немає достатньо секторів для всіх команд. Перевір конфіг 'zones' у stages.";
      return;
    }

    // 4. чистимо існуюче жеребкування для цього етапу
    const drawCol = collection(db, "drawings");
    const drawQ = query(drawCol, where("stageId","==",currentStageId));
    const oldDrawSnap = await getDocs(drawQ);
    const batchDeletes = [];
    oldDrawSnap.forEach(d => {
      batchDeletes.push(d.ref);
    });
    // в лоб: видалення по одному
    for(const ref of batchDeletes){
      await setDoc(ref, {}, { merge:false }); // або deleteDoc(ref) якщо хочеш, але тоді додай імпорт
    }

    // 5. запис нового жеребкування
    let idx = 0;
    for(const team of teams){
      const slot = slots[idx++];
      await addDoc(drawCol, {
        stageId: currentStageId,
        teamName: team.teamName,
        zone: slot.zone,
        sectorNumber: slot.sectorNumber
      });
    }

    drawMessage.textContent = "Жеребкування згенеровано.";
    await loadDrawingsForStage();
  }catch(err){
    console.error(err);
    drawMessage.textContent = "Помилка жеребкування: " + err.message;
  }
});

// завантажити список жеребкування
drawReloadBtn?.addEventListener("click", async () => {
  await loadDrawingsForStage();
});

async function loadDrawingsForStage(){
  if(!currentStageId || !drawTableBody) return;

  drawTableBody.innerHTML = "";
  drawMessage.textContent = "Завантаження жеребкування...";

  const drawCol = collection(db, "drawings");
  const qDraw = query(drawCol, where("stageId","==",currentStageId));
  const snap = await getDocs(qDraw);

  if(snap.empty){
    drawMessage.textContent = "Жеребкування для цього етапу ще не створене.";
    return;
  }

  const rows = [];
  snap.forEach(d => {
    const data = d.data() || {};
    rows.push({
      teamName: data.teamName || "—",
      zone: (data.zone || "—"),
      sectorNumber: data.sectorNumber || "—"
    });
  });

  // чуть відсортуємо: по зоні, по сектору
  rows.sort((a,b) => {
    if(a.zone === b.zone){
      return Number(a.sectorNumber) - Number(b.sectorNumber);
    }
    return a.zone.localeCompare(b.zone);
  });

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.teamName}</td>
      <td class="text-center">${r.zone}</td>
      <td class="text-center">${r.sectorNumber}</td>
    `;
    drawTableBody.appendChild(tr);
  });

  drawMessage.textContent = "";
}

// -------------------------
// JUDGE: логіка
// -------------------------

async function initJudgePanel(userDocData){
  // очікується, що в users є поле zone: "A"/"B"/"C"
  const zone = (userDocData.zone || "").toUpperCase();
  if(!zone || !["A","B","C"].includes(zone)){
    setMessage("У профілі судді не вказана зона A/B/C.", "error");
    return;
  }
  currentJudgeZone = zone;
  judgeZoneLabel.textContent = currentJudgeZone;

  // тягнемо active settings, щоб знати етап
  await loadActiveSettings();

  if(!currentStageId){
    judgeStageLabel.textContent = "Етап не обрано (settings/active порожній)";
    setMessage("Для суддів не задано активний етап (settings/active).", "error");
    judgeTeamSelect.disabled = true;
    judgeAddBtn.disabled = true;
    return;
  }

  // підтягнути назву етапу
  try{
    const stageRef = doc(db, "stages", currentStageId);
    const snap = await getDoc(stageRef);
    const data = snap.exists() ? (snap.data() || {}) : {};
    currentJudgeStageTitle = data.title || currentStageId;
  }catch(e){
    currentJudgeStageTitle = currentStageId;
  }
  judgeStageLabel.textContent = currentJudgeStageTitle;

  // завантажуємо команди та існуючі зважування
  await loadJudgeTeams();
  await loadJudgeWeighings();
  setMessage("Доступ надано: суддя.", "success");
}

// команди з drawings
async function loadJudgeTeams(){
  judgeTeamSelect.disabled = true;
  judgeTeamSelect.innerHTML = `<option value="">Завантаження команд...</option>`;
  cachedZoneTeams = [];

  const drawCol = collection(db, "drawings");
  const qDraw = query(
    drawCol,
    where("stageId","==",currentStageId),
    where("zone","==",currentJudgeZone)
  );
  const snap = await getDocs(qDraw);

  judgeTeamSelect.innerHTML = "";

  if(snap.empty){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Немає жеребкування по вашій зоні.";
    judgeTeamSelect.appendChild(opt);
    judgeTeamSelect.disabled = true;
    judgeAddBtn.disabled = true;
    return;
  }

  snap.forEach(d => {
    const data = d.data() || {};
    if(!data.teamName) return;
    cachedZoneTeams.push({
      teamName: data.teamName,
      sectorNumber: data.sectorNumber || null
    });
  });

  cachedZoneTeams.sort((a,b) => {
    const sa = Number(a.sectorNumber || 0);
    const sb = Number(b.sectorNumber || 0);
    if(sa === sb){
      return a.teamName.localeCompare(b.teamName);
    }
    return sa - sb;
  });

  cachedZoneTeams.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.teamName;
    const sectorPart = t.sectorNumber ? ` (сектор ${t.sectorNumber})` : "";
    opt.textContent = `${t.teamName}${sectorPart}`;
    judgeTeamSelect.appendChild(opt);
  });

  judgeTeamSelect.disabled = false;
  judgeAddBtn.disabled = false;
}

// зважування з weighings
async function loadJudgeWeighings(){
  judgeTableBody.innerHTML = "";
  judgeMessage.textContent = "Завантаження зважувань...";

  const wCol = collection(db, "weighings");
  const qW = query(
    wCol,
    where("stageId","==",currentStageId),
    where("zone","==",currentJudgeZone)
  );
  const snap = await getDocs(qW);

  const statsByTeam = new Map(); // teamName -> {sector,totalCount,totalWeight,bigFish}

  // попередньо заповнимо з drawings, щоб навіть без риб були в таблиці
  cachedZoneTeams.forEach(t => {
    statsByTeam.set(t.teamName, {
      teamName: t.teamName,
      sectorNumber: t.sectorNumber || "",
      totalCount: 0,
      totalWeight: 0,
      bigFish: 0
    });
  });

  snap.forEach(d => {
    const data = d.data() || {};
    const teamName = data.teamName || "—";
    const weight = Number(data.weight || 0);
    const isBig  = !!data.isBig;
    const sector = data.sectorNumber || "";

    if(!statsByTeam.has(teamName)){
      statsByTeam.set(teamName, {
        teamName,
        sectorNumber: sector,
        totalCount: 0,
        totalWeight: 0,
        bigFish: 0
      });
    }
    const st = statsByTeam.get(teamName);
    st.totalCount += 1;
    st.totalWeight += weight;
    if(isBig && weight > st.bigFish){
      st.bigFish = weight;
    }
  });

  const rows = Array.from(statsByTeam.values());
  rows.sort((a,b) => {
    const sa = Number(a.sectorNumber || 0);
    const sb = Number(b.sectorNumber || 0);
    if(sa === sb){
      return a.teamName.localeCompare(b.teamName);
    }
    return sa - sb;
  });

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.teamName}</td>
      <td class="text-center">${r.sectorNumber || ""}</td>
      <td class="text-center">${r.totalCount}</td>
      <td class="text-right">${r.totalWeight.toFixed(2)}</td>
      <td class="text-right">${r.bigFish ? r.bigFish.toFixed(2) : ""}</td>
    `;
    judgeTableBody.appendChild(tr);
  });

  judgeMessage.textContent = "";
}

// додати зважування
judgeAddBtn?.addEventListener("click", async () => {
  const teamName = judgeTeamSelect.value;
  const weight   = Number(judgeWeightInput.value.replace(",", "."));
  const isBig    = judgeBigCheckbox.checked;

  if(!teamName){
    judgeMessage.textContent = "Оберіть команду.";
    return;
  }
  if(!weight || weight <= 0){
    judgeMessage.textContent = "Вкажіть коректну вагу (більше 0).";
    return;
  }

  try{
    judgeAddBtn.disabled = true;
    judgeMessage.textContent = "Збереження...";

    // шукаємо сектор для команди
    let sectorNumber = null;
    const team = cachedZoneTeams.find(t => t.teamName === teamName);
    if(team){
      sectorNumber = team.sectorNumber || null;
    }

    const wCol = collection(db, "weighings");
    await addDoc(wCol, {
      stageId: currentStageId,
      zone: currentJudgeZone,
      teamName,
      sectorNumber,
      weight,
      isBig,
      createdAt: Date.now()
    });

    judgeWeightInput.value = "";
    judgeBigCheckbox.checked = false;
    judgeMessage.textContent = "Зважування додано.";
    await loadJudgeWeighings();
  }catch(err){
    console.error(err);
    judgeMessage.textContent = "Помилка збереження: " + err.message;
  }finally{
    judgeAddBtn.disabled = false;
  }
});

// -------------------------
// AUTH + Ролі
// -------------------------

onAuthStateChanged(auth, async (user) => {
  if(!user){
    window.location.href = "./index.html";
    return;
  }

  try{
    setMessage("Перевірка ролі користувача...");
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

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
      await initJudgePanel(data);
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
