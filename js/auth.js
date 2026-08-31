/* ============================================================
   AUTHENTICATION & PROFILE MANAGEMENT WITH OTP & FORGOT PASSWORD
============================================================ */
let authMode = 'login'; // 'login', 'signup', or 'forgot'
let pendingSignupUser = null;
let pendingResetUser = null;
let otpCountdownInterval = null;

function toggleAuthMode(targetMode){
  if(targetMode){
    authMode = targetMode;
  } else {
    authMode = authMode === 'login' ? 'signup' : 'login';
  }

  const errEl = document.getElementById('authError');
  if(errEl) errEl.textContent = '';

  const nameField = document.getElementById('signupNameField');
  const desigField = document.getElementById('signupDesignationField');
  const passwordField = document.getElementById('authPasswordField') || document.getElementById('passwordField');
  const forgotLink = document.getElementById('forgotPasswordLink');
  const submitBtn = document.getElementById('authSubmitBtn');
  const switchText = document.getElementById('authSwitchText');

  if(authMode === 'signup'){
    document.getElementById('authTitle').textContent = 'Create your account';
    document.getElementById('authSubtitle').textContent = 'Set up attendance for your classes';
    if(nameField) nameField.style.display = 'block';
    if(desigField) desigField.style.display = 'block';
    if(passwordField) passwordField.style.display = 'block';
    if(forgotLink) forgotLink.style.display = 'none';
    if(submitBtn) submitBtn.textContent = 'Create account & Get OTP';
    if(switchText) switchText.innerHTML = 'Already have an account? <span onclick="toggleAuthMode(\'login\')">Log in</span>';
  } else if(authMode === 'forgot'){
    document.getElementById('authTitle').textContent = 'Reset Your Password';
    document.getElementById('authSubtitle').textContent = 'Enter your registered Gmail to receive a password reset OTP';
    if(nameField) nameField.style.display = 'none';
    if(desigField) desigField.style.display = 'none';
    if(passwordField) passwordField.style.display = 'none';
    if(forgotLink) forgotLink.style.display = 'none';
    if(submitBtn) submitBtn.textContent = 'Send Password Reset OTP →';
    if(switchText) switchText.innerHTML = 'Remember your password? <span onclick="toggleAuthMode(\'login\')">Log in</span>';
  } else {
    authMode = 'login';
    document.getElementById('authTitle').textContent = 'Welcome back';
    document.getElementById('authSubtitle').textContent = 'Log in to manage your classes';
    if(nameField) nameField.style.display = 'none';
    if(desigField) desigField.style.display = 'none';
    if(passwordField) passwordField.style.display = 'block';
    if(forgotLink) forgotLink.style.display = 'block';
    if(submitBtn) submitBtn.textContent = 'Log in';
    if(switchText) switchText.innerHTML = 'New here? <span onclick="toggleAuthMode(\'signup\')">Create an account</span>';
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

async function syncUserProfileToFirebase(userProfile){
  if(!userProfile || !userProfile.email) return;
  const key = typeof sanitizeKey === 'function' ? sanitizeKey(userProfile.email) : userProfile.email.replace(/[^a-zA-Z0-9_]/g, '_');

  if(window.firebaseDb){
    try {
      await window.firebaseDb.collection('users').doc(key).set({
        name: userProfile.name,
        email: userProfile.email,
        designation: userProfile.designation || 'Assistant Professor',
        authProvider: userProfile.authProvider || 'email_otp',
        lastLoginAt: Date.now(),
        updatedAt: Date.now()
      }, { merge: true });
    } catch(e) {
      console.log('Firebase users collection sync note:', e);
    }
  }
}

async function handleGoogleSignIn(){
  if(!window.firebase || !firebase.auth){
    toast('Firebase Auth loading... Please wait.');
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await firebase.auth().signInWithPopup(provider);
    const user = result.user;
    if(user && user.email){
      const email = user.email.toLowerCase();
      const name = user.displayName || email.split('@')[0];
      const designation = 'Assistant Professor';

      currentUser = { name, email, designation };
      
      const existing = await storageGet('user:' + email);
      if(!existing){
        await storageSet('user:' + email, JSON.stringify({ name, email, designation, verified: true }));
        await storageSet('data:' + email, JSON.stringify({ groups: [] }));
      }

      await syncUserProfileToFirebase({ name, email, designation, authProvider: 'google' });
      
      toast(`🎉 Welcome, ${name.split(' ')[0]}!`);
      enterApp();
    }
  } catch(e) {
    console.error('Google Sign-In Error:', e);
    if(e.code === 'auth/popup-closed-by-user'){
      toast('Google Sign-In canceled.');
    } else {
      toast('Google Sign-In: ' + (e.message || 'Check Authorized Domains'));
    }
  }
}

function generateOtp6Digit(){
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendRealEmailOtp(email, name, otp){
  console.log(`[Attendo Mailer] Dispatching 6-digit OTP ${otp} to ${email}`);

  // Direct Web3Forms Clean Gmail Dispatcher (Sends 6-digit OTP code directly to Primary Inbox)
  try {
    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        access_key: '2778848d-6a58-45b0-8c29-37335e381023',
        subject: `🔑 ${otp} is your Attendo Security Verification Code`,
        from_name: 'Attendo Platform',
        name: name || 'User',
        email: email,
        message: `Hello ${name || 'User'},\n\nYour 6-digit Attendo Security Verification OTP Code is:\n\n👉  ${otp}  👈\n\nPlease enter this 6-digit code on your screen to complete verification / password reset.\n\nThank you,\nAttendo Team`
      })
    }).catch(e=>{});
  } catch(e){}
}

