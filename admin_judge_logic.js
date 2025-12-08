// admin_judge_logic.js
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const adminSection    = document.getElementById("adminSection");
const judgeSection    = document.getElementById("judgeSection");
const noAccessSection = document.getElementById("noAccessSection");
const sysMsg          = document.getElementById("systemMessage");
const userInfo        = document.getElementById("userInfo");
const logoutBtn       = document.getElementById("logoutBtn");

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
      setMessage("Доступ надано: організатор.", "success");
    }else if(role === "judge"){
      judgeSection?.classList.remove("hidden");
      setMessage("Доступ надано: суддя.", "success");
      // тут потім підвісимо завантаження команд по зоні
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
