(function () {
  const db = window.scDb;
  const auth = window.scAuth;

  const form = document.getElementById("competitionForm");
  const msg  = document.getElementById("msg");

  function setMsg(t, ok=true){
    msg.textContent = t;
    msg.style.color = ok ? "#43d18a" : "#ff6c6c";
  }

  auth.onAuthStateChanged(user => {
    if (!user) {
      setMsg("Увійдіть як адмін", false);
      form.querySelector("button").disabled = true;
    }
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const seasonId = seasonIdEl.value.trim();
    const title    = titleEl.value.trim();

    if (!seasonId || !title) {
      setMsg("Заповніть всі поля", false);
      return;
    }

    try {
      const stageRef = db
        .collection("seasons")
        .doc(seasonId)
        .collection("stages")
        .doc(); // auto ID

      await stageRef.set({
        label: title,
        seasonId,
        isFinal: isFinal.checked,
        bigFishTotal: bigFishTotal.checked,
        minus13kg: minus13.checked,
        isRegistrationOpen: openReg.checked,

        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      setMsg("Змагання створено ✔");
      form.reset();

    } catch (e) {
      console.error(e);
      setMsg("Помилка створення", false);
    }
  });

  const seasonIdEl = document.getElementById("seasonId");
  const titleEl   = document.getElementById("title");
  const isFinal   = document.getElementById("isFinal");
  const bigFishTotal = document.getElementById("bigFishTotal");
  const minus13   = document.getElementById("minus13");
  const openReg   = document.getElementById("openReg");

})();
