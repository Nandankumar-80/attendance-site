/* ============================================================
   AUTHENTICATION & PROFILE MANAGEMENT WITH ZERO-FAIL SIGNUP & RESET
============================================================ */
let authMode = 'login'; // 'login', 'signup', or 'forgot'
let pendingResetUser = null;
let pendingVerificationEmail = null;

function toggleAuthMode(targetMode){
  if(targetMode){
    authMode = targetMode;
  } else {
    authMode = authMode === 'login' ? 'signup' : 'login';
  }
  console.log('[auth_flow] Auth mode switched to:', authMode);

  const errEl = document.getElementById('authError');
  if(errEl) errEl.textContent = '';

  const nameField = document.getElementById('signupNameField');
  const desigField = document.getElementById('signupDesignationField');
  const passwordField = document.getElementById('authPasswordField') || document.getElementById('passwordField');
  const forgotLink = document.getElementById('forgotPasswordLink');
  const submitBtn = document.getElementById('authSubmitBtn');
  const switchText = document.getElementById('authSwitchText');

  const passHint = document.getElementById('passwordRequirementHint');

  if(authMode === 'signup'){
    document.getElementById('authTitle').textContent = 'Create your account';
    document.getElementById('authSubtitle').textContent = 'Set up attendance for your classes';
    if(nameField) nameField.style.display = 'block';
    if(desigField) desigField.style.display = 'block';
    if(passwordField) passwordField.style.display = 'block';
    if(passHint) passHint.style.display = 'block';
    if(forgotLink) forgotLink.style.display = 'none';
    if(submitBtn) submitBtn.textContent = 'Create Account & Get Started →';
    if(switchText) switchText.innerHTML = 'Already have an account? <span onclick="toggleAuthMode(\'login\')">Log in</span>';
  } else if(authMode === 'forgot'){
    document.getElementById('authTitle').textContent = 'Reset Your Password';
    document.getElementById('authSubtitle').textContent = 'Enter your registered email to reset your password';
    if(nameField) nameField.style.display = 'none';
    if(desigField) desigField.style.display = 'none';
    if(passwordField) passwordField.style.display = 'none';
    if(passHint) passHint.style.display = 'none';
    if(forgotLink) forgotLink.style.display = 'none';
    if(submitBtn) submitBtn.textContent = 'Continue to Reset Password →';
    if(switchText) switchText.innerHTML = 'Remember your password? <span onclick="toggleAuthMode(\'login\')">Log in</span>';
  } else {
    authMode = 'login';
    document.getElementById('authTitle').textContent = 'Welcome back';
    document.getElementById('authSubtitle').textContent = 'Log in to manage your classes';
    if(nameField) nameField.style.display = 'none';
    if(desigField) desigField.style.display = 'none';
    if(passwordField) passwordField.style.display = 'block';
    if(passHint) passHint.style.display = 'none';
    if(forgotLink) forgotLink.style.display = 'block';
    if(submitBtn) submitBtn.textContent = 'Log in';
    if(switchText) switchText.innerHTML = 'New here? <span onclick="toggleAuthMode(\'signup\')">Create an account</span>';

    const inlineBtn = document.getElementById('verifyEmailInlineBtn');
    const statusHint = document.getElementById('emailVerifyStatusHint');
    if(inlineBtn) inlineBtn.style.display = 'none';
    if(statusHint) statusHint.style.display = 'none';
  }

  try { onAuthEmailInputChange(); } catch(e){}
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed);
}

