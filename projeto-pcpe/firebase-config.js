
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAbAB3q5JhkGL6_yYRx14xgcyvSj6Z8axE",
  authDomain: "projeto-pcpe.firebaseapp.com",
  projectId: "projeto-pcpe",
  storageBucket: "projeto-pcpe.firebasestorage.app",
  messagingSenderId: "821147862640",
  appId: "1:821147862640:web:ab87b061abbda4fd3516b5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);