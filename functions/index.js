// functions/index.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ==============================
// Хелпери
// ==============================
function parseWeight(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(",", ".").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function detectZoneFromSector(sector) {
  const s = String(sector || "");
  if (!s.includes("/")) return "";
  return s.split("/").pop().trim().toUpperCase(); // "1/A" -> "A"
}

// ==============================
// Головна HTTPS-функція
// ==============================
exports.stolarcarpApi = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        return res.status(204).send("");
      }

      // ---------- GET ----------
      if (req.method === "GET") {
        const action = req.query.action || "";
        if (action === "live") {
          const live = await handleLive(req);
          return res.json(live);
        } else {
          const stages = await handleGetStages();
          return res.json(stages);
        }
      }

      // ---------- POST ----------
      if (req.method === "POST") {
        // Витягуємо action або з query (?action=...), або з body (JSON / form)
        const action =
          (req.query.action && String(req.query.action)) ||
          (req.body && req.body.action ? String(req.body.action) : "");

        if (action === "saveResults") {
          // Запис результатів від суддів
          const result = await handleSaveResults(req);
          return res.json(result);
        } else {
          // Стандартна реєстрація з форми
          const result = await handleRegister(req);
          return res.json(result);
        }
      }

      return res.status(405).json({ ok: false, msg: "Method not allowed" });
    } catch (err) {
      console.error("API error:", err);
      return res
        .status(500)
        .json({ ok: false, msg: String(err.message || err) });
    }
  });
});

// ==============================
// GET без action -> список етапів
// ==============================
async function handleGetStages() {
  const snap = await db.collection("stages").orderBy("order", "asc").get();
  const stages = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.name) stages.push(String(d.name));
  });
  return stages;
}

// ==============================
// POST (без action або сторонній action) -> реєстрація
// ==============================
async function handleRegister(req) {
  let data = req.body || {};

  // Якщо форма шле x-www-form-urlencoded, body вже спарситься,
  // але на всяк випадок:
  if (typeof data === "string") {
    const qs = require("querystring");
    data = qs.parse(data);
  }

  // honeypot
  if (data.hp) {
    console.log("Honeypot triggered");
    return { ok: false, msg: "Спам-запит відхилено." };
  }

  const stage = (data.event || "").trim();
  const teamName = (data.team_name || "").trim();

  if (!stage || !teamName) {
    throw new Error("Неповні дані: немає етапу або назви команди.");
  }

  const regDoc = {
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    stage: stage,
    teamName: teamName,
    captain: data.captain || "",
    phone: data.phone || "",
    food: data.food || "Ні",
    foodQty: Number(data.food_qty || 0),
    fp: data.fp || "",
  };

  await db.collection("registrations").add(regDoc);

  return { ok: true, msg: "✅ Заявку успішно подано!" };
}