async function handleAuthSubmit(){
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  const password = document.getElementById('authPassword')?.value || '';
  const errEl = document.getElementById('authError');
  if(errEl) errEl.textContent = '';

  if(!email){ if(errEl) errEl.textContent = 'Please enter your email address.'; return; }

  if(!isValidEmail(email)){
    if(errEl) errEl.textContent = 'Please enter a valid email address (e.g. user@example.com).';
    return;
  }

  if(authMode === 'forgot'){
    // FORGOT PASSWORD FLOW
    let raw = null;
    try { raw = await storageGet('user:' + email); } catch(e){}
    
    if(!raw && firebaseDb){
      try {
        const docKey = typeof sanitizeKey === 'function' ? sanitizeKey(email) : email.replace(/[^a-zA-Z0-9_]/g, '_');
        const doc = await firebaseDb.collection('users').doc(docKey).get();
        if(doc.exists && doc.data()){
          raw = JSON.stringify(doc.data());
        }
      } catch(e){}
    }

    if(!raw){
      if(errEl) errEl.textContent = 'No account found with this email. Please check your email or create an account.';
      return;
    }

    const user = JSON.parse(raw);
    const generatedOtp = generateOtp6Digit();
    pendingSignupUser = null;
    pendingResetUser = {
      email: email,
      user: user,
      otp: generatedOtp,
      createdAt: Date.now()
    };

    openOtpModal();
    return;

  } else if(authMode === 'signup'){
    // SIGNUP FLOW
    if(!password || password.length < 6){
      if(errEl) errEl.textContent = 'Password must be at least 6 characters long.';
      return;
    }

    const name = document.getElementById('signupName').value.trim();
    const designation = document.getElementById('signupDesignation')?.value || 'Assistant Professor';
    
    if(!name || name.length < 2){
      if(errEl) errEl.textContent = 'Please enter a valid full name (at least 2 characters).';
      return;
    }

    const existing = await storageGet('user:' + email);
    if(existing){
      if(errEl) errEl.textContent = 'An account with this email address already exists. Please log in instead.';
      return;
    }

    const generatedOtp = generateOtp6Digit();
    pendingResetUser = null;
    pendingSignupUser = {
      name,
      email,
      password,
      designation,
      otp: generatedOtp,
      createdAt: Date.now()
    };

    openOtpModal();

  } else {
    // LOGIN FLOW
    if(!password){ if(errEl) errEl.textContent = 'Please enter your password.'; return; }

    const raw = await storageGet('user:' + email);
    if(!raw){ if(errEl) errEl.textContent = 'No account found with this email. Please check your email or create an account.'; return; }
    const user = JSON.parse(raw);
    if(user.password !== password){ if(errEl) errEl.textContent = 'Incorrect password. Please try again.'; return; }
    currentUser = { name: user.name, email: user.email, designation: user.designation || 'Assistant Professor' };
    toast('Welcome back, ' + user.name.split(' ')[0] + '!');
    enterApp();
  }
}