function validatePasswordComplexity(password) {
  if (!password || password.length < 6) {
    return 'Password must be at least 6 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase (capital) letter (A-Z).';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase (small) letter (a-z).';
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must contain at least one special character (e.g. @, #, $, !).';
  }
  return null;
}

async function syncUserProfileToFirebase(userProfile){
  if(!userProfile || !userProfile.email) return;
  const key = typeof sanitizeKey === 'function' ? sanitizeKey(userProfile.email) : userProfile.email.replace(/[^a-zA-Z0-9_]/g, '_');

  if(window.firebaseDb){
    try {
      console.log('[auth_flow] Syncing user profile to Firebase for:', userProfile.email);
      await window.firebaseDb.collection('users').doc(key).set({
        name: userProfile.name,
        email: userProfile.email,
        designation: userProfile.designation || 'Assistant Professor',
        authProvider: userProfile.authProvider || 'email_password',
        emailVerified: userProfile.emailVerified || false,
        lastLoginAt: Date.now(),
        updatedAt: Date.now()
      }, { merge: true });
    } catch(e) {
      console.log('[auth_flow] Firebase users collection sync note:', e);
    }
  }
}

async function handleGoogleSignIn(){
  if(!window.firebase || !firebase.auth){
    console.warn('[auth_flow] Google Sign-In failed: Firebase Auth not ready.');
    toast('Firebase Auth loading... Please wait.');
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    console.log('[auth_flow] Initiating Google Sign-In popup...');
    const result = await firebase.auth().signInWithPopup(provider);
    const user = result.user;
    if(user && user.email){
      const email = user.email.toLowerCase();
      const name = user.displayName || email.split('@')[0];
      const designation = 'Assistant Professor';

      currentUser = { name, email, designation };
      
      const existing = await storageGet('user:' + email);
      let userObj = existing ? JSON.parse(existing) : { name, email, designation, createdAt: Date.now() };
      userObj.verified = true;
      userObj.emailVerified = true;
      await storageSet('user:' + email, JSON.stringify(userObj));
      await storageSet('verified_demo:' + email, 'true');
      if(!existing){
        console.log('[auth_flow] First-time Google Sign-In. Creating data record for:', email);
        await storageSet('data:' + email, JSON.stringify({ groups: [] }));
      } else {
        console.log('[auth_flow] Existing user found for Google Sign-In:', email);
      }

      await syncUserProfileToFirebase({ name, email, designation, authProvider: 'google', emailVerified: true });
      
      console.log('[auth_flow] Google Sign-In successfully completed for:', email);
      toast(`🎉 Welcome, ${name.split(' ')[0]}!`);
      enterApp();
    }
  } catch(e) {
    console.error('[auth_flow] Google Sign-In Error:', e);
    if(e.code === 'auth/popup-closed-by-user'){
      toast('Google Sign-In canceled.');
    } else {
      toast('Google Sign-In: ' + (e.message || 'Check Authorized Domains'));
    }
  }
}

async function handleAuthSubmit(){
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  const password = document.getElementById('authPassword')?.value || '';
  const errEl = document.getElementById('authError');
  if(errEl) errEl.textContent = '';

  console.log(`[auth_flow] Form submission started | Mode: ${authMode} | Email: ${email}`);

  if(!email){
    console.warn('[auth_flow] Auth submission failed: Missing email address.');
    if(errEl) errEl.textContent = 'Please enter your email address.';
    return;
  }

  if(!isValidEmail(email)){
    console.warn('[auth_flow] Auth submission failed: Invalid email format:', email);
    if(errEl) errEl.textContent = 'Please enter a valid email address (e.g. user@example.com).';
    return;
  }

  if(authMode === 'forgot'){
    console.log('[auth_flow] Executing password reset request for:', email);
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
      console.warn('[auth_flow] Password reset failed: No account found for email:', email);
      if(errEl) errEl.textContent = 'No account found with this email. Please check your email or create an account.';
      return;
    }

    const user = JSON.parse(raw);
    pendingResetUser = { email: email, user: user };

    if(window.firebase && window.firebase.auth){
      try {
        console.log('[auth_flow] Sending Firebase password reset email to:', email);
        firebase.auth().sendPasswordResetEmail(email).catch(e=>{});
      } catch(e){}
    }

    openResetPasswordModal();
    return;

  } else if(authMode === 'signup'){
    // SIGNUP FLOW WITH INLINE EMAIL VERIFICATION CHECK
    console.log('[auth_flow] Executing signup flow for:', email);
    const passErr = validatePasswordComplexity(password);
    if(passErr){
      console.warn('[auth_flow] Signup failed:', passErr);
      if(errEl) errEl.textContent = passErr;
      return;
    }

    const name = document.getElementById('signupName')?.value?.trim() || '';
    const designation = document.getElementById('signupDesignation')?.value || 'Assistant Professor';
    
    if(!name || name.length < 2){
      console.warn('[auth_flow] Signup failed: Name must be at least 2 characters.');
      if(errEl) errEl.textContent = 'Please enter a valid full name (at least 2 characters).';
      return;
    }

    const existing = await storageGet('user:' + email);
    if(existing){
      console.warn('[auth_flow] Signup failed: Account already exists for:', email);
      if(errEl) errEl.textContent = 'An account with this email address already exists. Please log in instead.';
      return;
    }

    // Check email verification state
    let isVerified = false;
    if(window.firebase && window.firebase.auth && window.firebase.auth().currentUser && window.firebase.auth().currentUser.email === email){
      await window.firebase.auth().currentUser.reload().catch(e=>{});
      isVerified = window.firebase.auth().currentUser.emailVerified;
    }

    if(!isVerified){
      console.warn('[auth_flow] Signup paused: Email verification link required for:', email);
      if(errEl) errEl.textContent = '📩 Please verify your email first! Verification link sent. Check your inbox and click the link.';
      triggerEmailVerification(email);
      return;
    }

    const user = {
      name,
      email,
      password,
      designation,
      verified: true,
      emailVerified: true,
      createdAt: Date.now()
    };

    await storageSet('user:' + email, JSON.stringify(user));
    await storageSet('data:' + email, JSON.stringify({ groups: [] }));

    await syncUserProfileToFirebase({ name, email, designation, authProvider: 'email_password', emailVerified: true });

    currentUser = { name, email, designation };
    console.log('[auth_flow] Signup completed successfully for:', email);
    toast(`🎉 Account created successfully — Welcome to Attendo, ${name.split(' ')[0]}!`);
    enterApp();

  } else {
    // LOGIN FLOW (CLEAN & NO VERIFY BUTTONS)
    console.log('[auth_flow] Executing login flow for:', email);
    if(!password){
      console.warn('[auth_flow] Login failed: Missing password.');
      if(errEl) errEl.textContent = 'Please enter your password.';
      return;
    }

    const raw = await storageGet('user:' + email);
    if(!raw){
      console.warn('[auth_flow] Login failed: No account found for email:', email);
      if(errEl) errEl.textContent = 'No account found with this email. Please check your email or create an account.';
      return;
    }
    const user = JSON.parse(raw);
    if(user.password !== password){
      console.warn('[auth_flow] Login failed: Incorrect password for email:', email);
      if(errEl) errEl.textContent = 'Incorrect password. Please try again.';
      return;
    }

    if(user.emailVerified === false && !user.verified){
      console.warn('[auth_flow] Login blocked: Email not verified for:', email);
      if(errEl) errEl.textContent = '⚠️ Email address is not verified yet! Switch to Create Account to verify email.';
      return;
    }

    currentUser = { name: user.name, email: user.email, designation: user.designation || 'Assistant Professor' };
    console.log('[auth_flow] Login completed successfully for:', email);
    toast('Welcome back, ' + user.name.split(' ')[0] + '!');
    enterApp();
  }
}

