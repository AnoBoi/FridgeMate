import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  onAuthStateChanged,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAp7TebsGhYqoMv6IER8XZ-fwyqwi9KGt4",
  authDomain: "fridge-mate-31e97.firebaseapp.com",
  projectId: "fridge-mate-31e97",
  storageBucket: "fridge-mate-31e97.firebasestorage.app",
  messagingSenderId: "543736415860",
  appId: "1:543736415860:web:312b6729c79af1221d7321"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

/* ---------- DOM elements ---------- */
const signupBtn = document.getElementById("signupBtn");
const loadingDiv = document.getElementById("loadingDiv");
const signupDiv = document.getElementById("signupDiv");
const errorDiv = document.getElementById("errorDiv");

/* ---------- UI helpers ---------- */
function showLoading(show = true) {
  loadingDiv.style.display = show ? "block" : "none";
  signupDiv.style.display = show ? "none" : "block";
  errorDiv.style.display = "none";
  signupBtn.disabled = show;
}
function showError(message) {
  errorDiv.textContent = message;
  errorDiv.style.display = "block";
  showLoading(false);
}

/* ---------- After successful login: redirect ---------- */
async function finishSignIn(user) {
  // CHANGE THIS to wherever you want to send signed-up users:
  const destination = "/FridgeList.html";
  window.location.href = destination;
}

/* ---------- Try to handle redirect result on page load (fallback case) ---------- */
(async function checkRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      // user signed in via redirect
      await finishSignIn(result.user);
    } else {
      // no redirect result -- normal state
      showLoading(false);
    }
  } catch (err) {
    console.error("Redirect sign-in error:", err);
    showError("Authentication failed (redirect). Please try again.");
  }
})();

/* ---------- Click handler: prefer popup, fallback to redirect ---------- */
signupBtn.addEventListener("click", async () => {
  showLoading(true);
  errorDiv.style.display = "none";

  try {
    // set persistence so the user stays logged in across sessions
    await setPersistence(auth, browserLocalPersistence);

    // Try popup sign-in first
    const result = await signInWithPopup(auth, provider);
    if (result && result.user) {
      await finishSignIn(result.user);
    } else {
      showLoading(false);
      showError("Authentication did not complete. Please try again.");
    }
  } catch (err) {
    console.warn("Popup sign-in failed, trying redirect:", err);

    // If popup failed because of popup-blocker / browser policy, fallback to redirect
    try {
      await signInWithRedirect(auth, provider);
      // note: redirect will navigate away and then getRedirectResult above handles the result
    } catch (err2) {
      console.error("Redirect fallback failed:", err2);
      showError("Unable to start sign-in flow. Check console for details.");
    }
  }
});

// Monitor auth state to react to already-signed-in users
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log('User already signed in:', user.uid, user.email);
    window.location.replace("/FridgeList.html");
  } else {
    // user signed out
  }
});
