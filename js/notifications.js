/* ============================================================
   SMART NOTIFICATION CENTER & ALERTS ENGINE (100% BULLETPROOF)
============================================================ */
let activeNotifications = [];

function generateSmartNotifications(){
  activeNotifications = [];

  if(!appData || !Array.isArray(appData.groups) || appData.groups.length === 0) {
    activeNotifications.push({
      id: 'welcome_1',
      type: 'info',
      title: '👋 Welcome to Attendo!',
      message: 'All your classes and student records are active and synced.',
      time: 'System',
      actionText: null
    });
    updateNotifBadge();
    return;
  }

  const currentMonth = new Date().toISOString().slice(0,7);

  try {
    appData.groups.forEach(g => {
      if(!g) return;
      const sessions = Array.isArray(g.sessions) ? g.sessions : [];
      const students = Array.isArray(g.students) ? g.students : [];

      const monthSessions = sessions.filter(s => s && typeof s.date === 'string' && s.date.startsWith(currentMonth));
      const totalClasses = monthSessions.length;

      const instLabel = typeof groupInstitution === 'function' ? groupInstitution(g) : (g.collegeName || g.schoolName || 'Class');
      const grpLbl = typeof groupLabel === 'function' ? groupLabel(g) : (g.department || g.className || 'Group');

      if(totalClasses >= 1 && students.length > 0){
        const defaulters = [];
        const topPerformers = [];

        students.forEach(stu => {
          if(!stu || !stu.id) return;
          const presentCount = monthSessions.filter(sess => sess && sess.records && Boolean(sess.records[stu.id])).length;
          const pct = totalClasses ? Math.round((presentCount / totalClasses) * 100) : 0;

          if(pct < 75) defaulters.push({ name: stu.name || 'Student', pct });
          if(pct >= 95) topPerformers.push({ name: stu.name || 'Student', pct });
        });

        if(defaulters.length > 0){
          activeNotifications.push({
            id: 'def_' + (g.id || Math.random()),
            type: 'warning',
            title: `⚠️ Shortage Warning: ${grpLbl}`,
            message: `${defaulters.length} student(s) have < 75% attendance this month.`,
            time: 'Active Alert',
            actionText: 'View Report',
            actionFn: () => { closeNotifModal(); if(typeof openGroup==='function' && g.id) openGroup(g.id); if(typeof switchTab==='function') switchTab('reports'); }
          });
        }

        if(topPerformers.length > 0){
          activeNotifications.push({
            id: 'cert_' + (g.id || Math.random()),
            type: 'success',
            title: `🏆 Certificate Milestone: ${grpLbl}`,
            message: `${topPerformers.length} student(s) reached ≥ 95% attendance! Certificates are ready to generate.`,
            time: 'Achievement',
            actionText: 'Generate Certificates',
            actionFn: () => { closeNotifModal(); if(typeof openGroup==='function' && g.id) openGroup(g.id); if(typeof switchTab==='function') switchTab('reports'); }
          });
        }
      }

      if(sessions.length > 0){
        activeNotifications.push({
          id: 'rem_' + (g.id || Math.random()),
          type: 'info',
          title: `📊 Monthly PDF Reminder: ${instLabel}`,
          message: `Remember to download monthly attendance PDF & CSV for ${grpLbl}.`,
          time: 'Reminder',
          actionText: 'Export PDF',
          actionFn: () => { closeNotifModal(); if(typeof openGroup==='function' && g.id) openGroup(g.id); if(typeof switchTab==='function') switchTab('reports'); }
        });
      }
    });
  } catch(e) {
    console.error('Error in generateSmartNotifications loop', e);
  }

  if(activeNotifications.length === 0){
    activeNotifications.push({
      id: 'welcome_1',
      type: 'info',
      title: '👋 Welcome to Attendo!',
      message: 'All your classes and student records are active and synced.',
      time: 'System',
      actionText: null
    });
  }

  updateNotifBadge();
}

function updateNotifBadge(){
  const badge = document.getElementById('notifBadge');
  if(!badge) return;

  try {
    const readIds = JSON.parse(localStorage.getItem('attendo_read_notifs') || '[]');
    const unreadCount = activeNotifications.filter(n => n && !readIds.includes(n.id)).length;

    if(unreadCount > 0){
      badge.style.display = 'inline-block';
      badge.textContent = unreadCount;
    } else {
      badge.style.display = 'none';
    }
  } catch(e) {
    console.error('Error in updateNotifBadge', e);
  }
}

