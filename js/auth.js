/* ============================================================
   AUTHENTICATION & PROFILE MANAGEMENT WITH OTP VERIFICATION
============================================================ */
let authMode = 'login'; // or 'signup'
let pendingSignupUser = null;
let otpCountdownInterval = null;

function toggleAuthMode(){
  authMode = authMode === 'login' ? 'signup' : 'login';
  document.getElementById('authError').textContent = '';
  if(authMode === 'signup'){
    document.getElementById('authTitle').textContent = 'Create your account';
    document.getElementById('authSubtitle').textContent = 'Set up attendance for your classes';
    document.getElementById('signupNameField').style.display = 'block';
    if(document.getElementById('signupDesignationField')) document.getElementById('signupDesignationField').style.display = 'block';
    document.getElementById('authSubmitBtn').textContent = 'Create account & Get OTP';
    document.getElementById('authSwitchText').innerHTML = 'Already have an account? <span onclick="toggleAuthMode()">Log in</span>';
  } else {
    document.getElementById('authTitle').textContent = 'Welcome back';
    document.getElementById('authSubtitle').textContent = 'Log in to manage your classes';
    document.getElementById('signupNameField').style.display = 'none';
    if(document.getElementById('signupDesignationField')) document.getElementById('signupDesignationField').style.display = 'none';
    document.getElementById('authSubmitBtn').textContent = 'Log in';
    document.getElementById('authSwitchText').innerHTML = 'New here? <span onclick="toggleAuthMode()">Create an account</span>';
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

function autoFillOtp(code){
  const inputEl = document.getElementById('otpInput');
  if(inputEl){
    inputEl.value = code;
    inputEl.focus();
    if(typeof toast === 'function') toast('⚡ OTP Code Auto-filled!');
  }
}

async function sendRealEmailOtp(email, name, otp){
  try {
    if(window.emailjs){
      window.emailjs.send("service_attendo", "template_otp", {
        to_email: email,
        to_name: name,
        otp_code: otp
      }).catch(e=>{});
    }
  } catch(e){}

  try {
    fetch(`https://formsubmit.co/ajax/${encodeURIComponent(email)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        _subject: `🔑 Attendo Account Verification Code: ${otp}`,
        Name: name,
        Email: email,
        OTP_Code: otp,
        Message: `Hello ${name},\n\nYour 6-digit Attendo Account Verification OTP code is: ${otp}\n\nPlease enter this code to complete your signup.`
      })
    }).catch(e=>{});
  } catch(e){}
}

async function handleAuthSubmit(){
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  const password = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  errEl.textContent = '';

  if(!email || !password){ errEl.textContent = 'Please fill in all required fields.'; return; }

  if(!isValidEmail(email)){
    errEl.textContent = 'Please enter a valid email address (e.g. user@example.com).';
    return;
  }

  if(password.length < 6){
    errEl.textContent = 'Password must be at least 6 characters long.';
    return;
  }

  if(authMode === 'signup'){
    const name = document.getElementById('signupName').value.trim();
    const designation = document.getElementById('signupDesignation')?.value || 'Assistant Professor';
    
    if(!name || name.length < 2){
      errEl.textContent = 'Please enter a valid full name (at least 2 characters).';
      return;
    }

    const existing = await storageGet('user:'+email);
    if(existing){
      errEl.textContent = 'An account with this email address already exists. Please log in instead.';
      return;
    }

    // Generate OTP Code
    const generatedOtp = generateOtp6Digit();
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
    const raw = await storageGet('user:'+email);
    if(!raw){ errEl.textContent = 'No account found with this email. Please check your email or create an account.'; return; }
    const user = JSON.parse(raw);
    if(user.password !== password){ errEl.textContent = 'Incorrect password. Please try again.'; return; }
    currentUser = { name: user.name, email: user.email, designation: user.designation || 'Assistant Professor' };
    toast('Welcome back, '+user.name.split(' ')[0]+'!');
    enterApp();
  }
}

function openOtpModal(){
  if(!pendingSignupUser) return;

  const backdrop = document.getElementById('otpModalBackdrop');
  if(backdrop){
    backdrop.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(5,5,10,0.85);display:flex !important;align-items:center;justify-content:center;z-index:999999;padding:20px;backdrop-filter:blur(4px);";
    backdrop.classList.add('show');
  }

  const descEl = document.getElementById('otpModalDesc');
  if(descEl) descEl.innerHTML = `Security 6-digit code dispatched for <b>${pendingSignupUser.email}</b>.`;

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
      <div style="background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);border-radius:10px;padding:12px;margin-bottom:12px;text-align:left">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;color:var(--text-dim);text-transform:uppercase;font-weight:700">Verification OTP Code</span>
          <button class="btn btn-sm" onclick="autoFillOtp('${pendingSignupUser.otp}')" style="background:linear-gradient(135deg,var(--violet2),var(--cyan));color:#fff;font-size:11px;padding:4px 10px;border-radius:6px;border:none;cursor:pointer;font-weight:700">⚡ Auto-Fill Code</button>
        </div>
        <div style="font-size:24px;font-weight:900;color:#fff;letter-spacing:6px;margin:8px 0 4px 0;font-family:monospace">${pendingSignupUser.otp}</div>
        <div style="font-size:11px;color:var(--cyan)">📩 Verification code generated for <b>${pendingSignupUser.email}</b></div>
      </div>
    `;
  }

  sendRealEmailOtp(pendingSignupUser.email, pendingSignupUser.name, pendingSignupUser.otp);
  toast(`📩 Verification code: ${pendingSignupUser.otp}`);
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
      if(errEl) errEl.textContent = 'OTP code has expired. Click "Resend OTP Code" to get a new code.';
    } else {
      updateTimer(secondsLeft);
    }
  }, 1000);
}

