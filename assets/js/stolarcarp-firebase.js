import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// ✅ ПІДКЛЮЧАЄМО ТВОЮ ІСНУЮЧУ КОНФІГУРАЦІЮ
import { firebaseConfig } from "../../firebase-config.js";

// --- INIT ---
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// --- РЕЄСТРАЦІЯ КОМАНДИ ---
export async function registerTeam(teamName, captainName, phone){
  return await addDoc(collection(db,"teams"),{
    name: teamName,
    captain: captainName,
    phone: phone,
    isConfirmed:false,
    createdAt:new Date()
  });
}

// --- ОТРИМАННЯ LIVE ТАБЛИЦІ ---
export async function loadLive(){
  const snap = await getDocs(collection(db,"teams"));
  return snap.docs.map(d=>d.data());
}
