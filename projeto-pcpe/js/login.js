/* ==========================================================================
   OPERAÇÃO PCPE — login.js
   Autenticação via Firebase (e-mail/senha + Google).
   ========================================================================== */
import { auth } from "../firebase-config.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = (sel) => document.querySelector(sel);

const tabLogin = $("#tabLogin");
const tabSignup = $("#tabSignup");
const loginForm = $("#loginForm");
const signupForm = $("#signupForm");
const msgEl = $("#loginMsg");

function showMsg(text, isError = true) {
  msgEl.textContent = text;
  msgEl.className = "login-msg" + (isError ? " is-error" : " is-ok");
}

function switchTab(which) {
  const toLogin = which === "login";
  tabLogin.classList.toggle("is-active", toLogin);
  tabSignup.classList.toggle("is-active", !toLogin);
  tabLogin.setAttribute("aria-selected", String(toLogin));
  tabSignup.setAttribute("aria-selected", String(!toLogin));
  loginForm.hidden = !toLogin;
  signupForm.hidden = toLogin;
  msgEl.textContent = "";
  msgEl.className = "login-msg";
}

tabLogin.addEventListener("click", () => switchTab("login"));
tabSignup.addEventListener("click", () => switchTab("signup"));

function friendlyError(code) {
  const map = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Não encontrei conta com esse e-mail.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Já existe uma conta com esse e-mail — tenta entrar em vez de criar.",
    "auth/weak-password": "Senha muito curta (mínimo 6 caracteres).",
    "auth/popup-closed-by-user": "Login com Google cancelado.",
    "auth/unauthorized-domain": "Este domínio ainda não está autorizado no Firebase (Authentication > Settings > Authorized domains).",
    "auth/network-request-failed": "Falha de conexão. Confira sua internet e tente de novo.",
    "auth/too-many-requests": "Muitas tentativas seguidas. Espere um pouco antes de tentar de novo.",
  };
  return map[code] || "Algo deu errado. Tenta de novo em instantes.";
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#loginSubmitBtn");
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;

  btn.disabled = true;
  btn.textContent = "Entrando...";
  msgEl.textContent = "";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showMsg(friendlyError(err.code));
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
});

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#signupSubmitBtn");
  const name = $("#signupName").value.trim();
  const email = $("#signupEmail").value.trim();
  const password = $("#signupPassword").value;
  const password2 = $("#signupPassword2").value;

  if (password !== password2) {
    showMsg("As senhas não coincidem.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Criando...";
  msgEl.textContent = "";

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) {
      await updateProfile(cred.user, { displayName: name });
    }
  } catch (err) {
    showMsg(friendlyError(err.code));
    btn.disabled = false;
    btn.textContent = "Criar conta";
  }
});

$("#googleBtn").addEventListener("click", async () => {
  const btn = $("#googleBtn");
  btn.disabled = true;
  msgEl.textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    showMsg(friendlyError(err.code));
    btn.disabled = false;
  }
});

$("#forgotBtn").addEventListener("click", async () => {
  const email = $("#loginEmail").value.trim();
  if (!email) {
    showMsg("Digite seu e-mail no campo acima primeiro.");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showMsg("Link de redefinição enviado para o seu e-mail.", false);
  } catch (err) {
    showMsg(friendlyError(err.code));
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = "index.html";
});