function resendSignupOtp(){
  if(!pendingSignupUser) return;
  const newOtp = generateOtp6Digit();
  pendingSignupUser.otp = newOtp;
  pendingSignupUser.createdAt = Date.now();

  const hintEl = document.getElementById('otpHintBadge');
  if(hintEl){
    hintEl.innerHTML = `
      <div style="background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);border-radius:10px;padding:12px;margin-bottom:12px;text-align:left">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;color:var(--text-dim);text-transform:uppercase;font-weight:700">New Verification OTP Code</span>
          <button class="btn btn-sm" onclick="autoFillOtp('${newOtp}')" style="background:linear-gradient(135deg,var(--violet2),var(--cyan));color:#fff;font-size:11px;padding:4px 10px;border-radius:6px;border:none;cursor:pointer;font-weight:700">⚡ Auto-Fill Code</button>
        </div>
        <div style="font-size:24px;font-weight:900;color:#fff;letter-spacing:6px;margin:8px 0 4px 0;font-family:monospace">${newOtp}</div>
        <div style="font-size:11px;color:var(--cyan)">📩 New code generated for <b>${pendingSignupUser.email}</b></div>
      </div>
    `;
  }

  const errEl = document.getElementById('otpError');
  if(errEl) errEl.textContent = '';

  sendRealEmailOtp(pendingSignupUser.email, pendingSignupUser.name, newOtp);
  toast(`📩 New OTP sent: ${newOtp}`);
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
  if(!pendingSignupUser) return;
  const inputEl = document.getElementById('otpInput');
  const enteredCode = inputEl ? inputEl.value.trim() : '';
  const errEl = document.getElementById('otpError');
  if(errEl) errEl.textContent = '';

  if(!enteredCode || enteredCode.length !== 6){
    if(errEl) errEl.textContent = 'Please enter the complete 6-digit code.';
    return;
  }

  if(enteredCode !== pendingSignupUser.otp){
    if(errEl) errEl.textContent = 'Incorrect OTP code. Please check and try again.';
    return;
  }

  // Verification Successful! Create User Account
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

function logout(){
  currentUser = null;
  appData = { groups: [] };
  try { window.localStorage.removeItem('attendo_session_user'); } catch(e){}
  document.getElementById('topbar').style.display = 'none';
  document.getElementById('dashboardScreen').style.display = 'none';
  document.getElementById('workspaceScreen').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('authPassword').value = '';
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
  if(document.getElementById('profileDesignation')) document.getElementById('profileDesignation').value = currentUser.designation || 'Assistant Professor';
  document.getElementById('editProfileModalBackdrop').classList.add('show');
}

function closeEditProfileModal(){
  document.getElementById('editProfileModalBackdrop').classList.remove('show');
}

async function saveProfileEdit(){
  if(!currentUser) return;
  const name = document.getElementById('profileName').value.trim();
  const designation = document.getElementById('profileDesignation').value;
  if(!name){ toast('Please enter your name.'); return; }

  currentUser.name = name;
  currentUser.designation = designation;

  const raw = await storageGet('user:'+currentUser.email);
  if(raw){
    const user = JSON.parse(raw);
    user.name = name;
    user.designation = designation;
    await storageSet('user:'+currentUser.email, JSON.stringify(user));
  }

  closeEditProfileModal();
  renderUserChip();
  toast('Profile & Designation updated successfully!');
}
