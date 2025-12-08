// login_logic.js
import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const form  = document.getElementById("loginForm");
const msgEl = document.getElementById("loginMessage");

function showMessage(text, isError = true){
  if(!msgEl) return;
  msgEl.textContent = text || "";
  msgEl.style.color = isError ? "#f87171" : "#4ade80";
}

// Якщо вже залогінений – одразу в панель
onAuthStateChanged(auth, (user) => {
  if(user){
    window.location.href = "./admin_judge.html";
  }
});

if(form){
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage("");

    const email    = form.email.value.trim();
    const password = form.password.value;

    const btn = form.querySelector("button[type='submit']");
    if(btn){
      btn.disabled = true;
      btn.textContent = "Входимо...";
    }

    try{
      await signInWithEmailAndPassword(auth, email, password);
      showMessage("Вхід успішний, переадресація...", false);
      window.location.href = "./admin_judge.html";
    }catch(err){
      console.error(err);
      showMessage("Помилка входу: " + (err.code || err.message));
    }finally{
      if(btn){
        btn.disabled = false;
        btn.textContent = "Увійти";
      }
    }
  });
}
