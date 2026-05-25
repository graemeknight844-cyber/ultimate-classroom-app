// 1. CONFIGURATION PLACEHOLDERS
// You will replace these strings once your database instance is active
const SUPABASE_URL = "https://wfnwjkuojshozhtnlror.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pQvC4ZJv7e9-AL2lkp6upw_xpYa2twv";12:02 25/05/2026

// Initialize the global Supabase Client Engine
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);



// 2. DOM INTERFACE ELEMENTS
const authForm = document.getElementById('authForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const submitBtn = document.getElementById('submitBtn');
const toggleLink = document.getElementById('toggleLink');
const toggleText = document.getElementById('toggleText');
const messageBox = document.getElementById('messageBox');

let isSignUpMode = false;

// 3. UI MODE TOGGLE CONTROLLER
toggleLink.addEventListener('click', (e) => {
  e.preventDefault();
  isSignUpMode = !isSignUpMode;
  messageBox.textContent = ""; // Clear lingering status warnings

  if (isSignUpMode) {
    authTitle.textContent = "Teacher Registration";
    authSubtitle.textContent = "Create an account to host secured sessions";
    submitBtn.textContent = "Create Account";
    toggleText.textContent = "Already have an account? ";
    toggleLink.textContent = "Sign In Instead";
  } else {
    authTitle.textContent = "Teacher Login";
    authSubtitle.textContent = "Access your ultimate classroom workspace";
    submitBtn.textContent = "Sign In";
    toggleText.textContent = "Don't have an account? ";
    toggleLink.textContent = "Sign Up Instead";
  }
});

// 4. FORM SUBMISSION EVENT ENGINE
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  
  messageBox.style.color = "#4a4a68";
  messageBox.textContent = "Processing connection request...";

  if (isSignUpMode) {
    // Execute Registration Protocol
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (error) {
      messageBox.style.color = "red";
      messageBox.textContent = error.message;
    } else {
      messageBox.style.color = "green";
      messageBox.textContent = "Success! Check your inbox for a confirmation link.";
    }
  } else {
    // Execute Authentication Protocol
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      messageBox.style.color = "red";
      messageBox.textContent = error.message;
    } else {
      messageBox.style.color = "green";
      messageBox.textContent = "Authenticated! Launching dashboard...";
      
      // Delays launch briefly so user reads completion prompt
      setTimeout(() => {
        window.location.href = "teacher.html";
      }, 1000);
    }
  }
});