function openOtpModal(){
  const activeUser = pendingResetUser || pendingSignupUser;
  if(!activeUser) return;

  const backdrop = document.getElementById('otpModalBackdrop');
  if(backdrop){
    backdrop.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(5,5,10,0.85);display:flex !important;align-items:center;justify-content:center;z-index:999999;padding:20px;backdrop-filter:blur(4px);";
    backdrop.classList.add('show');
  }

  const descEl = document.getElementById('otpModalDesc');
  if(descEl){
    descEl.innerHTML = pendingResetUser ? 
      `Password reset 6-digit verification code sent to <b>${activeUser.email}</b>.` : 
      `Security 6-digit verification code sent to <b>${activeUser.email}</b>.`;
  }

  const inputEl = document.getElementById('otpInput');
  if(inputEl){
    inputEl.value = '';
    inputEl.focus();
  }

  const errEl = document.getElementById('otpError');
  if(errEl) errEl.textContent = '';

  const hintEl = document.getElementById('otpHintBadge');
  if(hintEl){
    hintEl.innerHTML = `
      <div style="background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);border-radius:10px;padding:14px;margin-bottom:12px;text-align:left">
        <div style="font-size:13px;color:var(--cyan);font-weight:700;margin-bottom:4px">📩 Security OTP Dispatched</div>
        <div style="font-size:12px;color:var(--text);line-height:1.5">
          A 6-digit verification code has been sent directly to <b>${activeUser.email}</b>.<br>
          <span style="font-size:11px;color:var(--text-dim);display:block;margin-top:4px">(Please open the Gmail Inbox for <b>${activeUser.email}</b>, copy the 6-digit code, and enter it below)</span>
        </div>
      </div>
    `;
  }

  const actionBtn = document.querySelector('#otpModalBackdrop .modal-actions button.btn-primary');
  if(actionBtn){
    actionBtn.textContent = pendingResetUser ? 'Verify OTP & Continue →' : 'Verify & Create Account →';
  }

  sendRealEmailOtp(activeUser.email, activeUser.name || 'User', activeUser.otp);
  toast(`📩 Verification code dispatched to ${activeUser.email}`);
  startOtpTimer(3 * 60);
}

