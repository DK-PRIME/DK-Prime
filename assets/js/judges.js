// assets/js/judges.js

import { db } from "../../firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// ===================== DOM =====================
const stageSelect   = document.getElementById("stageSelect");
const zoneSelect    = document.getElementById("zoneSelect");
const sectorInput   = document.getElementById("sectorInput");
const teamInput     = document.getElementById("teamInput");
const weightInput   = document.getElementById("weightInput");
const btnAdd        = document.getElementById("btnAdd");
const statusBox     = document.getElementById("judgeStatus");
const lastBody      = document.getElementById("lastBody");

// твоя cloud function вже читає collection("stages")
// ми просто робимо те саме з клієнта
async function loadStages() {
  try {
    stageSelect.innerHTML = `<option value="">Завантаження…</option>`;

    const q = query(collection(db, "stages"), orderBy("order", "asc"));
    const snap = await getDocs(q);

    if (snap.empty) {
      stageSelect.innerHTML = `<option value="">Немає етапів</option>`;
      return;
    }

    stageSelect.innerHTML = "";
    snap.forEach((docSnap, idx) => {
      const d = docSnap.data();
      if (!d.name) return;
      const opt = document.createElement("option");
      opt.value = String(d.name);
      opt.textContent = String(d.name);
      if (idx === 0) opt.selected = true;
      stageSelect.appendChild(opt);
    });

    // після завантаження одразу підтягнемо останні результати
    refreshLastTable();
  } catch (err) {
    console.error("loadStages error", err);
    stageSelect.innerHTML = `<option value="">Помилка завантаження</option>`;
  }
}

function showStatus(msg, ok = true) {
  statusBox.textContent = msg || "";
  statusBox.classList.remove("error", "ok");
  statusBox.classList.add(ok ? "ok" : "error");
}

// парсимо вагу як у функціях на бекенді
function parseWeightLocal(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(",", ".").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ===================== ДОДАВАННЯ ЗВАЖУВАННЯ =====================
btnAdd.addEventListener("click", async () => {
  const stage = stageSelect.value.trim();
  const zone  = zoneSelect.value.trim().toUpperCase();
  const sectorNumStr = sectorInput.value.trim();
  const team  = teamInput.value.trim();
  const wStr  = weightInput.value.trim();

  if (!stage) {
    showStatus("Оберіть етап.", false);
    return;
  }
  const sectorNum = Number(sectorNumStr);
  if (!sectorNum || sectorNum < 1 || sectorNum > 8) {
    showStatus("Вкажи сектор від 1 до 8.", false);
    return;
  }
  if (!team) {
    showStatus("Вкажи назву команди.", false);
    return;
  }

  const weight = parseWeightLocal(wStr);
  if (!weight || weight <= 0) {
    showStatus("Вкажи вагу риби (більше 0).", false);
    return;
  }

  const sector = `${sectorNum}/${zone}`;
  const docId = `${stage}__${sector}`; // унікально для етапу+сектору

  try {
    btnAdd.disabled = true;
    showStatus("Зберігаю зважування…", true);

    const ref = doc(db, "results", docId);
    const snap = await getDoc(ref);

    let newSumCount = 0;
    let newSumWeight = 0;
    let newBig = weight;

    if (snap.exists()) {
      const d = snap.data();
      newSumCount  = (d.sumCount  || 0) + 1;
      newSumWeight = parseWeightLocal(d.sumWeight || 0) + weight;
      const prevBig = parseWeightLocal(d.big || 0);
      newBig = Math.max(prevBig, weight);
    } else {
      newSumCount  = 1;
      newSumWeight = weight;
      newBig       = weight;
    }

    await setDoc(
      ref,
      {
        stage,
        sector,
        zone,
        team,
        sumCount: newSumCount,
        sumWeight: newSumWeight,
        big: newBig,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    showStatus(
      `Зважування додано: ${team}, сектор ${sector}, +${weight.toFixed(2)} кг`,
      true
    );
    weightInput.value = "";
    refreshLastTable();
  } catch (err) {
    console.error("add weighing error", err);
    showStatus("Помилка збереження: " + (err.message || err), false);
  } finally {
    btnAdd.disabled = false;
  }
});

// ===================== ОСТАННІ РЕЗУЛЬТАТИ ПО ЗОНІ =====================
async function refreshLastTable() {
  const stage = stageSelect.value.trim();
  const zone  = zoneSelect.value.trim().toUpperCase();

  if (!stage) return;

  try {
    lastBody.innerHTML = `<tr><td colspan="5">Оновлення…</td></tr>`;

    const q = query(
      collection(db, "results"),
      where("stage", "==", stage),
      where("zone", "==", zone)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      lastBody.innerHTML = `<tr><td colspan="5">Поки що немає даних по цій зоні</td></tr>`;
      return;
    }

    const rows = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      rows.push({
        sector: d.sector || "",
        team: d.team || "",
        sumCount: d.sumCount || 0,
        sumWeight: parseWeightLocal(d.sumWeight || 0),
        big: parseWeightLocal(d.big || 0),
      });
    });

    // просто сортуємо по загальній вазі
    rows.sort((a, b) => b.sumWeight - a.sumWeight);

    lastBody.innerHTML = "";
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.sector}</td>
        <td>${r.team}</td>
        <td>${r.sumCount}</td>
        <td>${r.sumWeight.toFixed(2)}</td>
        <td>${r.big ? r.big.toFixed(2) : ""}</td>
      `;
      lastBody.appendChild(tr);
    });
  } catch (err) {
    console.error("refreshLastTable error", err);
    lastBody.innerHTML =
      `<tr><td colspan="5">Помилка завантаження таблиці</td></tr>`;
  }
}

// реакція на зміну етапу / зони
stageSelect.addEventListener("change", refreshLastTable);
zoneSelect.addEventListener("change", refreshLastTable);

// старт
loadStages();
