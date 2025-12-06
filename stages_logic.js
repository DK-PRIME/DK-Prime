// stages_logic.js
import { auth, db } from './firebase-config.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const seasonSelect  = document.getElementById('seasonSelect');
const stageBlock    = document.getElementById('stageBlock');
const stagesList    = document.getElementById('stagesList');
const currentInfo   = document.getElementById('currentInfo');
const openStageBtn  = document.getElementById('openStageBtn');
const closeAllBtn   = document.getElementById('closeAllBtn');
const messageBox    = document.getElementById('message');

let currentSeasonId = null;
let currentOpenStageId = null;
let selectedStageId = null;

// ===================== AUTH + ROLE CHECK =====================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // якщо не залогінений – назад на головну
    window.location.href = '/';
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    if (!userSnap.exists()) {
      showMessage('Профіль користувача не знайдено в Firestore (колекція users).', 'error');
      disableUI();
      return;
    }

    const data = userSnap.data();
    if (data.role !== 'admin') {
      showMessage('Цю сторінку може відкривати тільки користувач з роллю admin.', 'error');
      disableUI();
      return;
    }

    // роль ок – вантажимо сезони
    await loadSeasons();
  } catch (err) {
    console.error(err);
    showMessage('Помилка завантаження ролі користувача.', 'error');
    disableUI();
  }
});

function disableUI() {
  seasonSelect.disabled = true;
  openStageBtn.disabled = true;
  closeAllBtn.disabled  = true;
  stageBlock.classList.add('hidden');
}

// ===================== LOAD SEASONS =====================

async function loadSeasons() {
  try {
    const q = query(collection(db, 'seasons'), orderBy('year', 'asc'));
    const snap = await getDocs(q);

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const opt = document.createElement('option');
      opt.value = docSnap.id;
      opt.textContent = data.name || docSnap.id;
      seasonSelect.appendChild(opt);
    });

    seasonSelect.addEventListener('change', onSeasonChange);
  } catch (err) {
    console.error(err);
    showMessage('Не вдалося завантажити список сезонів.', 'error');
  }
}

async function onSeasonChange() {
  messageBox.classList.add('hidden');
  stagesList.innerHTML = '';
  currentInfo.textContent = '';
  selectedStageId = null;
  openStageBtn.disabled = true;

  const seasonId = seasonSelect.value;
  currentSeasonId = seasonId;

  if (!seasonId) {
    stageBlock.classList.add('hidden');
    return;
  }

  stageBlock.classList.remove('hidden');
  await loadStagesForSeason(seasonId);
}

// ===================== LOAD STAGES FOR SEASON =====================

async function loadStagesForSeason(seasonId) {
  try {
    // читаємо документ сезону, щоб дізнатися, який етап зараз відкритий
    const seasonSnap = await getDoc(doc(db, 'seasons', seasonId));
    if (!seasonSnap.exists()) {
      showMessage(`Сезон ${seasonId} не знайдено в Firestore.`, 'error');
      return;
    }
    const seasonData = seasonSnap.data();
    currentOpenStageId = seasonData.openStageId || null;

    // завантажуємо список етапів
    const q = query(
      collection(db, 'seasons', seasonId, 'stages'),
      orderBy('order', 'asc')
    );
    const snap = await getDocs(q);

    stagesList.innerHTML = '';

    snap.forEach((stageDoc) => {
      const data = stageDoc.data();
      const id   = stageDoc.id;

      const row  = document.createElement('label');
      row.className = 'stage-row';

      if (id === currentOpenStageId) {
        row.classList.add('active');
      }

      const main = document.createElement('div');
      main.className = 'stage-main';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'stageSelect';
      radio.value = id;

      radio.addEventListener('change', () => {
        selectedStageId = id;
        openStageBtn.disabled = false;

        // підсвічуємо активний рядок
        Array.from(stagesList.children).forEach(el => el.classList.remove('active'));
        row.classList.add('active');
      });

      const textBlock = document.createElement('div');

      const nameEl = document.createElement('div');
      nameEl.className = 'stage-name';
      nameEl.textContent = data.name || id;

      const datesEl = document.createElement('div');
      datesEl.className = 'stage-dates';
      if (data.dateStart || data.dateEnd) {
        datesEl.textContent = `${data.dateStart || '—'} → ${data.dateEnd || '—'}`;
      }

      textBlock.appendChild(nameEl);
      textBlock.appendChild(datesEl);

      main.appendChild(radio);
      main.appendChild(textBlock);

      const chip = document.createElement('span');
      chip.className = 'chip';
      if (id === currentOpenStageId) {
        chip.classList.add('chip-open');
        chip.textContent = 'відкритий';
      } else {
        chip.textContent = 'закрито';
      }

      row.appendChild(main);
      row.appendChild(chip);
      stagesList.appendChild(row);
    });

    updateCurrentInfo();
  } catch (err) {
    console.error(err);
    showMessage('Не вдалося завантажити етапи сезона.', 'error');
  }
}

function updateCurrentInfo() {
  if (!currentOpenStageId) {
    currentInfo.innerHTML = 'Зараз <strong>реєстрація закрита</strong> на всі етапи.';
  } else {
    currentInfo.innerHTML = `Зараз відкрита реєстрація на етап: <strong>${currentOpenStageId}</strong>.`;
  }
}

// ===================== BUTTON HANDLERS =====================

openStageBtn.addEventListener('click', async () => {
  if (!currentSeasonId || !selectedStageId) return;

  try {
    await updateDoc(doc(db, 'seasons', currentSeasonId), {
      openStageId: selectedStageId
    });
    currentOpenStageId = selectedStageId;
    showMessage('Етап успішно відкритий для реєстрації.', 'success');
    await loadStagesForSeason(currentSeasonId);
  } catch (err) {
    console.error(err);
    showMessage('Не вдалося оновити сезон (openStageId).', 'error');
  }
});

closeAllBtn.addEventListener('click', async () => {
  if (!currentSeasonId) return;

  try {
    await updateDoc(doc(db, 'seasons', currentSeasonId), {
      openStageId: null
    });
    currentOpenStageId = null;
    selectedStageId = null;
    showMessage('Реєстрацію закрито на всі етапи сезону.', 'success');
    await loadStagesForSeason(currentSeasonId);
  } catch (err) {
    console.error(err);
    showMessage('Не вдалося закрити реєстрацію на всі етапи.', 'error');
  }
});

// ===================== UI helpers =====================

function showMessage(text, type) {
  messageBox.textContent = text;
  messageBox.classList.remove('hidden', 'error', 'success');
  if (type === 'error')  messageBox.classList.add('error');
  if (type === 'success') messageBox.classList.add('success');
}