function startOtpTimer(secondsLeft){
  clearInterval(otpCountdownInterval);
  const countdownEl = document.getElementById('otpCountdown');

  function updateTimer(s){
    const m = Math.floor(s / 60);
    const sec = s % 60;
    if(countdownEl) countdownEl.textContent = `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  updateTimer(secondsLeft);
  otpCountdownInterval = setInterval(() => {
    secondsLeft--;
    if(secondsLeft <= 0){
      clearInterval(otpCountdownInterval);
      if(countdownEl){
        countdownEl.textContent = '00:00 (Expired)';
        countdownEl.style.color = 'var(--red)';
      }
      const errEl = document.getElementById('otpError');
      if(errEl) errEl.textContent = 'OTP code has expired. Click "Resend OTP Code" to send a new code to Gmail.';
    } else {
      updateTimer(secondsLeft);
    }
  }, 1000);
}

function resendSignupOtp(){
  const activeUser = pendingResetUser || pendingSignupUser;
  if(!activeUser) return;
  const newOtp = generateOtp6Digit();
  activeUser.otp = newOtp;
  activeUser.createdAt = Date.now();

  const hintEl = document.getElementById('otpHintBadge');
  if(hintEl){
    hintEl.innerHTML = `
      <div style="background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);border-radius:10px;padding:14px;margin-bottom:12px;text-align:left">
        <div style="font-size:13px;color:var(--cyan);font-weight:700;margin-bottom:4px">📩 New Security OTP Dispatched</div>
        <div style="font-size:12px;color:var(--text);line-height:1.5">
          A fresh 6-digit verification code has been sent directly to <b>${activeUser.email}</b>.<br>
          <span style="font-size:11px;color:var(--text-dim);display:block;margin-top:4px">(Please open the Gmail Inbox for <b>${activeUser.email}</b> and enter the code below)</span>
        </div>
      </div>
    `;
  }

  const errEl = document.getElementById('otpError');
  if(errEl) errEl.textContent = '';

  sendRealEmailOtp(activeUser.email, activeUser.name || 'User', newOtp);
  toast(`📩 Fresh OTP sent to ${activeUser.email}`);
  startOtpTimer(3 * 60);
}

function closeOtpModal(){
  clearInterval(otpCountdownInterval);
  const backdrop = document.getElementById('otpModalBackdrop');
  if(backdrop){
    backdrop.style.cssText = "display:none !important;";
    backdrop.classList.remove('show');
  }
}

async function verifySignupOtp(){
  const activeUser = pendingResetUser || pendingSignupUser;
  if(!activeUser) return;
  
  const inputEl = document.getElementById('otpInput');
  const enteredCode = inputEl ? inputEl.value.trim() : '';
  const errEl = document.getElementById('otpError');
  if(errEl) errEl.textContent = '';

  if(!enteredCode || enteredCode.length !== 6){
    if(errEl) errEl.textContent = 'Please enter the complete 6-digit code.';
    return;
  }

  if(enteredCode !== activeUser.otp){
    if(errEl) errEl.textContent = 'Incorrect OTP code. Please check your Gmail inbox and try again.';
    return;
  }

  if(pendingResetUser){
    // FORGOT PASSWORD FLOW: Open Set New Password Modal
    closeOtpModal();
    openResetPasswordModal();
    return;
  }

  // SIGNUP FLOW: Create User Account
  const user = {
    name: pendingSignupUser.name,
    email: pendingSignupUser.email,
    password: pendingSignupUser.password,
    designation: pendingSignupUser.designation,
    verified: true,
    verifiedAt: Date.now()
  };

  await storageSet('user:' + user.email, JSON.stringify(user));
  await storageSet('data:' + user.email, JSON.stringify({ groups: [] }));

  await syncUserProfileToFirebase({ name: user.name, email: user.email, designation: user.designation, authProvider: 'email_otp' });

  currentUser = { name: user.name, email: user.email, designation: user.designation };
  
  closeOtpModal();
  pendingSignupUser = null;
  
  toast('🎉 Email verified & account created successfully — Welcome to Attendo!');
  enterApp();
}

function openResetPasswordModal(){
  if(!pendingResetUser) return;
  const backdrop = document.getElementById('resetPasswordModalBackdrop');
  if(backdrop){
    backdrop.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(5,5,10,0.85);display:flex !important;align-items:center;justify-content:center;z-index:999999;padding:20px;backdrop-filter:blur(4px);";
    backdrop.classList.add('show');
  }

  const descEl = document.getElementById('resetModalDesc');
  if(descEl) descEl.textContent = `OTP Verified for ${pendingResetUser.email}. Set your new password below.`;

  const newPassEl = document.getElementById('newResetPassword');
  const confirmPassEl = document.getElementById('confirmResetPassword');
  if(newPassEl) newPassEl.value = '';
  if(confirmPassEl) confirmPassEl.value = '';

  const errEl = document.getElementById('resetPasswordError');
  if(errEl) errEl.textContent = '';
}

function closeResetPasswordModal(){
  const backdrop = document.getElementById('resetPasswordModalBackdrop');
  if(backdrop){
    backdrop.style.cssText = "display:none !important;";
    backdrop.classList.remove('show');
  }
}

async function saveNewPassword(){
  if(!pendingResetUser || !pendingResetUser.user) return;
  const newPass = document.getElementById('newResetPassword')?.value || '';
  const confirmPass = document.getElementById('confirmResetPassword')?.value || '';
  const errEl = document.getElementById('resetPasswordError');
  if(errEl) errEl.textContent = '';

  if(!newPass || newPass.length < 6){
    if(errEl) errEl.textContent = 'Password must be at least 6 characters long.';
    return;
  }

  if(newPass !== confirmPass){
    if(errEl) errEl.textContent = 'Passwords do not match. Please check and try again.';
    return;
  }

  const user = pendingResetUser.user;
  user.password = newPass;
  user.updatedAt = Date.now();

  await storageSet('user:' + user.email, JSON.stringify(user));
  await syncUserProfileToFirebase({ name: user.name, email: user.email, designation: user.designation, authProvider: 'email_otp' });

  currentUser = { name: user.name, email: user.email, designation: user.designation };

  closeResetPasswordModal();
  pendingResetUser = null;

  toast(`🎉 Password updated successfully! Welcome back, ${user.name.split(' ')[0]}!`);
  enterApp();
}

function logout(){
  currentUser = null;
  appData = { groups: [] };
  try { window.localStorage.removeItem('attendo_session_user'); } catch(e){}
  document.getElementById('topbar').style.display = 'none';
  document.getElementById('dashboardScreen').style.display = 'none';
  document.getElementById('workspaceScreen').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
  if(document.getElementById('authPassword')) document.getElementById('authPassword').value = '';
}

async function enterApp(){
  try {
    const raw = await storageGet('data:' + currentUser.email);
    appData = raw ? JSON.parse(raw) : { groups: [] };
    
    try { window.localStorage.setItem('attendo_session_user', JSON.stringify(currentUser)); } catch(e){}

    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('topbar').style.display = 'flex';
    renderUserChip();
    goToDashboard();
    
    try { generateSmartNotifications(); } catch(e){ console.error('notif gen error', e); }
  } catch(e) {
    console.error('enterApp error', e);
    goToDashboard();
  }
}

function renderUserChip(){
  if(!currentUser) return;
  const desig = currentUser.designation ? ` (${currentUser.designation})` : '';
  document.getElementById('userChip').textContent = currentUser.name + desig + '  ·  ' + currentUser.email;
}

function openEditProfileModal(){
  if(!currentUser) return;
  document.getElementById('profileName').value = currentUser.name || '';
  document.getElementById('profileDesignation').value = currentUser.designation || 'Assistant Professor';
  document.getElementById('profileModalBackdrop').classList.add('show');
}

function closeEditProfileModal(){
  document.getElementById('profileModalBackdrop').classList.remove('show');
}

async function saveProfile(){
  if(!currentUser) return;
  const name = document.getElementById('profileName').value.trim();
  const designation = document.getElementById('profileDesignation').value;
  if(!name){ toast('Please enter your name.'); return; }

  currentUser.name = name;
  currentUser.designation = designation;

  const raw = await storageGet('user:' + currentUser.email);
  if(raw){
    const u = JSON.parse(raw);
    u.name = name;
    u.designation = designation;
    await storageSet('user:' + currentUser.email, JSON.stringify(u));
  }

  await syncUserProfileToFirebase({ name, email: currentUser.email, designation });

  renderUserChip();
  closeEditProfileModal();
  toast('Profile updated successfully!');
}