// ==============================
// POST?action=saveResults -> збереження результатів суддів
// ==============================
async function handleSaveResults(req) {
  let data = req.body || {};

  // Якщо прийшло як рядок (наприклад, form-urlencoded) — розпарсимо
  if (typeof data === "string") {
    const qs = require("querystring");
    data = qs.parse(data);
  }

  const stage = (data.stage || "").trim();
  const zone = (data.zone || "").trim().toUpperCase();
  const rows = Array.isArray(data.rows) ? data.rows : [];

  if (!stage || !zone) {
    throw new Error("Не вказано етап або зону.");
  }
  if (!rows.length) {
    throw new Error("Немає рядків для збереження.");
  }

  const batch = db.batch();

  rows.forEach((row) => {
    const sector = (row.sector || "").trim();
    const team = (row.team || "").trim();

    // Пропускаємо повністю порожні
    if (!sector && !team) return;

    const sumCountRaw = row.sumCount || 0;
    const sumWeightRaw = row.sumWeight || 0;
    const bigRaw = row.big || 0;
    const placeRaw = row.place || 0;

    const sumCount = Number(sumCountRaw || 0);
    const sumWeight =
      typeof sumWeightRaw === "string"
        ? Number(sumWeightRaw.replace(",", ".") || 0)
        : Number(sumWeightRaw || 0);
    const big =
      typeof bigRaw === "string"
        ? Number(bigRaw.replace(",", ".") || 0)
        : Number(bigRaw || 0);
    const place = Number(placeRaw || 0);

    // детермінований id: Етап__Сектор
    const safeStage = stage.replace(/\s+/g, "_");
    const safeSector = sector.replace(/\s+/g, "_");
    const docId = `${safeStage}__${safeSector}`;

    const ref = db.collection("results").doc(docId);

    const payload = {
      stage,
      zone,
      sector,
      team,
      sumCount,
      sumWeight,
      big,
      place,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    batch.set(ref, payload, { merge: true });
  });

  await batch.commit();

  return { ok: true, msg: "✅ Результати збережено (results/saveResults)." };
}

// ==============================
// GET?action=live -> LIVE результати
// ==============================
async function handleLive(req) {
  // Можна передати ?stage=Етап%201, якщо хочеш
  const stageFromQuery = req.query.stage ? String(req.query.stage) : null;

  let stageName = stageFromQuery;

  // Якщо stage не передали – беремо поточний з stages де isCurrent = true
  if (!stageName) {
    const currentSnap = await db
      .collection("stages")
      .where("isCurrent", "==", true)
      .limit(1)
      .get();

    if (!currentSnap.empty) {
      stageName = String(currentSnap.docs[0].data().name || "");
    }
  }

  if (!stageName) {
    // fallback – живемо без фільтру по етапу
    console.warn("No stage specified for LIVE; returning all results");
  }

  // ---------- РЕЗУЛЬТАТИ ----------
  let resQuery = db.collection("results");
  if (stageName) {
    resQuery = resQuery.where("stage", "==", stageName);
  }

  const resSnap = await resQuery.get();

  if (resSnap.empty) {
    return {
      stage: stageName || "STOLAR CARP 2026",
      data: {
        zones: { A: [], B: [], C: [] },
        total: [],
        bigFishTotal: [],
      },
    };
  }

  const zones = { A: [], B: [], C: [] };
  const total = [];

  resSnap.forEach((docSnap) => {
    const r = docSnap.data();

    const team = r.team || "";
    if (!team) return;

    const sector = r.sector || "";
    const zoneLetter = r.zone || detectZoneFromSector(sector);

    const place = r.place || "";
    const count = r.sumCount || "";
    const weight = r.sumWeight || "";
    const big = r.big || "";

    // Загальна таблиця
    total.push({
      place: place,
      team: team,
      zone: zoneLetter,
      count: count,
      big: big,
      weight: weight,
    });

    // Зони
    if (zones[zoneLetter]) {
      zones[zoneLetter].push({
        place: place,
        team: team,
        count: count,
        big: big,
        weight: weight,
      });
    }
  });

  // Сортування в зонах по вазі, потім BIG
  Object.keys(zones).forEach((z) => {
    const list = zones[z];

    list.sort((a, b) => {
      const wA = parseWeight(a.weight);
      const wB = parseWeight(b.weight);
      if (wA !== wB) return wB - wA;

      const bA = parseWeight(a.big);
      const bB = parseWeight(b.big);
      return bB - bA;
    });

    list.forEach((row, i) => {
      row.place = i + 1;
    });
  });

  // ---------- BIGFISH_TOTAL ----------
  let bfQuery = db.collection("bigfish_totals");
  if (stageName) {
    bfQuery = bfQuery.where("stage", "==", stageName);
  }
  const bfSnap = await bfQuery.get();

  const bigFishTotal = [];
  bfSnap.forEach((docSnap) => {
    const r = docSnap.data();
    if (!r.team) return;
    bigFishTotal.push({
      team: r.team,
      big1Day: r.big1Day || "",
      big2Day: r.big2Day || "",
      teamMaxBig: r.teamMaxBig || "",
      isMax: !!r.isMax,
    });
  });

  // Якщо stage ще не визначили — беремо з першого result
  if (!stageName) {
    const first = resSnap.docs[0].data();
    stageName = first.stage || "STOLAR CARP 2026";
  }

  return {
    stage: stageName,
    data: {
      zones: {
        A: zones.A,
        B: zones.B,
        C: zones.C,
      },
      total: total,
      bigFishTotal: bigFishTotal,
    },
  };
}