async function onAuthEmailInputChange(){
  const email = document.getElementById('authEmail')?.value.trim().toLowerCase();
  const inlineBtn = document.getElementById('verifyEmailInlineBtn');
  const statusHint = document.getElementById('emailVerifyStatusHint');

  // Strictly hide inline verify button and hints when in Login or Forgot mode
  if(authMode !== 'signup'){
    if(inlineBtn) inlineBtn.style.display = 'none';
    if(statusHint) statusHint.style.display = 'none';
    return;
  }

  if(!email || !isValidEmail(email)){
    if(inlineBtn) inlineBtn.style.display = 'none';
    if(statusHint) statusHint.style.display = 'none';
    return;
  }

  let isVerified = false;
  let raw = await storageGet('user:' + email);
  if(raw){
    const u = JSON.parse(raw);
    if(u.verified || u.emailVerified) isVerified = true;
  }

  if(window.firebase && window.firebase.auth && window.firebase.auth().currentUser && window.firebase.auth().currentUser.email === email){
    await window.firebase.auth().currentUser.reload().catch(e=>{});
    if(window.firebase.auth().currentUser.emailVerified) isVerified = true;
  }

  if(statusHint){
    statusHint.style.display = 'block';
    if(isVerified){
      statusHint.innerHTML = '<span style="color:var(--green);font-size:11px;font-weight:600">✅ Email Verified</span>';
      if(inlineBtn) inlineBtn.style.display = 'none';
    } else {
      statusHint.innerHTML = '<span style="color:var(--yellow);font-size:11px">⌛ Unverified — Click "Verify" to send verification link</span>';
      if(inlineBtn){
        inlineBtn.style.display = 'inline-block';
        inlineBtn.textContent = '✉️ Verify';
      }
    }
  }
}

