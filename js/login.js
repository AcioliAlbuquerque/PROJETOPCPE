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

/* Enquanto o cadastro termina (gravar o nome), não redireciona:
   sem isso a página trocava de tela antes do nome ser salvo. */
let signingUp = false;

function showMsg(text, isError = true) {
  msgEl.textContent = text;
  msgEl.className = "login-msg" + (isError ? " is-error" : " is-ok");
}

function switchTab(which, focusTab = false) {
  const toLogin = which === "login";
  tabLogin.classList.toggle("is-active", toLogin);
  tabSignup.classList.toggle("is-active", !toLogin);
  tabLogin.setAttribute("aria-selected", String(toLogin));
  tabSignup.setAttribute("aria-selected", String(!toLogin));
  tabLogin.tabIndex = toLogin ? 0 : -1;
  tabSignup.tabIndex = toLogin ? -1 : 0;
  loginForm.hidden = !toLogin;
  signupForm.hidden = toLogin;
  msgEl.textContent = "";
  msgEl.className = "login-msg";
  if (focusTab) (toLogin ? tabLogin : tabSignup).focus();
}

tabLogin.addEventListener("click", () => switchTab("login"));
tabSignup.addEventListener("click", () => switchTab("signup"));
[tabLogin, tabSignup].forEach((tab) => {
  tab.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      switchTab(tab === tabLogin ? "signup" : "login", true);
    }
  });
});

function friendlyError(code) {
  const map = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Não encontrei conta com esse e-mail.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/missing-password": "Digite a senha.",
    "auth/email-already-in-use": "Já existe uma conta com esse e-mail. Tente entrar em vez de criar.",
    "auth/weak-password": "Senha muito curta (mínimo 6 caracteres).",
    "auth/popup-closed-by-user": "Login com Google cancelado.",
    "auth/cancelled-popup-request": "Login com Google cancelado.",
    "auth/popup-blocked": "O navegador bloqueou a janela do Google. Libere pop-ups para este site e tente de novo.",
    "auth/unauthorized-domain": "Este domínio ainda não está autorizado no Firebase (Authentication > Settings > Authorized domains).",
    "auth/operation-not-allowed": "Este método de login não está ativado no Firebase (Authentication > Sign-in method).",
    "auth/network-request-failed": "Falha de conexão. Confira sua internet e tente de novo.",
    "auth/too-many-requests": "Muitas tentativas seguidas. Espere um pouco antes de tentar de novo.",
  };
  return map[code] || "Algo deu errado. Tente de novo em instantes.";
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#loginSubmitBtn");
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;

  if (!email || !password) {
    showMsg("Preencha e-mail e senha.");
    return;
  }

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

  if (!email) {
    showMsg("Digite o e-mail.");
    return;
  }
  if (password.length < 6) {
    showMsg(friendlyError("auth/weak-password"));
    return;
  }
  if (password !== password2) {
    showMsg("As senhas não coincidem.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Criando...";
  msgEl.textContent = "";
  signingUp = true;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) {
      try { await updateProfile(cred.user, { displayName: name }); } catch (_) { /* o nome é opcional */ }
    }
    window.location.href = "index.html";
  } catch (err) {
    signingUp = false;
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
    showMsg("Link de redefinição enviado para o seu e-mail. Confira também o spam.", false);
  } catch (err) {
    showMsg(friendlyError(err.code));
  }
});

onAuthStateChanged(auth, (user) => {
  if (user && !signingUp) window.location.href = "index.html";
});