function openNotifModal(){
  let backdrop = document.getElementById('notifModalBackdrop');
  if(!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'notifModalBackdrop';
    backdrop.className = 'modal-backdrop';
    backdrop.onclick = (e) => { if(e.target === backdrop) closeNotifModal(); };
    backdrop.innerHTML = `
      <div class="modal" style="max-width:480px;width:92%">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:10px">
          <h3 style="margin:0;font-size:17px;display:flex;align-items:center;gap:8px">🔔 Smart Notification Center</h3>
          <button class="icon-btn" onclick="closeNotifModal()" style="font-size:18px;color:var(--text-dim);background:none;border:none;cursor:pointer">✕</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="font-size:12px;color:var(--text-dim)">Active alerts & shortage notifications</span>
          <button class="btn btn-sm btn-ghost" onclick="markAllNotifsRead()" style="color:var(--cyan);font-size:12px;padding:2px 8px">✓ Mark All as Read</button>
        </div>
        <div id="notifListContainer" style="max-height:360px;overflow-y:auto;padding-right:4px"></div>
        <div class="modal-actions" style="margin-top:16px;text-align:right">
          <button class="btn btn-secondary" onclick="closeNotifModal()">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
  }

  backdrop.style.display = 'flex';
  backdrop.classList.add('show');

  try { generateSmartNotifications(); } catch(e){ console.error('notif gen error', e); }
  try { renderNotifList(); } catch(e){ console.error('notif render error', e); }
}

function closeNotifModal(){
  const backdrop = document.getElementById('notifModalBackdrop');
  if(backdrop) {
    backdrop.style.display = 'none';
    backdrop.classList.remove('show');
  }
}

function renderNotifList(){
  const container = document.getElementById('notifListContainer');
  if(!container) return;
  container.innerHTML = '';

  let readIds = [];
  try {
    readIds = JSON.parse(localStorage.getItem('attendo_read_notifs') || '[]');
  } catch(e){}

  if(!activeNotifications || activeNotifications.length === 0){
    container.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-dim);font-size:13px">No active notifications right now.</div>`;
    return;
  }

  activeNotifications.forEach((n, idx) => {
    if(!n) return;
    const isRead = readIds.includes(n.id);
    const item = document.createElement('div');
    item.style.padding = '12px 16px';
    item.style.borderRadius = '10px';
    item.style.marginBottom = '10px';
    item.style.background = isRead ? 'var(--card2)' : 'rgba(124,58,237,0.08)';
    item.style.border = isRead ? '1px solid var(--border-soft)' : '1px solid rgba(124,58,237,0.3)';

    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
        <b style="font-size:14px;color:${n.type==='warning'?'var(--red)':(n.type==='success'?'#f59e0b':'var(--text)')}">${n.title || 'Notification'}</b>
        <span style="font-size:11px;color:var(--text-dim)">${n.time || ''}</span>
      </div>
      <p style="font-size:13px;color:var(--text-dim);margin-bottom:8px">${n.message || ''}</p>
      ${n.actionText ? `<button class="btn btn-sm btn-ghost" style="color:var(--cyan);padding:4px 10px;font-size:12px" id="notifAct_${idx}">${n.actionText} →</button>` : ''}
    `;

    container.appendChild(item);

    if(n.actionText && n.actionFn){
      const btn = document.getElementById(`notifAct_${idx}`);
      if(btn) btn.onclick = n.actionFn;
    }
  });
}

function markAllNotifsRead(){
  const allIds = activeNotifications.map(n => n ? n.id : null).filter(Boolean);
  try {
    localStorage.setItem('attendo_read_notifs', JSON.stringify(allIds));
  } catch(e){}
  updateNotifBadge();
  renderNotifList();
  if(typeof toast === 'function') toast('All notifications marked as read.');
}

window.openNotifModal = openNotifModal;
window.closeNotifModal = closeNotifModal;
window.markAllNotifsRead = markAllNotifsRead;

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('notifBtn');
  if(btn){
    btn.onclick = (e) => {
      e.preventDefault();
      openNotifModal();
    };
  }
});