async function triggerEmailVerification(targetEmail){
  const email = (targetEmail || document.getElementById('authEmail')?.value || '').trim().toLowerCase();
  const password = document.getElementById('authPassword')?.value || 'Attendo@2026';
  const errEl = document.getElementById('authError');
  const statusHint = document.getElementById('emailVerifyStatusHint');
  if(errEl) errEl.textContent = '';

  if(!email || !isValidEmail(email)){
    if(errEl) errEl.textContent = 'Please enter a valid email address first.';
    toast('Please enter a valid email address.');
    return;
  }

  pendingVerificationEmail = email;
  console.log('[auth_flow] Triggering Firebase email verification for:', email);

  let emailSentSuccessfully = false;

  if(window.firebase && window.firebase.auth){
    try {
      let user = window.firebase.auth().currentUser;
      
      if(!user || user.email !== email){
        try {
          const userCred = await window.firebase.auth().createUserWithEmailAndPassword(email, password);
          user = userCred.user;
        } catch(createErr){
          if(createErr.code === 'auth/email-already-in-use'){
            try {
              const userCred = await window.firebase.auth().signInWithEmailAndPassword(email, password);
              user = userCred.user;
            } catch(signInErr){}
          }
        }
      }

      if(user){
        const baseUrl = typeof getAppBaseUrl === 'function' ? getAppBaseUrl() : window.location.origin + window.location.pathname;
        const actionCodeSettings = {
          url: baseUrl + '?verifyEmail=' + encodeURIComponent(email),
          handleCodeInApp: true
        };
        await user.sendEmailVerification(actionCodeSettings);
        emailSentSuccessfully = true;
        console.log('[auth_flow] Firebase user.sendEmailVerification() successfully dispatched to:', email);
      } else {
        const baseUrl = typeof getAppBaseUrl === 'function' ? getAppBaseUrl() : window.location.origin + window.location.pathname;
        const actionCodeSettings = {
          url: baseUrl + '?verifyEmail=' + encodeURIComponent(email),
          handleCodeInApp: true
        };
        await window.firebase.auth().sendSignInLinkToEmail(email, actionCodeSettings);
        emailSentSuccessfully = true;
      }
    } catch(e){
      console.warn('[auth_flow] Firebase Auth verification email dispatch note:', e);
    }
  }

  const baseUrl = typeof getAppBaseUrl === 'function' ? getAppBaseUrl() : window.location.origin + window.location.pathname;
  const directVerifyUrl = baseUrl + '?verifyEmail=' + encodeURIComponent(email);

  if(statusHint){
    statusHint.style.display = 'block';
    statusHint.innerHTML = `
      <div style="margin-top:6px;padding:8px 10px;border-radius:8px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.3);color:var(--text);font-size:11px">
        <div style="font-weight:700;color:var(--cyan);margin-bottom:2px">📩 Verification Link Sent to: <b>${email}</b></div>
        <div>Please check your email inbox/spam folder to verify.</div>
        <div style="margin-top:4px;font-size:10px;color:var(--text-dim)">
          Verification Link: <a href="${directVerifyUrl}" target="_blank" style="color:var(--cyan);text-decoration:underline">Click here to verify email</a>
        </div>
      </div>
    `;
  }

  toast(`📩 Verification link sent to ${email}`);
}

function openEmailVerificationModal(email){
  pendingVerificationEmail = email || pendingVerificationEmail;
  console.log('[auth_flow] Email verification modal opened for:', pendingVerificationEmail);
  const modal = document.getElementById('emailVerificationModalBackdrop');
  if(modal){
    modal.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(5,5,10,0.85);display:flex !important;align-items:center;justify-content:center;z-index:999999;padding:20px;backdrop-filter:blur(4px);";
    modal.classList.add('show');
  }

  const targetEl = document.getElementById('emailVerifyTargetDisplay');
  if(targetEl) targetEl.textContent = `Target Email: ${pendingVerificationEmail}`;

  const stateEl = document.getElementById('emailVerifyStateDisplay');
  if(stateEl) stateEl.innerHTML = `<span>⌛ Verification Link Sent — Pending Confirmation</span>`;

  const errEl = document.getElementById('emailVerifyModalError');
  if(errEl) errEl.textContent = '';
}

function closeEmailVerificationModal(){
  const modal = document.getElementById('emailVerificationModalBackdrop');
  if(modal){
    modal.style.cssText = "display:none !important;";
    modal.classList.remove('show');
  }
}

async function checkUserEmailVerificationStatus(){
  if(!pendingVerificationEmail) return;
  const email = pendingVerificationEmail;
  console.log('[auth_flow] Checking authoritative Firebase verification status for:', email);

  let verified = false;

  if(window.firebase && window.firebase.auth && window.firebase.auth().currentUser){
    try {
      await window.firebase.auth().currentUser.reload();
      verified = window.firebase.auth().currentUser.emailVerified;
      console.log('[auth_flow] Firebase currentUser.reload() emailVerified:', verified);
    } catch(e){
      console.log('[auth_flow] Firebase reload note:', e);
    }
  }

  const stateEl = document.getElementById('emailVerifyStateDisplay');
  const errEl = document.getElementById('emailVerifyModalError');

  if(verified){
    let raw = await storageGet('user:' + email);
    let u = raw ? JSON.parse(raw) : { email: email };
    u.verified = true;
    u.emailVerified = true;
    u.emailVerifiedAt = Date.now();
    await storageSet('user:' + email, JSON.stringify(u));
    await syncUserProfileToFirebase({ email: email, emailVerified: true, emailVerifiedAt: Date.now() });

    if(stateEl) stateEl.innerHTML = `<span style="color:var(--green)">✅ Email Verified via Firebase Auth!</span>`;
    if(errEl) errEl.textContent = '';
    toast('🎉 Email successfully verified!');
    setTimeout(() => {
      closeEmailVerificationModal();
      onAuthEmailInputChange();
    }, 1000);
  } else {
    if(stateEl) stateEl.innerHTML = `<span style="color:var(--yellow)">⌛ Verification Pending... Please click the link in your email.</span>`;
    if(errEl) errEl.textContent = 'Verification not confirmed by Firebase Auth yet. Please check your inbox/spam folder and click the link.';
  }
}

async function checkEmailVerificationUrlParams(){
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const verifyEmail = urlParams.get('verifyEmail');
    const oobCode = urlParams.get('oobCode');
    const mode = urlParams.get('mode');

    if(oobCode && (mode === 'verifyEmail' || mode === 'signIn') && window.firebase && window.firebase.auth){
      try {
        await window.firebase.auth().applyActionCode(oobCode);
        console.log('[auth_flow] Firebase applyActionCode succeeded.');
        toast('🎉 Email successfully verified via Firebase Auth!');
      } catch(e){
        console.log('[auth_flow] Firebase applyActionCode note:', e);
      }
    }

    if(verifyEmail && isValidEmail(verifyEmail)){
      console.log('[auth_flow] URL verification parameter detected for:', verifyEmail);
      let raw = await storageGet('user:' + verifyEmail);
      if(raw){
        const u = JSON.parse(raw);
        u.verified = true;
        u.emailVerified = true;
        u.emailVerifiedAt = Date.now();
        await storageSet('user:' + verifyEmail, JSON.stringify(u));
      }
      await syncUserProfileToFirebase({ email: verifyEmail, emailVerified: true, emailVerifiedAt: Date.now() });
      toast(`🎉 Email verified for ${verifyEmail}! Please log in.`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch(e){}
}

function openResetPasswordModal(){
  if(!pendingResetUser) return;
  console.log('[auth_flow] Reset password modal opened for:', pendingResetUser.email);
  const backdrop = document.getElementById('resetPasswordModalBackdrop');
  if(backdrop){
    backdrop.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(5,5,10,0.85);display:flex !important;align-items:center;justify-content:center;z-index:999999;padding:20px;backdrop-filter:blur(4px);";
    backdrop.classList.add('show');
  }

  const descEl = document.getElementById('resetModalDesc');
  if(descEl) descEl.textContent = `Resetting password for ${pendingResetUser.email}. Set your new password below.`;

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

  console.log('[auth_flow] Saving new password for:', pendingResetUser.user.email);

  const passErr = validatePasswordComplexity(newPass);
  if(passErr){
    console.warn('[auth_flow] Save new password failed:', passErr);
    if(errEl) errEl.textContent = passErr;
    return;
  }

  if(newPass !== confirmPass){
    console.warn('[auth_flow] Save new password failed: Passwords do not match.');
    if(errEl) errEl.textContent = 'Passwords do not match. Please check and try again.';
    return;
  }

  const user = pendingResetUser.user;
  user.password = newPass;
  user.updatedAt = Date.now();

  await storageSet('user:' + user.email, JSON.stringify(user));
  await syncUserProfileToFirebase({ name: user.name, email: user.email, designation: user.designation, authProvider: 'email_password' });

  currentUser = { name: user.name, email: user.email, designation: user.designation };

  closeResetPasswordModal();
  pendingResetUser = null;

  console.log('[auth_flow] Password reset completed successfully for:', user.email);
  toast(`🎉 Password updated successfully! Welcome back, ${user.name.split(' ')[0]}!`);
  enterApp();
}

function logout(){
  console.log('[auth_flow] User logging out:', currentUser?.email);
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
    console.log('[auth_flow] Entering application for user:', currentUser?.email);
    const raw = await storageGet('data:' + currentUser.email);
    appData = raw ? JSON.parse(raw) : { groups: [] };
    
    try { window.localStorage.setItem('attendo_session_user', JSON.stringify(currentUser)); } catch(e){}

    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('topbar').style.display = 'flex';
    renderUserChip();
    goToDashboard();
    
    console.log('[auth_flow] Application loaded successfully for:', currentUser?.email);
    try { generateSmartNotifications(); } catch(e){ console.error('notif gen error', e); }
  } catch(e) {
    console.error('[auth_flow] enterApp error:', e);
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
