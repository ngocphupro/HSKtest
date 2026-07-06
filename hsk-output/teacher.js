// ════════════════════════════════════════════
//  HSK CLASSROOM — Teacher JS (Sidebar Layout)
// ════════════════════════════════════════════

// ── State ──
let currentUser = null;
let allStudents = [];
let allVocab = [];
let allGroups = [];
let allClasses = [];
let allQuizzes = [];
let allQuizFolders = [];
let allSentencesT = [];
let selectedVocabIds = new Set();
let selectedStudentIds = new Set();
let selectedClassIds = new Set();
let selectedGroupIds = new Set();
let quizType = 'homework';
let assignTarget = 'class';
let editingQuizId = null;
let studentLevels = {}; // { student_id: hsk_level }

const AVATAR_COLORS = ['#C84B31', '#3D6B4F', '#2A5FA5', '#6B3FA0', '#C08830', '#1F7A4D', '#8B4513', '#2E86C1'];
function avatarColor(name) { let h = 0; for (let c of name) h = (h + c.charCodeAt(0)) % AVATAR_COLORS.length; return AVATAR_COLORS[h]; }
function initials(name) { return name.trim().split(' ').slice(-2).map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function hskBadge(level) {
  const map = { 1: 'badge-hsk1', 2: 'badge-hsk2', 3: 'badge-hsk3', 4: 'badge-hsk4', 5: 'badge-hsk5', 6: 'badge-hsk6', 0: 'badge-hsknew' };
  const label = level === 0 ? 'New' : level;
  const extraStyle = level === 0 ? ' style="background:#8c7ae6; color:#fff; border:1px solid #7158e2;"' : '';
  return `<span class="badge ${map[level] || 'badge-hsk1'}"${extraStyle}>HSK ${label}</span>`;
}
function fmtDate(dt) { return dt ? new Date(dt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }
function fmtTime(s) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── TTS ──
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const ut = new SpeechSynthesisUtterance(text);
  ut.lang = 'zh-CN';
  ut.rate = 0.8;
  window.speechSynthesis.speak(ut);
}

// ── Init ──
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.replace('index.html'); return; }
  currentUser = session.user;
  const { data: profile } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (!profile || profile.role !== 'teacher') { window.location.replace('index.html'); return; }

  // Kiểm soát đăng nhập một thiết bị
  const localToken = localStorage.getItem('hsk_session_token');
  if (profile.session_token && profile.session_token !== localToken) {
    alert("Tài khoản của bạn đã được đăng nhập từ một thiết bị khác. Vui lòng đăng nhập lại.");
    await sb.auth.signOut();
    window.location.replace('index.html');
    return;
  }

  // Kiểm tra định kỳ (mỗi 15 giây)
  setInterval(async () => {
    if (!currentUser) return;
    const { data: p } = await sb.from('profiles').select('session_token').eq('id', currentUser.id).single();
    if (p && p.session_token && p.session_token !== localStorage.getItem('hsk_session_token')) {
      alert("Tài khoản của bạn đã được đăng nhập từ một thiết bị khác. Hệ thống sẽ tự động đăng xuất.");
      await sb.auth.signOut();
      window.location.replace('index.html');
    }
  }, 15000);
  document.getElementById('teacher-name').textContent = profile.full_name;
  document.getElementById('teacher-avatar').textContent = initials(profile.full_name);
  document.getElementById('teacher-avatar').style.background = avatarColor(profile.full_name);
  await Promise.all([loadStudents(), loadClasses(), loadVocab(), loadQuizzes(), loadQuizFolders(), loadResults(), loadHskBadge(), loadAnnouncements(), loadSentencesT(), loadDevices()]);
})();

// ── Navigation ──
function showPanel(id) {
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('panel-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.getAttribute('onclick') === `showPanel('${id}')`) btn.classList.add('active');
  });
  closeSidebar();
  if (id === 'hsk-approve') loadHskRequests();
  if (id === 'devices-approve') loadDevices();
  if (id === 'announcements') loadAnnouncements();
  if (id === 'feedback') loadFeedback();
  if (id === 'vocab') loadVocab();
  if (id === 'classes') { loadClasses(); loadQuizzes(); }
  if (id === 'sentences') loadSentencesT();
  if (id === 'results') { loadResults(); loadTeacherLeaderboard(); }
}

function openSidebar() { document.getElementById('sidebar').classList.add('open'); document.getElementById('mobile-overlay').classList.add('open'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('mobile-overlay').classList.remove('open'); }

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

async function logout() {
  await sb.auth.signOut();
  window.location.replace('index.html');
}

// ── Toast ──
function showToast(msg, dur = 3000) {
  const el = document.getElementById('toast-msg');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), dur);
}

// ══════════════════════════════════════════
//  STUDENTS
// ══════════════════════════════════════════
async function loadStudents() {
  const { data: students } = await sb.from('profiles').select('*').eq('role', 'student').order('full_name');
  const { data: levels } = await sb.from('hsk_student_levels').select('*');
  const { data: pending } = await sb.from('hsk_level_requests').select('student_id').eq('status', 'pending');
  const { data: members } = await sb.from('group_members').select('student_id, groups(name)');
  const { data: results } = await sb.from('quiz_results').select('student_id, score, total');

  allStudents = students || [];
  studentLevels = {};
  (levels || []).forEach(l => studentLevels[l.student_id] = l.hsk_level);

  const pendingSet = new Set((pending || []).map(p => p.student_id));
  const groupMap = {};
  (members || []).forEach(m => { if (!groupMap[m.student_id]) groupMap[m.student_id] = []; groupMap[m.student_id].push(m.groups?.name); });

  // Progress per student: avg quiz score %
  const progMap = {};
  (results || []).forEach(r => {
    if (!progMap[r.student_id]) progMap[r.student_id] = { sum: 0, count: 0 };
    progMap[r.student_id].sum += r.score / r.total * 100;
    progMap[r.student_id].count++;
  });

  // Stats
  const hsk1 = allStudents.filter(s => (studentLevels[s.id] || 1) === 1).length;
  const hsk2 = allStudents.filter(s => (studentLevels[s.id] || 1) === 2).length;
  const hsk3 = allStudents.filter(s => (studentLevels[s.id] || 1) === 3).length;
  const hsk4 = allStudents.filter(s => (studentLevels[s.id] || 1) === 4).length;
  const hsk5 = allStudents.filter(s => (studentLevels[s.id] || 1) === 5).length;
  const hsk6 = allStudents.filter(s => (studentLevels[s.id] || 1) === 6).length;
  document.getElementById('stat-total').textContent = allStudents.length;
  document.getElementById('stat-pending').textContent = pendingSet.size;
  document.getElementById('stat-hsk1').textContent = hsk1;
  document.getElementById('stat-hsk2').textContent = hsk2;
  document.getElementById('stat-hsk3').textContent = hsk3;
  document.getElementById('stat-hsk4').textContent = hsk4;
  document.getElementById('stat-hsk5').textContent = hsk5;
  document.getElementById('stat-hsk6').textContent = hsk6;

  // Store extra data for filtering
  allStudents = allStudents.map(s => ({
    ...s,
    hsk_level: studentLevels[s.id] || 1,
    isPending: pendingSet.has(s.id),
    groups: (groupMap[s.id] || []).join(', ') || '',
    progress: progMap[s.id] ? Math.round(progMap[s.id].sum / progMap[s.id].count) : null,
  }));

  renderStudentGrid(allStudents);
}

function renderStudentGrid(students) {
  const el = document.getElementById('student-list');
  if (!students.length) {
    el.innerHTML = '<div class="empty-state"><span class="empty-icon">👤</span>Chưa có học sinh nào.</div>';
    return;
  }
  el.innerHTML = students.map(s => {
    const prog = s.progress;
    const progCls = prog >= 70 ? 'pct-good' : prog >= 40 ? 'pct-mid' : 'pct-low';
    const sub = [s.groups ? `Nhóm ${s.groups}` : null, s.isPending ? '⏳ Chờ duyệt' : `Đang học HSK${s.hsk_level}`].filter(Boolean).join(' · ');
    
    // Expiry status
    const expDate = s.expiry_date ? new Date(s.expiry_date) : null;
    const isExpired = expDate && expDate < new Date();
    const expStr = s.expiry_date ? fmtDate(s.expiry_date).split(',')[0] : '—'; // Just the date part
    const expStyle = isExpired ? 'color:var(--danger); font-weight:700;' : 'color:var(--text3);';

    return `
      <div class="student-card">
        <div class="stu-avatar" style="background:${avatarColor(s.full_name)}">${initials(s.full_name)}</div>
        <div class="stu-info" onclick="openStudentDetail('${s.id}')" style="cursor:pointer;" title="Xem thông tin tài khoản">
          <div class="stu-name" style="text-decoration:underline; text-underline-offset:2px; color:var(--blue);">${s.full_name}</div>
          <div class="stu-sub">${sub}</div>
          <div style="font-size:11px; margin-top:4px; ${expStyle}">Hạn: ${expStr} ${isExpired ? ' (Hết hạn)' : ''}</div>
        </div>
        <div class="stu-actions-panel">
          <div style="display:flex;gap:4px;margin-bottom:8px;">
            ${hskBadge(s.hsk_level)}
            ${prog !== null ? `<div class="stu-pct ${progCls}">${prog}%</div>` : ''}
          </div>
          <div class="btn-group-row">
            <button class="btn-ghost btn-xs" onclick="demoteStudent('${s.id}', '${s.full_name}', ${s.hsk_level})" ${s.hsk_level <= 1 ? 'disabled' : ''}>📉 Hạ cấp</button>
            <button class="btn-primary btn-xs" onclick="promoteStudent('${s.id}', '${s.full_name}', ${s.hsk_level})" ${s.hsk_level >= 6 ? 'disabled' : ''}>🚀 Nâng cấp</button>
            <button class="btn-danger btn-xs btn-delete-stu" onclick="deleteStudent('${s.id}', '${s.full_name}')" title="Xoá học sinh">✕</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function filterStudents() {
  const q = document.getElementById('search-students').value.toLowerCase();
  const lvl = document.getElementById('filter-hsk').value;
  renderStudentGrid(allStudents.filter(s =>
    (!q || s.full_name.toLowerCase().includes(q) || (s.username || '').toLowerCase().includes(q)) &&
    (!lvl || String(s.hsk_level) === lvl)
  ));
}

async function addStudent() {
  const name = document.getElementById('new-student-name').value.trim();
  const username = document.getElementById('new-student-username').value.trim();
  const pw = document.getElementById('new-student-pw').value;
  const msgEl = document.getElementById('add-student-msg');
  const showErr = t => { msgEl.textContent = t; msgEl.className = 'msg error'; msgEl.style.display = 'block'; };
  if (!name || !username || !pw) return showErr('Vui lòng nhập đầy đủ.');
  // Dùng RPC create_student (SECURITY DEFINER) — tạo user với email @hsk.local
  const { data, error } = await sb.rpc('create_student', {
    p_username: username,
    p_password: pw,
    p_full_name: name
  });
  if (error) return showErr(error.message);
  if (data?.error) return showErr(data.error);

  // Explicitly save the plain-text password to profiles so teacher can see it
  // And set initial expiry date (3 months from now)
  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + 3);
  await sb.from('profiles').update({ password: pw, expiry_date: expiry }).eq('username', username);

  msgEl.textContent = '✓ Đã thêm học sinh!'; msgEl.className = 'msg success'; msgEl.style.display = 'block';
  setTimeout(() => { closeModal('modal-add-student');['new-student-name', 'new-student-username', 'new-student-pw'].forEach(id => document.getElementById(id).value = ''); msgEl.style.display = 'none'; }, 1200);
  await loadStudents();
}

async function deleteStudent(uid, name) {
  if (!confirm(`Bạn có chắc chắn muốn xoá tài khoản của học sinh "${name}"? Thao tác này không thể hoàn tác.`)) return;
  const { data, error } = await sb.rpc('delete_student', { p_student_id: uid });
  if (error) { showToast('Lỗi: ' + error.message); return; }
  if (data?.error) { showToast('Lỗi: ' + data.error); return; }
  showToast(`✓ Đã xoá tài khoản của ${name}`);
  await loadStudents();
}

async function promoteStudent(id, name, curLevel) {
  const nextLevel = curLevel + 1;
  if (nextLevel > 6) return;
  if (!confirm(`Nâng cấp học sinh "${name}" lên HSK${nextLevel}?`)) return;
  
  const { error } = await sb.from('hsk_student_levels').upsert({
    student_id: id,
    hsk_level: nextLevel,
    updated_at: new Date()
  }, { onConflict: 'student_id' });
  
  if (error) { showToast('Lỗi: ' + error.message); return; }
  
  // Extend account expiry by 3 months on upgrade
  const { data: p } = await sb.from('profiles').select('expiry_date').eq('id', id).single();
  if (p) {
    let newExp = new Date(p.expiry_date || new Date());
    newExp.setMonth(newExp.getMonth() + 3);
    await sb.from('profiles').update({ expiry_date: newExp }).eq('id', id);
  }

  showToast(`✓ Đã nâng cấp ${name} lên HSK${nextLevel} và cộng thêm 3 tháng hạn dùng`);
  await loadStudents();
}

async function demoteStudent(id, name, curLevel) {
  const prevLevel = curLevel - 1;
  if (prevLevel < 1) return;
  if (!confirm(`Hạ cấp học sinh "${name}" xuống HSK${prevLevel}?`)) return;
  
  const { error } = await sb.from('hsk_student_levels').upsert({
    student_id: id,
    hsk_level: prevLevel,
    updated_at: new Date()
  }, { onConflict: 'student_id' });
  
  if (error) { showToast('Lỗi: ' + error.message); return; }
  showToast(`✓ Đã hạ cấp ${name} xuống HSK${prevLevel}`);
  await loadStudents();
}

async function openStudentDetail(id) {
  const { data: p, error } = await sb.from('profiles').select('*').eq('id', id).single();
  if (error || !p) { showToast('Không tìm thấy thông tin học sinh'); return; }
  
  const content = document.getElementById('student-detail-content');
  if (!content) return;

  const mkValue = p.password || '<span style="color:var(--text3); font-style:italic; font-weight:400;">Mật khẩu đã mã hóa (bảo mật)</span>';

  content.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:14px; padding:10px 0;">
      <div class="field">
        <label>Họ và tên</label>
        <div style="padding:10px 12px; background:var(--blue-bg); border-radius:var(--r-sm); font-weight:700; color:var(--blue); border:1px solid var(--blue-lt);">
          ${p.full_name}
        </div>
      </div>
      
      <div class="field">
        <label>Tài khoản đăng nhập (TK)</label>
        <div style="padding:10px 12px; background:var(--surface2); border:1px solid var(--border); border-radius:var(--r-sm); display:flex; align-items:center; justify-content:space-between;">
          <span style="font-family:monospace; font-size:14px; font-weight:600;">${p.username || '—'}</span>
          <button class="btn-xs btn-ghost" onclick="navigator.clipboard.writeText('${p.username}'); showToast('Đã chép TK')">Chép</button>
        </div>
      </div>
      
      <div class="field">
        <label>Mật khẩu (MK)</label>
        <div style="padding:10px 12px; background:var(--gold-bg); border:1px solid var(--gold-lt); border-radius:var(--r-sm); display:flex; align-items:center; justify-content:space-between;">
          <span style="font-family:monospace; font-size:14px; font-weight:600; color:var(--gold);">${mkValue}</span>
          ${p.password ? `<button class="btn-xs btn-ghost" onclick="navigator.clipboard.writeText('${p.password}'); showToast('Đã chép MK')">Chép</button>` : ''}
        </div>
      </div>

      <div class="field">
        <label>Hạn sử dụng tài khoản</label>
        <div style="padding:10px 12px; background:var(--surface2); border:1px solid var(--border); border-radius:var(--r-sm); display:flex; align-items:center; justify-content:space-between;">
          <span style="font-weight:600; color:${new Date(p.expiry_date) < new Date() ? 'var(--danger)' : 'var(--text)'}">
            ${p.expiry_date ? fmtDate(p.expiry_date) : 'Chưa thiết lập'}
          </span>
          <button class="btn-xs btn-primary" onclick="extendExpiry('${p.id}', '${p.full_name}')">Gia hạn 3 tháng</button>
        </div>
      </div>

      <div style="margin-top:8px; padding:12px; background:#fdf8ee; border-radius:var(--r-sm); border:1px dashed #e5d5bc;">
        <div style="font-size:11px; color:#856404; font-weight:600; text-transform:uppercase; margin-bottom:4px;">💡 Mẹo quản lý</div>
        <p style="font-size:12px; color:#856404; line-height:1.4;">Nếu học sinh quên mật khẩu, hãy nhắc các em sử dụng chức năng đổi mật khẩu hoặc liên hệ quản trị viên.</p>
      </div>
    </div>
  `;
  openModal('modal-student-detail');
}

async function extendExpiry(id, name) {
  if (!confirm(`Gia hạn thêm 3 tháng cho học sinh "${name}"?`)) return;
  
  const { data: p } = await sb.from('profiles').select('expiry_date').eq('id', id).single();
  let newExp = new Date(p ? (p.expiry_date || new Date()) : new Date());
  
  // If the account is already expired, start from today
  if (newExp < new Date()) newExp = new Date();
  
  newExp.setMonth(newExp.getMonth() + 3);
  
  const { error } = await sb.from('profiles').update({ expiry_date: newExp }).eq('id', id);
  if (error) { showToast('Lỗi: ' + error.message); return; }
  
  showToast(`✓ Đã gia hạn cho ${name} đến ${newExp.toLocaleDateString('vi-VN')}`);
  closeModal('modal-student-detail');
  await loadStudents();
}

// ══════════════════════════════════════════
//  DEVICES APPROVAL
// ══════════════════════════════════════════
let allDevicesData = [];

async function loadDevices() {
  const { data: devices, error } = await sb.from('devices')
    .select('*, profiles(full_name, username)')
    .order('created_at', { ascending: false });
    
  if (error) { console.error(error); return; }
  
  allDevicesData = devices || [];
  
  const pending = allDevicesData.filter(d => d.status === 'pending_approval');
  const activeBlocked = allDevicesData.filter(d => d.status !== 'pending_approval');
  
  const badge = document.getElementById('devices-badge');
  if (badge) {
    badge.textContent = pending.length;
    badge.style.display = pending.length > 0 ? 'inline-block' : 'none';
  }
  
  renderPendingDevices(pending);
  renderAllDevices(activeBlocked);
}

function renderPendingDevices(list) {
  const el = document.getElementById('devices-pending-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><span class="empty-icon">✅</span>Không có thiết bị nào chờ duyệt.</div>';
    return;
  }
  el.innerHTML = list.map(d => `
    <div class="card" style="border-left: 4px solid var(--warn);">
      <div class="card-row">
        <div class="card-info">
          <h4>📱 ${d.profiles?.full_name} (@${d.profiles?.username || ''})</h4>
          <p>Thiết bị: ${d.device_name || 'Không rõ'} <br> Xin cấp phép lúc: ${fmtDate(d.created_at)}</p>
        </div>
        <div class="card-actions">
          <button class="btn-primary btn-sm" onclick="approveDevice('${d.id}')">Duyệt</button>
          <button class="btn-danger btn-sm" onclick="blockDevice('${d.id}')">Từ chối</button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderAllDevices(list) {
  const el = document.getElementById('devices-all-list');
  if (!list.length) {
    el.innerHTML = '<tr><td colspan="4" class="empty-state">Không có thiết bị nào.</td></tr>';
    return;
  }
  el.innerHTML = list.map(d => `
    <tr>
      <td>
        <div style="font-weight:600;color:var(--text)">${d.profiles?.full_name}</div>
        <div style="font-size:12px;color:var(--text3)">@${d.profiles?.username || ''}</div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          ${d.status === 'active' ? '<span style="color:var(--good)">●</span>' : '<span style="color:var(--danger)">●</span>'}
          ${d.device_name || 'Không rõ'}
        </div>
      </td>
      <td>${fmtDate(d.updated_at)}</td>
      <td>
        ${d.status === 'active' 
          ? `<button class="btn-ghost btn-xs" style="color:var(--danger)" onclick="blockDevice('${d.id}')">Khóa</button>`
          : `<button class="btn-ghost btn-xs" style="color:var(--good)" onclick="approveDevice('${d.id}')">Mở khóa</button>`
        }
        <button class="btn-danger btn-xs" onclick="deleteDevice('${d.id}')">✕ Xóa</button>
      </td>
    </tr>
  `).join('');
}

function filterDevices() {
  const q = document.getElementById('search-devices').value.toLowerCase().trim();
  const activeBlocked = allDevicesData.filter(d => 
    d.status !== 'pending_approval' && 
    (d.profiles?.full_name?.toLowerCase().includes(q) || d.profiles?.username?.toLowerCase().includes(q))
  );
  renderAllDevices(activeBlocked);
}

async function approveDevice(id) {
  const { error } = await sb.from('devices').update({ status: 'active', updated_at: new Date() }).eq('id', id);
  if (error) { showToast('Lỗi: ' + error.message); return; }
  showToast('Đã duyệt thiết bị.');
  await loadDevices();
}

async function blockDevice(id) {
  const { error } = await sb.from('devices').update({ status: 'blocked', updated_at: new Date() }).eq('id', id);
  if (error) { showToast('Lỗi: ' + error.message); return; }
  showToast('Đã khóa thiết bị.');
  await loadDevices();
}

async function deleteDevice(id) {
  if (!confirm('Xóa thiết bị này? Học sinh sẽ có thể đăng ký thiết bị mới thay thế.')) return;
  const { error } = await sb.from('devices').delete().eq('id', id);
  if (error) { showToast('Lỗi: ' + error.message); return; }
  showToast('Đã xóa thiết bị.');
  await loadDevices();
}

// ══════════════════════════════════════════
//  GROUPS
// ══════════════════════════════════════════
async function loadGroups() {
  const { data } = await sb.from('groups').select('*, group_members(student_id, profiles(full_name))').order('name');
  allGroups = data || [];
  const el = document.getElementById('group-list');
  if (!allGroups.length) { el.innerHTML = '<div class="empty-state"><span class="empty-icon">👥</span>Chưa có nhóm nào.</div>'; return; }
  el.innerHTML = allGroups.map(g => {
    const members = (g.group_members || []).map(m => m.profiles?.full_name).filter(Boolean);
    return `
      <div class="card">
        <div class="card-row">
          <div class="card-info">
            <h4>👥 ${g.name}</h4>
            <p>${members.length} học sinh${members.length ? ': ' + members.slice(0, 3).join(', ') + (members.length > 3 ? '…' : '') : ''}</p>
          </div>
          <div class="card-actions">
            <button class="btn-ghost btn-sm" onclick="openAddToGroup(${g.id})">＋ Thêm</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

async function createGroup() {
  const name = document.getElementById('new-group-name').value.trim();
  if (!name) return;
  await sb.from('groups').insert({ name, created_by: currentUser.id });
  closeModal('modal-create-group');
  document.getElementById('new-group-name').value = '';
  await loadGroups();
  showToast('✓ Đã tạo nhóm ' + name);
}

function openAddToGroup(groupId) {
  document.getElementById('add-group-id').value = groupId;
  selectedStudentIds.clear();
  const el = document.getElementById('group-student-picker');
  el.innerHTML = allStudents.map(s => `
    <div class="picker-item" onclick="togglePick(this,'student',${JSON.stringify(s.id)})">
      <div class="stu-avatar" style="background:${avatarColor(s.full_name)};width:28px;height:28px;font-size:11px;">${initials(s.full_name)}</div>
      <span class="pi-name">${s.full_name}</span>
      <span class="pi-check">✓</span>
    </div>`).join('');
  openModal('modal-add-to-group');
}

function togglePick(el, type, id) {
  const set = type === 'student' ? selectedStudentIds : type === 'class' ? selectedClassIds : type === 'vocab' ? selectedVocabIds : selectedGroupIds;
  el.classList.toggle('selected');
  if (set.has(id)) set.delete(id); else set.add(id);
}

async function addStudentsToGroup() {
  const groupId = parseInt(document.getElementById('add-group-id').value);
  if (!selectedStudentIds.size) return;
  const rows = [...selectedStudentIds].map(sid => ({ group_id: groupId, student_id: sid }));
  await sb.from('group_members').upsert(rows, { onConflict: 'group_id,student_id' });
  closeModal('modal-add-to-group');
  await loadGroups();
  showToast(`✓ Đã thêm ${rows.length} học sinh vào nhóm`);
}

// ══════════════════════════════════════════
//  CLASSES
// ══════════════════════════════════════════
async function loadClasses() {
  const { data: classes } = await sb.from('classes').select('*, lessons(id), class_members(student_id)').order('name');
  allClasses = classes || [];
  const el = document.getElementById('class-list');
  if (!allClasses.length) { el.innerHTML = '<div class="empty-state"><span class="empty-icon">🏫</span>Chưa có lớp nào.</div>'; return; }
  el.innerHTML = allClasses.map(c => `
    <div class="card">
      <div class="card-row">
        <div class="card-info">
          <h4>🏫 ${c.name}</h4>
          <p>${c.description || ''} · ${(c.lessons || []).length} bài học · ${(c.class_members || []).length} học sinh</p>
        </div>
        <div class="card-actions-bottom" style="margin-top:12px; gap:4px;">
          <button class="btn-primary btn-xs" style="flex:1" onclick="openCreateQuizForClass(${c.id})">＋ Bài tập</button>
          <button class="btn-ghost btn-xs" onclick="openAssignFolderToClass(${c.id}, '${c.name.replace(/'/g, "\\'")}')">📂 Giao thư mục</button>
          <button class="btn-ghost btn-xs" onclick="openManageClassMembers(${c.id}, '${c.name.replace(/'/g, "\\'")}')">👥 TV</button>
          <button class="btn-ghost btn-xs" onclick="openEditClass(${c.id})">✏️</button>
          <button class="btn-danger btn-xs" onclick="deleteClass(${c.id}, '${c.name.replace(/'/g, "\\'")}')">✕</button>
        </div>
      </div>
    </div>`).join('');
}

async function createClass() {
  const name = document.getElementById('new-class-name').value.trim();
  const desc = document.getElementById('new-class-desc').value.trim();
  if (!name) return;
  await sb.from('classes').insert({ name, description: desc || null, created_by: currentUser.id });
  closeModal('modal-create-class');
  ['new-class-name', 'new-class-desc'].forEach(id => document.getElementById(id).value = '');
  await loadClasses();
  showToast('✓ Đã tạo lớp ' + name);
}

async function openEditClass(classId) {
  const { data } = await sb.from('classes').select('*').eq('id', classId).single();
  if (!data) return;
  document.getElementById('edit-class-id').value = data.id;
  document.getElementById('edit-class-name').value = data.name;
  document.getElementById('edit-class-desc').value = data.description || '';
  openModal('modal-edit-class');
}

async function updateClass() {
  const id = parseInt(document.getElementById('edit-class-id').value);
  const name = document.getElementById('edit-class-name').value.trim();
  const desc = document.getElementById('edit-class-desc').value.trim();
  if (!name) return alert('Nhập tên lớp');
  const { error } = await sb.from('classes').update({ name, description: desc || null }).eq('id', id);
  if (error) return alert('Lỗi: ' + error.message);
  closeModal('modal-edit-class');
  await loadClasses();
  showToast('✓ Đã cập nhật lớp');
}

async function deleteClass(id, name) {
  if (!confirm(`Bạn có chắc muốn xoá lớp "${name}"? Thao tác này sẽ xoá danh sách thành viên và bài học trong lớp.`)) return;
  // Remove members and lessons associated with the class first
  await sb.from('class_members').delete().eq('class_id', id);
  await sb.from('lessons').delete().eq('class_id', id);
  const { error } = await sb.from('classes').delete().eq('id', id);
  if (error) return alert('Lỗi: ' + error.message);
  showToast('✓ Đã xoá lớp ' + name);
  await loadClasses();
}

async function openManageClassMembers(classId, className) {
  document.getElementById('manage-class-id').value = classId;
  document.getElementById('manage-class-title').textContent = `Thành viên lớp: ${className}`;
  
  const { data: members } = await sb.from('class_members').select('student_id').eq('class_id', classId);
  const memberIds = new Set((members || []).map(m => m.student_id));
  
  selectedStudentIds.clear();
  memberIds.forEach(id => selectedStudentIds.add(id));
  
  const el = document.getElementById('class-student-picker');
  el.innerHTML = allStudents.map(s => `
    <div class="picker-item ${memberIds.has(s.id) ? 'selected' : ''}" onclick="togglePick(this,'student','${s.id}')">
      <div class="stu-avatar" style="background:${avatarColor(s.full_name)};width:28px;height:28px;font-size:11px;">${initials(s.full_name)}</div>
      <span class="pi-name">${s.full_name}</span>
      <span class="pi-check">✓</span>
    </div>`).join('');
  openModal('modal-manage-class-members');
}

async function saveClassMembers() {
  const classId = parseInt(document.getElementById('manage-class-id').value);
  // First delete all existing members to overwrite
  await sb.from('class_members').delete().eq('class_id', classId);
  
  if (selectedStudentIds.size > 0) {
    const rows = [...selectedStudentIds].map(sid => ({ class_id: classId, student_id: sid }));
    await sb.from('class_members').insert(rows);
  }
  
  closeModal('modal-manage-class-members');
  await loadClasses();
  showToast('✓ Đã cập nhật danh sách học sinh của lớp');
}

// ── LESSONS ──
async function loadLessons() {
  const { data } = await sb.from('lessons').select('*, classes(name), lesson_vocab(vocab(*))').order('position');
  const el = document.getElementById('lesson-list');
  if (!data?.length) { el.innerHTML = '<p class="empty-state">Chưa có bài học nào</p>'; return; }
  
  const active = data.filter(l => l.class_id);
  const library = data.filter(l => !l.class_id);

  el.innerHTML = `
    <div class="section-row"><h4>📚 Thư viện bài học (Mẫu)</h4></div>
    <div class="card-grid">
      ${library.map(l => `
        <div class="card card-glass">
          <div class="card-info">
            <h4>📖 ${l.title}</h4>
            <p>${(l.lesson_vocab || []).length} từ vựng</p>
          </div>
          <div class="card-actions">
            <button class="btn-ghost btn-xs" onclick="openAssignLesson(${l.id})">＋ Thêm vào lớp</button>
            <button class="btn-ghost btn-xs" onclick="openEditLesson(${l.id})" title="Sửa bài học">✏️</button>
            <button class="btn-danger btn-xs" onclick="deleteLesson(${l.id}, '${l.title}')" title="Xoá bài học">✕</button>
          </div>
        </div>`).join('') || '<p class="empty-state">Chưa có bài học mẫu</p>'}
    </div>
    
    <div class="section-row" style="margin-top:24px"><h4>🏫 Bài học đang dạy</h4></div>
    <div class="card-grid">
      ${active.map(l => `
        <div class="card">
          <div class="card-info">
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;">${l.classes?.name}</div>
            <h4 style="margin-top:2px;">📖 ${l.title}</h4>
            <p>${(l.lesson_vocab || []).length} từ vựng</p>
          </div>
          <div class="card-actions-bottom">
            <button class="btn-ghost btn-xs" style="flex:1" onclick="openEditLesson(${l.id})">✏️ Sửa bài học</button>
            <button class="btn-danger btn-xs" onclick="deleteLesson(${l.id}, '${l.title}')">✕ Xoá</button>
          </div>
        </div>`).join('') || '<p class="empty-state">Chưa có bài học nào được gán cho lớp</p>'}
    </div>
  `;
}

// LESSON FUNCTIONS REMOVED - Lessons are no longer used, only quizzes

// ══════════════════════════════════════════
//  VOCAB
// ══════════════════════════════════════════
async function loadVocab() {
  const { data } = await sb.from('vocab').select('*').order('hsk_level').order('id');
  allVocab = data || [];
  renderVocabTable(allVocab);
  refreshVocabDependentPickers();
}

function refreshVocabDependentPickers() {
  const createQuizModal = document.getElementById('modal-create-quiz');
  if (createQuizModal?.classList.contains('open')) renderVocabPicker(document.getElementById('search-vocab-quiz').value.toLowerCase());

  const createLessonModal = document.getElementById('modal-create-lesson');
  if (createLessonModal?.classList.contains('open')) {
    const sel = document.getElementById('lesson-class-id');
    if (sel && !sel.innerHTML) sel.innerHTML = '<option value="">-- Lưu vào thư viện (Mẫu) --</option>' + allClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    const picker = document.getElementById('lesson-vocab-picker');
    if (picker) {
      const pickerList = [...allVocab].sort((a, b) => a.hsk_level - b.hsk_level);
      picker.innerHTML = pickerList.map(v => `
        <div class="picker-item" onclick="togglePick(this,'vocab',${v.id})">
          <span style="font-family:'Noto Serif SC',serif">${v.hanzi}</span>
          <span class="pi-name">${v.pinyin} (HSK ${v.hsk_level})</span>
          <span class="pi-check">✓</span>
        </div>`).join('');
    }
  }

  const editLessonModal = document.getElementById('modal-edit-lesson');
  if (editLessonModal?.classList.contains('open')) {
    const picker = document.getElementById('edit-lesson-vocab-picker');
    if (picker) {
      picker.innerHTML = allVocab.map(v => {
        const isSelected = selectedVocabIds.has(v.id);
        return `
          <div class="picker-item ${isSelected ? 'selected' : ''}" onclick="togglePick(this,'vocab',${v.id})">
            <span style="font-family:'Noto Serif SC',serif">${v.hanzi}</span>
            <span class="pi-name">${v.pinyin}</span>
            <span class="pi-check">✓</span>
          </div>`;
      }).join('');
    }
  }

  const editQuizModal = document.getElementById('modal-edit-quiz');
  if (editQuizModal?.classList.contains('open')) {
    renderEditVocabPicker(document.getElementById('edit-search-vocab-quiz')?.value.toLowerCase() || '');
  }
}

function renderVocabTable(list) {
  const el = document.getElementById('vocab-list');
  if (!list.length) { el.innerHTML = '<tr><td colspan="6" class="empty-state">Chưa có từ vựng nào.</td></tr>'; return; }
  
  // Sort by HSK level then category
  const sorted = [...list].sort((a, b) => {
    if (a.hsk_level !== b.hsk_level) return a.hsk_level - b.hsk_level;
    return (a.category || 'Khác').localeCompare(b.category || 'Khác');
  });
  
  let currentLvl = null;
  let currentCat = null;
  el.innerHTML = sorted.map(v => {
    let groupRow = '';
    const vLvl = v.hsk_level ?? 1;
    const vCat = v.category || 'Khác';
    
    if (vLvl !== currentLvl) {
      currentLvl = vLvl;
      currentCat = vCat;
      const lvlLabel = vLvl === 0 ? 'New' : vLvl;
      groupRow = `<tr class="table-group-header-lvl"><td colspan="6">🏆 Cấp độ HSK ${lvlLabel}</td></tr>
                  <tr class="table-group-header"><td colspan="6">📁 Chủ đề: ${currentCat}</td></tr>`;
    } else if (vCat !== currentCat) {
      currentCat = vCat;
      groupRow = `<tr class="table-group-header"><td colspan="6">📁 Chủ đề: ${currentCat}</td></tr>`;
    }
    
    const level = v.hsk_level ?? 1;
    return `
      ${groupRow}
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn-speak" onclick="speak('${v.hanzi}')">🔊</button>
            <div class="vocab-hanzi">${v.hanzi}</div>
          </div>
        </td>
        <td><div class="vocab-pinyin">${v.pinyin}</div></td>
        <td><div class="vocab-meaning">${v.meaning}</div></td>
        <td>${hskBadge(level)}</td>
        <td><span class="badge" style="background:var(--surface2);color:var(--text2)">${v.category || 'Khác'}</span></td>
        <td><button class="btn-danger btn-xs" onclick="deleteVocab(${v.id})">✕</button></td>
      </tr>`;
  }).join('');
}

function filterVocab() {
  const q = document.getElementById('search-vocab').value.toLowerCase();
  const cat = document.getElementById('filter-vocab-cat').value;
  const lvl = document.getElementById('filter-vocab-level').value;
  renderVocabTable(allVocab.filter(v => 
    (!q || v.hanzi.includes(q) || v.pinyin.toLowerCase().includes(q) || v.meaning.toLowerCase().includes(q)) &&
    (!cat || v.category === cat) &&
    (!lvl || v.hsk_level == lvl)
  ));
}

async function addVocab() {
  const hanzi = document.getElementById('new-hanzi').value.trim();
  const pinyin = document.getElementById('new-pinyin').value.trim();
  const meaning = document.getElementById('new-meaning').value.trim();
  const category = document.getElementById('new-vocab-cat').value;
  const msgEl = document.getElementById('add-vocab-msg');
  if (!hanzi || !pinyin || !meaning) { msgEl.textContent = 'Nhập đủ thông tin.'; msgEl.className = 'msg error'; msgEl.style.display = 'block'; return; }
  await sb.from('vocab').insert({ hanzi, pinyin, meaning, category, created_by: currentUser.id });
  closeModal('modal-add-vocab');
  ['new-hanzi', 'new-pinyin', 'new-meaning'].forEach(id => document.getElementById(id).value = '');
  await loadVocab();
  showToast('✓ Đã thêm từ ' + hanzi);
}

// ── SENTENCES ──
async function loadSentencesT() {
  const { data } = await sb.from('short_sentences').select('*').order('hsk_level').order('id');
  allSentencesT = data || [];
  renderSentencesT(allSentencesT);
}

function renderSentencesT(list) {
  const el = document.getElementById('sentences-list-t');
  if (!list.length) { el.innerHTML = '<div class="empty-state">Chưa có câu nào.</div>'; return; }
  
  // Group by category
  const groups = {};
  list.forEach(s => {
    const cat = s.category || 'Khác';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  });

  el.innerHTML = Object.entries(groups).map(([cat, items]) => `
    <div style="grid-column: 1 / -1; margin-top: 16px; margin-bottom: 8px;">
      <h3 style="font-size:16px; display:flex; align-items:center; gap:8px; color:var(--primary);">
        <span>📁</span> Chủ đề: ${cat} 
        <span style="font-size:12px; color:var(--text3); font-weight:normal;">(${items.length} câu)</span>
      </h3>
    </div>
    ${items.map(s => `
      <div class="card" style="padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div style="font-family:'Noto Serif SC',serif;font-size:20px;color:var(--primary);font-weight:700;">${s.chinese}</div>
          <button class="btn-danger btn-xs" onclick="deleteSentenceT(${s.id})">✕</button>
        </div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:4px;">${s.pinyin}</div>
        <div style="font-size:14px;color:var(--text2);margin-bottom:12px;">${s.meaning}</div>
        <div style="display:flex;gap:6px;">
          ${hskBadge(s.hsk_level)}
          <span class="badge" style="background:var(--primary-bg);color:var(--primary)">${s.category || 'Khác'}</span>
        </div>
      </div>
    `).join('')}
  `).join('');
}

function filterSentencesT() {
  const q = document.getElementById('search-sentences-t').value.toLowerCase();
  const cat = document.getElementById('filter-sent-cat').value;
  renderSentencesT(allSentencesT.filter(s => 
    (!q || s.chinese.includes(q) || s.meaning.toLowerCase().includes(q) || s.pinyin.toLowerCase().includes(q)) &&
    (!cat || s.category === cat)
  ));
}

async function addSentence() {
  const zh = document.getElementById('new-sent-zh').value.trim();
  const py = document.getElementById('new-sent-py').value.trim();
  const vn = document.getElementById('new-sent-vn').value.trim();
  const hsk = parseInt(document.getElementById('new-sent-hsk').value);
  const cat = document.getElementById('new-sent-cat').value;
  
  if (!zh || !py || !vn) return alert('Nhập đầy đủ thông tin');
  
  await sb.from('short_sentences').insert({
    chinese: zh, pinyin: py, meaning: vn, hsk_level: hsk, category: cat
  });
  
  closeModal('modal-add-sentence');
  ['new-sent-zh', 'new-sent-py', 'new-sent-vn'].forEach(id => document.getElementById(id).value = '');
  await loadSentencesT();
  showToast('✓ Đã thêm câu mới');
}

async function deleteSentenceT(id) {
  if (!confirm('Xoá câu này?')) return;
  await sb.from('short_sentences').delete().eq('id', id);
  await loadSentencesT();
  showToast('Đã xoá câu');
}

async function deleteVocab(id) {
  if (!confirm('Xoá từ vựng này?')) return;
  await sb.from('vocab').delete().eq('id', id);
  await loadVocab();
  showToast('Đã xoá từ vựng');
}

async function importVocab() {
  const text = document.getElementById('csv-input').value.trim();
  if (!text) return;
  const lines = text.split('\n');
  const rows = [];
  lines.forEach(line => {
    const parts = line.split(',').map(s => s.trim());
    if (parts.length >= 3) {
      rows.push({ hanzi: parts[0], pinyin: parts[1], meaning: parts[2], created_by: currentUser.id });
    }
  });
  if (!rows.length) return alert('Định dạng không đúng (Hán tự, Pinyin, Nghĩa)');
  
  const btn = document.querySelector('#modal-import-vocab .btn-primary');
  btn.disabled = true; btn.textContent = 'Đang nhập...';
  
  const { error } = await sb.from('vocab').insert(rows);
  btn.disabled = false; btn.textContent = 'Bắt đầu nhập';
  
  if (error) return alert(error.message);
  closeModal('modal-import-vocab');
  document.getElementById('csv-input').value = '';
  await loadVocab();
  showToast(`✓ Đã nhập thành công ${rows.length} từ vựng`);
}

// ══════════════════════════════════════════
//  QUIZZES
// ══════════════════════════════════════════
async function loadQuizzes() {
  const { data: quizzes } = await sb.from('quizzes').select('*').order('created_at', { ascending: false });
  const { data: folders } = await sb.from('quiz_folders').select('*').order('name');
  
  allQuizzes = quizzes || [];
  allQuizFolders = folders || [];

  const { data: results } = await sb.from('quiz_results').select('quiz_id, student_id');
  const submitMap = {};
  (results || []).forEach(r => {
    if (!submitMap[r.quiz_id]) submitMap[r.quiz_id] = new Set();
    submitMap[r.quiz_id].add(r.student_id);
  });
  const { data: assigns } = await sb.from('quiz_assignments').select('quiz_id');
  const assignMap = {};
  (assigns || []).forEach(a => { assignMap[a.quiz_id] = (assignMap[a.quiz_id] || 0) + 1; });

  const el = document.getElementById('quiz-list');
  if (!allQuizzes.length) { el.innerHTML = '<div class="empty-state"><span class="empty-icon">✏️</span>Chưa có quiz nào.</div>'; return; }

  // Group by folder
  const folderMap = {};
  allQuizFolders.forEach(f => folderMap[f.id] = { name: f.name, quizzes: [] });
  folderMap[0] = { name: 'Chưa phân loại', quizzes: [] };

  allQuizzes.forEach(q => {
    const fid = q.folder_id || 0;
    if (folderMap[fid]) folderMap[fid].quizzes.push(q);
    else folderMap[0].quizzes.push(q);
  });

  const sortedFolders = Object.entries(folderMap)
    .filter(([id, data]) => data.quizzes.length > 0 || id != 0)
    .sort((a, b) => {
      if (a[0] == 0) return 1;
      if (b[0] == 0) return -1;
      return a[1].name.localeCompare(b[1].name);
    });

  el.innerHTML = sortedFolders.map(([fid, data]) => `
    <div style="grid-column: 1 / -1; margin-top: 16px; margin-bottom: 8px;">
      <h3 style="font-size:16px; display:flex; align-items:center; gap:8px; color:var(--primary); cursor:pointer; user-select:none; background:var(--surface2); padding:10px; border-radius:var(--r-sm);" onclick="toggleFolder(${fid})">
        <span id="folder-arrow-${fid}" style="transition:transform 0.2s;">▶</span> 📂 ${data.name} 
        <span style="font-size:12px; color:var(--text3); font-weight:normal;">(${data.quizzes.length} bài)</span>
      </h3>
    </div>
    <div id="folder-content-${fid}" style="display:none; grid-column: 1 / -1; width:100%; margin-bottom:20px;">
      <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:16px;">
        ${data.quizzes.map(q => {
      const submitted = submitMap[q.id] ? submitMap[q.id].size : 0;
      const total = assignMap[q.id] || 0;
      const pct = total ? Math.round(submitted / total * 100) : 0;
      const isQuick = q.type === 'quickquiz';
      return `
        <div class="card quiz-row-clickable" onclick="viewQuizResults(${q.id})" style="cursor:pointer">
          <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px;">
            <div class="quiz-card-icon" style="background:${isQuick ? 'var(--gold-bg)' : 'var(--blue-bg)'}">
              ${isQuick ? '⚡' : '📝'}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:14px;margin-bottom:2px;">${q.title}</div>
              <div style="font-size:12px;color:var(--text3);">
                ${(q.vocab_ids || []).length} từ · ${isQuick ? 'Kiểm tra nhanh' : 'Bài tập về nhà'}
              </div>
            </div>
            <span class="badge ${isQuick ? 'badge-new' : 'badge-done'}">${isQuick ? '⚡ Nhanh' : '📝 HW'}</span>
          </div>
          <div style="margin-bottom:6px;display:flex;justify-content:space-between;font-size:12px;color:var(--text3);">
            <span>Đã nộp: <strong style="color:var(--text)">${submitted}/${total}</strong></span>
            <span>${pct}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill${pct >= 80 ? ' ' : pct >= 40 ? ' gold' : ' red'}" style="width:${pct}%"></div>
          </div>
          <div class="card-actions-bottom" style="margin-top:12px; gap:4px;">
            <button class="btn-ghost btn-xs" style="flex:1" onclick="event.stopPropagation();openEditQuiz(${q.id})">✏️ Sửa</button>
            <button class="btn-ghost btn-xs" style="width:32px" onclick="event.stopPropagation();quickMoveQuiz(${q.id})" title="Di chuyển vào thư mục">📁</button>
            <button class="btn-danger btn-xs" style="width:32px" onclick="event.stopPropagation();deleteQuiz(${q.id})">✕</button>
          </div>
        </div>`;
    }).join('')}
      </div>
    </div>
  `).join('');
}

function toggleFolder(fid) {
  const content = document.getElementById(`folder-content-${fid}`);
  const arrow = document.getElementById(`folder-arrow-${fid}`);
  if (!content) return;
  const isHidden = content.style.display === 'none';
  content.style.display = isHidden ? 'grid' : 'none';
  if (arrow) arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
}

// ── QUIZ FOLDERS ──
async function loadQuizFolders() {
  const { data } = await sb.from('quiz_folders').select('*').order('name');
  allQuizFolders = data || [];
  refreshFolderSelects();
  renderFolderList();
}

function refreshFolderSelects() {
  const opts = '<option value="">-- Không có thư mục (Mặc định) --</option>' + 
    allQuizFolders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  
  const createSel = document.getElementById('quiz-folder-id');
  if (createSel) createSel.innerHTML = opts;
  
  const editSel = document.getElementById('edit-quiz-folder-id');
  if (editSel) editSel.innerHTML = opts;
}

function openManageFolders() {
  renderFolderList();
  openModal('modal-manage-folders');
}

function renderFolderList() {
  const body = document.getElementById('folder-list-body');
  if (!allQuizFolders.length) {
    body.innerHTML = '<tr><td style="padding:20px; text-align:center; color:var(--text3);">Chưa có thư mục nào.</td></tr>';
    return;
  }
  body.innerHTML = allQuizFolders.map(f => `
    <tr style="border-bottom:1px solid var(--border);">
      <td style="padding:12px; font-weight:600;">📁 ${f.name}</td>
      <td style="padding:12px; text-align:right;">
        <button class="btn-danger btn-xs" onclick="deleteQuizFolder(${f.id}, '${f.name.replace(/'/g, "\\'")}')">✕</button>
      </td>
    </tr>
  `).join('');
}

async function createQuizFolder() {
  const name = document.getElementById('new-folder-name').value.trim();
  if (!name) return;
  const { error } = await sb.from('quiz_folders').insert({ name, created_by: currentUser.id });
  if (error) return alert(error.message);
  document.getElementById('new-folder-name').value = '';
  await loadQuizFolders();
  await loadQuizzes();
  showToast('✓ Đã tạo thư mục ' + name);
}

async function deleteQuizFolder(id, name) {
  if (!confirm(`Xoá thư mục "${name}"? Các bài quiz trong thư mục này sẽ không bị xoá nhưng sẽ trở thành "Chưa phân loại".`)) return;
  await sb.from('quizzes').update({ folder_id: null }).eq('folder_id', id);
  const { error } = await sb.from('quiz_folders').delete().eq('id', id);
  if (error) return alert(error.message);
  await loadQuizFolders();
  await loadQuizzes();
  showToast('✓ Đã xoá thư mục ' + name);
}

function selectQuizType(btn, type) {
  quizType = type;
  document.querySelectorAll('[data-type]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('duration-field').style.display = type === 'quickquiz' ? 'block' : 'none';
}

function selectAssignTarget(btn, target) {
  assignTarget = target;
  document.querySelectorAll('[data-target]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('assign-class-field').style.display = target === 'class' ? 'block' : 'none';
  document.getElementById('assign-student-field').style.display = target === 'student' ? 'block' : 'none';
}

function openCreateQuiz() {
  editingQuizId = null;
  quizType = 'homework';
  assignTarget = 'class';
  selectedVocabIds.clear();
  selectedClassIds.clear();
  selectedStudentIds.clear();
  document.getElementById('quiz-title').value = '';
  document.getElementById('quiz-duration').value = '';
  document.getElementById('create-quiz-msg').style.display = 'none';
  document.querySelectorAll('#modal-create-quiz [data-type]').forEach(b => b.classList.remove('active'));
  document.querySelector('#modal-create-quiz [data-type="homework"]').classList.add('active');
  document.querySelectorAll('#modal-create-quiz [data-target]').forEach(b => b.classList.remove('active'));
  document.querySelector('#modal-create-quiz [data-target="class"]').classList.add('active');
  document.getElementById('duration-field').style.display = 'none';
  document.getElementById('assign-class-field').style.display = 'block';
  document.getElementById('assign-student-field').style.display = 'none';
  renderVocabPicker();
  renderAssignPickers();
  document.getElementById('create-quiz-msg').style.display = 'none';
  openModal('modal-create-quiz');
}

function openCreateQuizForClass(classId) {
  openCreateQuiz();
  selectedClassIds.add(classId);
  renderAssignPickers();
}

async function openAssignFolderToClass(classId, className) {
  document.getElementById('assign-folder-class-id').value = classId;
  document.getElementById('assign-folder-class-info').textContent = `Lớp: ${className}`;
  
  // 1. Lấy danh sách học sinh trong lớp này
  const { data: members } = await sb.from('class_members').select('student_id').eq('class_id', classId);
  const studentIds = (members || []).map(m => m.student_id);
  
  // 2. Lấy danh sách quiz_id đã được giao cho những học sinh này
  let assignedQuizIds = new Set();
  if (studentIds.length > 0) {
    const { data: currentAssigns } = await sb.from('quiz_assignments')
      .select('quiz_id')
      .in('student_id', studentIds);
    (currentAssigns || []).forEach(a => assignedQuizIds.add(a.quiz_id));
  }

  const el = document.getElementById('folder-picker-for-class');
  if (!allQuizFolders.length) {
    el.innerHTML = '<p class="empty-state">Chưa có thư mục nào. Hãy tạo thư mục ở phần Bài Quiz trước.</p>';
  } else {
    el.innerHTML = allQuizFolders.map(f => {
      // Đếm số bài trong thư mục và số bài đã giao
      const folderQuizzes = allQuizzes.filter(q => q.folder_id === f.id);
      const quizCount = folderQuizzes.length;
      const assignedCount = folderQuizzes.filter(q => assignedQuizIds.has(q.id)).length;
      
      let badge = '';
      let cls = '';
      if (quizCount > 0 && assignedCount === quizCount) {
        badge = '<span class="badge badge-done" style="margin-left:auto; font-size:10px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">✓ Đã giao hết</span>';
        cls = 'assigned-full';
      } else if (assignedCount > 0) {
        badge = `<span class="badge" style="margin-left:auto; font-size:10px; background:var(--gold-bg); color:var(--gold); border:1px solid var(--gold-lt);">Đã giao ${assignedCount}/${quizCount}</span>`;
        cls = 'assigned-partial';
      }

      return `
        <div class="picker-item ${cls}" onclick="selectFolderToAssign(this, ${f.id})">
          <span class="pi-name">📂 ${f.name}</span>
          ${badge}
          <span class="pi-check">✓</span>
        </div>
      `;
    }).join('');
  }
  
  const modalBtn = document.querySelector('#modal-assign-folder-class .modal-actions button.btn-primary, #modal-assign-folder-class .modal-actions button.btn-danger');
  if (modalBtn) {
    modalBtn.textContent = 'Xác nhận giao';
    modalBtn.className = 'btn-primary';
  }

  selectedFolderIdToAssign = null;
  openModal('modal-assign-folder-class');
}

let selectedFolderIdToAssign = null;
function selectFolderToAssign(el, id) {
  document.querySelectorAll('#folder-picker-for-class .picker-item').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
  selectedFolderIdToAssign = id;

  const btn = document.querySelector('#modal-assign-folder-class .modal-actions button:last-child');
  if (el.classList.contains('assigned-full')) {
    btn.textContent = 'Thu hồi giao bài';
    btn.className = 'btn-danger';
  } else {
    btn.textContent = 'Xác nhận giao';
    btn.className = 'btn-primary';
  }
}

async function assignFolderToClass() {
  const classId = parseInt(document.getElementById('assign-folder-class-id').value);
  if (!selectedFolderIdToAssign) return alert('Vui lòng chọn một thư mục');
  
  const btn = document.querySelector('#modal-assign-folder-class .modal-actions button:last-child');
  const isRecall = btn.classList.contains('btn-danger');
  
  btn.disabled = true; 
  const originalText = btn.textContent;
  btn.textContent = 'Đang xử lý...';
  
  try {
    // 1. Get all quizzes in this folder
    const { data: quizzes } = await sb.from('quizzes').select('id').eq('folder_id', selectedFolderIdToAssign);
    if (!quizzes || !quizzes.length) throw new Error('Thư mục này không có bài quiz nào.');
    
    // 2. Get all students in this class
    const { data: members } = await sb.from('class_members').select('student_id').eq('class_id', classId);
    if (!members || !members.length) throw new Error('Lớp này chưa có học sinh nào.');
    
    const quizIds = quizzes.map(q => q.id);
    const studentIds = members.map(m => m.student_id);
    
    if (isRecall) {
      if (!confirm(`Bạn có chắc muốn thu hồi (xoá) lệnh giao ${quizzes.length} bài này cho cả lớp?`)) {
        btn.disabled = false; btn.textContent = originalText;
        return;
      }
      const { error } = await sb.from('quiz_assignments').delete().in('quiz_id', quizIds).in('student_id', studentIds);
      if (error) throw error;
      showToast(`✓ Đã thu hồi ${quizzes.length} bài trong thư mục`);
    } else {
      // 3. Create assignments
      const assignmentRows = [];
      quizIds.forEach(qid => {
        studentIds.forEach(sid => {
          assignmentRows.push({ quiz_id: qid, student_id: sid });
        });
      });
      
      const { error } = await sb.from('quiz_assignments').upsert(assignmentRows, { onConflict: 'quiz_id,student_id' });
      if (error) throw error;
      showToast(`✓ Đã giao ${quizzes.length} bài trong thư mục cho ${studentIds.length} học sinh`);
    }
    
    closeModal('modal-assign-folder-class');
    await loadQuizzes();
    
  } catch (err) {
    alert('Lỗi: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = originalText;
  }
}

function selectEditQuizType(btn, type) {
  quizType = type;
  document.querySelectorAll('[data-edit-type]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('edit-duration-field').style.display = type === 'quickquiz' ? 'block' : 'none';
}

function selectEditAssignTarget(btn, target) {
  assignTarget = target;
  document.querySelectorAll('[data-edit-target]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('edit-assign-class-field').style.display = target === 'class' ? 'block' : 'none';
  document.getElementById('edit-assign-student-field').style.display = target === 'student' ? 'block' : 'none';
}

function renderVocabPicker(filter = '') {
  const el = document.getElementById('vocab-picker-quiz');
  const list = filter ? allVocab.filter(v => v.hanzi.includes(filter) || v.pinyin.toLowerCase().includes(filter) || v.meaning.toLowerCase().includes(filter)) : allVocab;
  el.innerHTML = list.map(v => `
    <div class="picker-item${selectedVocabIds.has(v.id) ? ' selected' : ''}" onclick="toggleVocabPick(this,${v.id})">
      <span style="font-family:'Noto Serif SC',serif;font-size:18px;color:var(--primary);min-width:32px;">${v.hanzi}</span>
      <span class="pi-name">${v.pinyin} — ${v.meaning}</span>
      <span class="pi-check">✓</span>
    </div>`).join('');
}

function toggleVocabPick(el, id) {
  el.classList.toggle('selected');
  if (selectedVocabIds.has(id)) selectedVocabIds.delete(id); else selectedVocabIds.add(id);
  document.getElementById('vocab-pick-count').textContent = selectedVocabIds.size ? `Đã chọn ${selectedVocabIds.size} từ` : 'Chưa chọn từ nào';
}

function filterVocabPicker() {
  renderVocabPicker(document.getElementById('search-vocab-quiz').value.toLowerCase());
}

function renderAssignPickers() {
  const classPicker = document.getElementById('assign-class-picker');
  classPicker.innerHTML = allClasses.map(c => `
    <div class="picker-item" onclick="togglePick(this,'class',${c.id})">
      <span class="pi-name">🏫 ${c.name}</span>
      <span class="pi-check">✓</span>
    </div>`).join('');
  const studentPicker = document.getElementById('assign-student-picker');
  studentPicker.innerHTML = allStudents.map(s => `
    <div class="picker-item" onclick="togglePick(this,'student',${JSON.stringify(s.id)})">
      <div class="stu-avatar" style="background:${avatarColor(s.full_name)};width:26px;height:26px;font-size:10px;">${initials(s.full_name)}</div>
      <span class="pi-name">${s.full_name}</span>
      <span class="pi-check">✓</span>
    </div>`).join('');
}

// Override the ＋ Tạo quiz button to call openCreateQuiz
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('[onclick="openModal(\'modal-create-quiz\')"]');
  if (btn) btn.setAttribute('onclick', 'openCreateQuiz()');
});

async function createQuiz() {
  const title = document.getElementById('quiz-title').value.trim();
  const duration = parseInt(document.getElementById('quiz-duration').value) || null;
  const msgEl = document.getElementById('create-quiz-msg');
  const showErr = t => { msgEl.textContent = t; msgEl.className = 'msg error'; msgEl.style.display = 'block'; };

  if (!title) return showErr('Nhập tiêu đề quiz.');
  if (!selectedVocabIds.size) return showErr('Chọn ít nhất 1 từ vựng.');

  const fid = document.getElementById('quiz-folder-id').value;

  const { data: quiz, error } = await sb.from('quizzes').insert({
    title,
    folder_id: fid ? parseInt(fid) : null,
    vocab_ids: [...selectedVocabIds],
    type: quizType,
    duration_seconds: quizType === 'quickquiz' ? duration : null,
    created_by: currentUser.id
  }).select().single();

  if (error) return showErr(error.message);

  // Get student IDs to assign
  let targetStudents = [];
  if (assignTarget === 'class') {
    const classArr = [...selectedClassIds];
    if (classArr.length) {
      const { data } = await sb.from('class_members').select('student_id').in('class_id', classArr);
      targetStudents = (data || []).map(r => r.student_id);
    }
  } else if (assignTarget === 'group') {
    const groupArr = [...selectedGroupIds];
    if (groupArr.length) {
      const { data } = await sb.from('group_members').select('student_id').in('group_id', groupArr);
      targetStudents = (data || []).map(r => r.student_id);
    }
  } else {
    targetStudents = [...selectedStudentIds];
  }

  if (targetStudents.length) {
    const rows = targetStudents.map(sid => ({ quiz_id: quiz.id, student_id: sid }));
    await sb.from('quiz_assignments').insert(rows);
  }

  closeModal('modal-create-quiz');
  await loadQuizzes();
  showToast(`✓ Đã tạo quiz "${title}" · ${targetStudents.length} học sinh`);
}

async function openEditQuiz(quizId) {
  const quiz = allQuizzes.find(q => q.id === quizId);
  if (!quiz) return;

  editingQuizId = quiz.id;
  quizType = quiz.type || 'homework';
  assignTarget = 'class';
  selectedVocabIds = new Set(quiz.vocab_ids || []);
  selectedClassIds = new Set();
  selectedStudentIds = new Set();

  document.getElementById('edit-quiz-id').value = quiz.id;
  document.getElementById('edit-quiz-folder-id').value = quiz.folder_id || '';
  document.getElementById('edit-quiz-heading').textContent = `Sửa bài quiz: ${quiz.title}`;
  document.getElementById('edit-quiz-title').value = quiz.title || '';
  document.getElementById('edit-quiz-duration').value = quiz.duration_seconds || '';
  document.getElementById('edit-quiz-msg').style.display = 'none';
  document.querySelectorAll('#modal-edit-quiz [data-edit-type]').forEach(b => b.classList.remove('active'));
  const typeBtn = document.querySelector(`#modal-edit-quiz [data-edit-type="${quizType}"]`);
  if (typeBtn) typeBtn.classList.add('active');
  document.getElementById('edit-duration-field').style.display = quizType === 'quickquiz' ? 'block' : 'none';
  document.querySelectorAll('#modal-edit-quiz [data-edit-target]').forEach(b => b.classList.remove('active'));
  document.querySelector('#modal-edit-quiz [data-edit-target="class"]').classList.add('active');
  document.getElementById('edit-assign-class-field').style.display = 'block';
  document.getElementById('edit-assign-student-field').style.display = 'none';

  const { data: assignedRows } = await sb.from('quiz_assignments').select('student_id').eq('quiz_id', quiz.id);
  const studentIds = new Set((assignedRows || []).map(row => row.student_id));
  const inferredClasses = inferClassesFromStudents(studentIds);
  selectedClassIds = inferredClasses;
  selectedStudentIds = studentIds;
  assignTarget = inferredClasses.size ? 'class' : 'student';
  document.querySelectorAll('#modal-edit-quiz [data-edit-target]').forEach(b => b.classList.remove('active'));
  const editTargetBtn = document.querySelector(`#modal-edit-quiz [data-edit-target="${assignTarget}"]`);
  if (editTargetBtn) editTargetBtn.classList.add('active');
  document.getElementById('edit-assign-class-field').style.display = assignTarget === 'class' ? 'block' : 'none';
  document.getElementById('edit-assign-student-field').style.display = assignTarget === 'student' ? 'block' : 'none';

  renderEditVocabPicker();
  renderEditAssignPickers();
  openModal('modal-edit-quiz');
}

function inferClassesFromStudents(studentIds) {
  const target = new Set(studentIds);
  if (!target.size) return new Set();

  const classEntries = allClasses
    .map(c => ({ id: c.id, members: new Set((c.class_members || []).map(m => m.student_id)) }))
    .filter(c => c.members.size > 0);

  let best = null;

  function backtrack(index, chosen, unionSet) {
    if (unionSet.size > target.size) return;
    let matches = unionSet.size === target.size;
    if (matches) {
      for (const id of target) {
        if (!unionSet.has(id)) { matches = false; break; }
      }
    }
    if (matches) {
      if (!best || chosen.length < best.length) best = [...chosen];
      return;
    }
    if (index >= classEntries.length) return;
    if (best && chosen.length >= best.length) return;

    for (let i = index; i < classEntries.length; i++) {
      const entry = classEntries[i];
      const nextUnion = new Set(unionSet);
      entry.members.forEach(id => nextUnion.add(id));
      chosen.push(entry.id);
      backtrack(i + 1, chosen, nextUnion);
      chosen.pop();
    }
  }

  backtrack(0, [], new Set());
  return new Set(best || []);
}

function renderEditVocabPicker(filter = '') {
  const el = document.getElementById('edit-vocab-picker-quiz');
  const list = filter ? allVocab.filter(v => v.hanzi.includes(filter) || v.pinyin.toLowerCase().includes(filter) || v.meaning.toLowerCase().includes(filter)) : allVocab;
  el.innerHTML = list.map(v => `
    <div class="picker-item${selectedVocabIds.has(v.id) ? ' selected' : ''}" onclick="toggleEditVocabPick(this,${v.id})">
      <span style="font-family:'Noto Serif SC',serif;font-size:18px;color:var(--primary);min-width:32px;">${v.hanzi}</span>
      <span class="pi-name">${v.pinyin} — ${v.meaning}</span>
      <span class="pi-check">✓</span>
    </div>`).join('');
  document.getElementById('edit-vocab-pick-count').textContent = selectedVocabIds.size ? `Đã chọn ${selectedVocabIds.size} từ` : 'Chưa chọn từ nào';
}

function toggleEditVocabPick(el, id) {
  el.classList.toggle('selected');
  if (selectedVocabIds.has(id)) selectedVocabIds.delete(id); else selectedVocabIds.add(id);
  document.getElementById('edit-vocab-pick-count').textContent = selectedVocabIds.size ? `Đã chọn ${selectedVocabIds.size} từ` : 'Chưa chọn từ nào';
}

function filterEditVocabPicker() {
  renderEditVocabPicker(document.getElementById('edit-search-vocab-quiz').value.toLowerCase());
}

function renderEditAssignPickers() {
  const classPicker = document.getElementById('edit-assign-class-picker');
  classPicker.innerHTML = allClasses.map(c => `
    <div class="picker-item${selectedClassIds.has(c.id) ? ' selected' : ''}" onclick="togglePick(this,'class',${c.id})">
      <span class="pi-name">🏫 ${c.name}</span>
      <span class="pi-check">✓</span>
    </div>`).join('');
  const studentPicker = document.getElementById('edit-assign-student-picker');
  studentPicker.innerHTML = allStudents.map(s => `
    <div class="picker-item${selectedStudentIds.has(s.id) ? ' selected' : ''}" onclick="togglePick(this,'student',${JSON.stringify(s.id)})">
      <div class="stu-avatar" style="background:${avatarColor(s.full_name)};width:26px;height:26px;font-size:10px;">${initials(s.full_name)}</div>
      <span class="pi-name">${s.full_name}</span>
      <span class="pi-check">✓</span>
    </div>`).join('');
}

async function updateQuiz() {
  const id = parseInt(document.getElementById('edit-quiz-id').value);
  const title = document.getElementById('edit-quiz-title').value.trim();
  const duration = parseInt(document.getElementById('edit-quiz-duration').value) || null;
  const msgEl = document.getElementById('edit-quiz-msg');
  const showErr = t => { msgEl.textContent = t; msgEl.className = 'msg error'; msgEl.style.display = 'block'; };

  if (!title) return showErr('Nhập tiêu đề quiz.');
  if (!selectedVocabIds.size) return showErr('Chọn ít nhất 1 từ vựng.');

  const fid = document.getElementById('edit-quiz-folder-id').value;

  const { error } = await sb.from('quizzes').update({
    title,
    folder_id: fid ? parseInt(fid) : null,
    vocab_ids: [...selectedVocabIds],
    type: quizType,
    duration_seconds: quizType === 'quickquiz' ? duration : null,
  }).eq('id', id);
  if (error) return showErr(error.message);

  let targetStudents = [];
  if (assignTarget === 'class') {
    const classArr = [...selectedClassIds];
    if (classArr.length) {
      const { data } = await sb.from('class_members').select('student_id').in('class_id', classArr);
      targetStudents = (data || []).map(r => r.student_id);
    }
  } else {
    targetStudents = [...selectedStudentIds];
  }

  await sb.from('quiz_assignments').delete().eq('quiz_id', id);
  if (targetStudents.length) {
    const rows = targetStudents.map(sid => ({ quiz_id: id, student_id: sid }));
    await sb.from('quiz_assignments').insert(rows);
  }

  closeModal('modal-edit-quiz');
  await loadQuizzes();
  showToast(`✓ Đã cập nhật quiz "${title}"`);
}

async function deleteQuiz(id) {
  const quiz = allQuizzes.find(q => q.id === id);
  const title = quiz?.title || 'quiz này';
  if (!confirm(`Bạn có chắc muốn xoá "${title}"? Thao tác này sẽ xoá luôn kết quả và lượt giao.`)) return;
  await sb.from('quiz_assignments').delete().eq('quiz_id', id);
  await sb.from('quiz_results').delete().eq('quiz_id', id);
  const { error } = await sb.from('quizzes').delete().eq('id', id);
  if (error) return alert('Lỗi: ' + error.message);
  showToast(`✓ Đã xoá quiz "${title}"`);
  await loadQuizzes();
}

async function quickMoveQuiz(quizId) {
  const quiz = allQuizzes.find(q => q.id === quizId);
  if (!quiz) return;
  
  const folderNames = allQuizFolders.length > 0 
    ? allQuizFolders.map(f => `ID ${f.id}: ${f.name}`).join('\n')
    : "Chưa có thư mục nào. Hãy tạo thư mục trước.";
    
  const input = prompt(`Di chuyển bài "${quiz.title}" vào thư mục:\n\nNhập ID thư mục (để trống để bỏ phân loại):\n${folderNames}\n\nVí dụ: Nhập 1`, quiz.folder_id || '');
  
  if (input === null) return;
  const newFolderId = input.trim() === '' ? null : parseInt(input);
  
  const { error } = await sb.from('quizzes').update({ folder_id: newFolderId }).eq('id', quizId);
  if (error) return alert(error.message);
  
  await loadQuizzes();
  showToast('✓ Đã di chuyển bài quiz');
}

// ══════════════════════════════════════════
//  RESULTS
// ══════════════════════════════════════════
async function loadResults() {
  const { data } = await sb
    .from('quiz_results')
    .select('*, profiles!quiz_results_student_id_fkey(full_name), quizzes(title)')
    .order('completed_at', { ascending: false })
    .limit(100);
  const el = document.getElementById('results-list');
  if (!el) return;
  if (!data || !data.length) { el.innerHTML = '<tr><td colspan="5" class="empty-state">Chưa có kết quả nào.</td></tr>'; return; }
  el.innerHTML = data.map(r => {
    const pct = Math.round(r.score / r.total * 100);
    const cls = pct >= 80 ? 'score-good' : pct >= 50 ? 'score-mid' : 'score-bad';
    return `
      <tr>
        <td>${r.profiles?.full_name || '—'}</td>
        <td>${r.quizzes?.title || '—'}</td>
        <td class="${cls}">${r.score}/${r.total}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="progress-track" style="width:70px;flex-shrink:0;">
              <div class="progress-fill${pct >= 80 ? ' ' : pct >= 50 ? ' gold' : ' red'}" style="width:${pct}%"></div>
            </div>
            <span class="${cls}" style="font-size:13px;font-weight:700;">${pct}%</span>
          </div>
        </td>
        <td style="font-size:12px;color:var(--text3);">
          ${fmtTime(r.time_spent)}<br>
          <span style="font-size:10px;">${fmtDate(r.completed_at)}</span>
        </td>
      </tr>`;
  }).join('');

  // ── Top Difficult Quizzes Analysis ──
  const diffEl = document.getElementById('difficult-quizzes-list');
  if (!diffEl) return;
  
  const quizStats = {};
  data.forEach(r => {
    const qid = r.quiz_id;
    if (!quizStats[qid]) quizStats[qid] = { title: r.quizzes?.title, qid, sumPct: 0, count: 0 };
    quizStats[qid].sumPct += (r.score / r.total * 100);
    quizStats[qid].count++;
  });

  const sorted = Object.values(quizStats)
    .map(q => ({ ...q, avg: Math.round(q.sumPct / q.count) }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 4);

  if (!sorted.length) { diffEl.innerHTML = ''; return; }

  diffEl.innerHTML = sorted.map(q => `
    <div class="card card-glass">
      <div style="font-weight:700;font-size:14px;margin-bottom:8px;">${q.title}</div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
        <span style="color:var(--text3)">Tỷ lệ đúng trung bình</span>
        <span style="font-weight:700;color:var(--primary)">${q.avg}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill red" style="width:${q.avg}%"></div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px;">
        Dựa trên ${q.count} lượt làm bài
      </div>
    </div>`).join('');
}

// ── ANNOUNCEMENTS ──
async function loadAnnouncements() {
  const { data } = await sb.from('announcements').select('*, classes(name)').order('created_at', { ascending: false });
  const el = document.getElementById('announcement-list');
  if (!data?.length) { el.innerHTML = '<p class="empty-state">Chưa có thông báo nào</p>'; return; }
  el.innerHTML = data.map(a => `
    <div class="quiz-card">
      <div class="quiz-card-icon" style="background:var(--purple-bg);color:var(--purple)">📢</div>
      <div class="card-info">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4 style="margin:0">${a.title}</h4>
          <div style="display:flex;gap:6px;align-items:center;">
            ${a.classes ? `<span class="badge" style="background:var(--blue-bg);color:var(--blue);font-size:10px;">Lớp: ${a.classes.name}</span>` : '<span class="badge" style="background:var(--green-bg);color:var(--green);font-size:10px;">Toàn trường</span>'}
            <button class="btn-ghost btn-xs" onclick="openEditAnnouncement(${a.id})" title="Sửa">✏️</button>
            <button class="btn-danger btn-xs" onclick="deleteAnnouncement(${a.id}, '${a.title}')" title="Xoá">✕</button>
          </div>
        </div>
        <p style="margin-top:6px">${a.content.substring(0, 100)}${a.content.length > 100 ? '...' : ''}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:var(--text3); margin-top:8px; border-top:1px solid var(--border); padding-top:6px;">
          <span>Đăng: ${fmtDate(a.created_at)}</span>
          ${a.expires_at ? `
            <span style="color:${new Date(a.expires_at) < new Date() ? 'var(--primary)' : 'var(--accent)'}; font-weight:600;">
              ⌛ Hết hạn: ${new Date(a.expires_at).toLocaleString('vi-VN')}
            </span>
          ` : '<span>⌛ Không hết hạn</span>'}
        </div>
      </div>
    </div>`).join('');
}

async function deleteAnnouncement(id, title) {
  if (!confirm(`Bạn có chắc muốn xoá thông báo "${title}"?`)) return;
  const { error } = await sb.from('announcements').delete().eq('id', id);
  if (error) return alert('Lỗi: ' + error.message);
  showToast('✓ Đã xoá thông báo');
  await loadAnnouncements();
}

async function openEditAnnouncement(id) {
  const { data: a } = await sb.from('announcements').select('*').eq('id', id).single();
  if (!a) return;
  
  document.getElementById('edit-ann-id').value = a.id;
  document.getElementById('edit-ann-title').value = a.title;
  document.getElementById('edit-ann-content').value = a.content;
  document.getElementById('edit-ann-expires-at').value = a.expires_at ? a.expires_at.slice(0, 10) : '';
  
  const sel = document.getElementById('edit-ann-class-id');
  sel.innerHTML = '<option value="">Toàn trường (Tất cả học sinh)</option>' + 
    allClasses.map(c => `<option value="${c.id}" ${c.id === a.class_id ? 'selected' : ''}>${c.name}</option>`).join('');
    
  openModal('modal-edit-announcement');
}

async function updateAnnouncement() {
  const id = document.getElementById('edit-ann-id').value;
  const title = document.getElementById('edit-ann-title').value.trim();
  const content = document.getElementById('edit-ann-content').value.trim();
  const classId = document.getElementById('edit-ann-class-id').value;
  const expiresAt = document.getElementById('edit-ann-expires-at').value;
  if (!title || !content) return alert('Nhập tiêu đề và nội dung');
  
  const row = { 
    title, 
    content, 
    class_id: classId ? parseInt(classId) : null,
    expires_at: expiresAt || null
  };
  const { error } = await sb.from('announcements').update(row).eq('id', id);
  if (error) return alert('Lỗi: ' + error.message);
  
  closeModal('modal-edit-announcement');
  await loadAnnouncements();
  showToast('✓ Đã cập nhật thông báo');
}

function openCreateAnnouncement() {
  document.getElementById('ann-title').value = '';
  document.getElementById('ann-content').value = '';
  document.getElementById('ann-expires-at').value = '';
  const sel = document.getElementById('ann-class-id');
  sel.innerHTML = '<option value="">Toàn trường (Tất cả học sinh)</option>' + 
    allClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  openModal('modal-create-announcement');
}

async function createAnnouncement() {
  const title = document.getElementById('ann-title').value.trim();
  const content = document.getElementById('ann-content').value.trim();
  const classId = document.getElementById('ann-class-id').value;
  const expiresAt = document.getElementById('ann-expires-at').value;
  if (!title || !content) return alert('Vui lòng nhập đầy đủ tiêu đề và nội dung');
  
  const row = { 
    title, 
    content, 
    created_by: currentUser.id,
    expires_at: expiresAt || null
  };
  if (classId) row.class_id = parseInt(classId);

  const { error } = await sb.from('announcements').insert(row);
  if (error) { alert('Lỗi: ' + error.message); return; }

  closeModal('modal-create-announcement');
  document.getElementById('ann-title').value = '';
  document.getElementById('ann-content').value = '';
  await loadAnnouncements();
  showToast('✓ Đã gửi thông báo');
}

// ── FEEDBACK ──
async function loadFeedback() {
  const { data, error } = await sb.from('student_feedback').select('*, profiles(full_name)').order('created_at', { ascending: false });
  const el = document.getElementById('feedback-list');
  if (!el) return;
  if (!data?.length) { el.innerHTML = '<tr><td colspan="4" class="empty-state">Chưa có góp ý nào</td></tr>'; return; }
  
  el.innerHTML = data.map(f => `
    <tr>
      <td>
        <div style="font-weight:600;">${f.profiles?.full_name || 'Học sinh ẩn danh'}</div>
        <div style="font-size:10px; color:var(--text3);">🕒 ${new Date(f.created_at).toLocaleString('vi-VN')}</div>
      </td>
      <td><div style="max-width:400px; white-space:pre-wrap; font-size:14px;">${f.content}</div></td>
      <td>
        <button class="btn-danger btn-xs" onclick="deleteFeedback(${f.id})">Xoá</button>
      </td>
    </tr>
  `).join('');
}

async function deleteFeedback(id) {
  if (!confirm('Bạn có chắc muốn xoá góp ý này?')) return;
  const { error } = await sb.from('student_feedback').delete().eq('id', id);
  if (error) return alert(error.message);
  loadFeedback();
  showToast('✓ Đã xoá góp ý');
}

// ══════════════════════════════════════════
//  HSK LEVEL APPROVAL
// ══════════════════════════════════════════
async function loadHskBadge() {
  const { data } = await sb.from('hsk_level_requests').select('id').eq('status', 'pending');
  const count = (data || []).length;
  const badge = document.getElementById('hsk-badge');
  if (count > 0) { badge.textContent = count; badge.style.display = 'flex'; }
  else badge.style.display = 'none';
}

async function loadHskRequests() {
  const el = document.getElementById('hsk-approve-list');
  el.innerHTML = '<p class="loading">Đang tải...</p>';
  const { data } = await sb
    .from('hsk_level_requests')
    .select('*, profiles!hsk_level_requests_student_id_fkey(full_name, username)')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });

  if (!data || !data.length) {
    el.innerHTML = '<div class="empty-state"><span class="empty-icon">🎉</span>Không có yêu cầu nào đang chờ duyệt.</div>';
    return;
  }

  el.innerHTML = data.map(r => {
    const name = r.profiles?.full_name || 'Học sinh';
    const time = fmtDate(r.requested_at);
    const color = avatarColor(name);
    const ini = initials(name);
    return `
      <div class="approve-card" id="hsk-req-${r.id}">
        <div class="approve-avatar" style="background:${color}">${ini}</div>
        <div class="card-info">
          <h4>${name}</h4>
          <p>Yêu cầu lên <strong>HSK ${r.to_level}</strong> (từ HSK ${r.from_level}) · Đạt ${r.score_pct}% · ${time}</p>
        </div>
        <div class="card-actions">
          <button class="btn-primary btn-sm btn-green" onclick="approveHsk(${r.id})">✓ Duyệt</button>
          <button class="btn-danger btn-sm" onclick="rejectHsk(${r.id})">✕ Từ chối</button>
        </div>
      </div>`;
  }).join('');
}

async function approveHsk(requestId) {
  const btn = document.querySelector(`#hsk-req-${requestId} .btn-green`);
  if (btn) { btn.disabled = true; btn.textContent = 'Đang duyệt...'; }
  const { error } = await sb.rpc('approve_hsk_request', { p_request_id: requestId });
  if (error) { alert('Lỗi: ' + error.message); if (btn) { btn.disabled = false; btn.textContent = '✓ Duyệt'; } return; }
  
  // Extend account expiry by 3 months on approval
  const { data: req } = await sb.from('hsk_level_requests').select('student_id').eq('id', requestId).single();
  if (req) {
    const { data: p } = await sb.from('profiles').select('expiry_date').eq('id', req.student_id).single();
    let newExp = new Date(p ? (p.expiry_date || new Date()) : new Date());
    newExp.setMonth(newExp.getMonth() + 3);
    await sb.from('profiles').update({ expiry_date: newExp }).eq('id', req.student_id);
  }

  showToast('✅ Đã duyệt yêu cầu và cộng thêm 3 tháng hạn dùng!');
  await loadHskRequests();
  await loadHskBadge();
}

async function rejectHsk(requestId) {
  if (!confirm('Từ chối yêu cầu này?')) return;
  await sb.rpc('reject_hsk_request', { p_request_id: requestId });
  showToast('Đã từ chối yêu cầu.');
  await loadHskRequests();
  await loadHskBadge();
}
async function viewQuizResults(quizId) {
  const quiz = allQuizzes.find(q => q.id === quizId);
  if (!quiz) return;
  
  document.getElementById('qr-modal-title').textContent = quiz.title;
  document.getElementById('qr-modal-subtitle').textContent = quiz.type === 'quickquiz' ? 'Kiểm tra nhanh' : 'Bài tập về nhà';
  
  const body = document.getElementById('qr-modal-body');
  body.innerHTML = '<tr><td colspan="4" class="loading">Đang tải...</td></tr>';
  openModal('modal-quiz-results');
  
  // 1. Get all assigned students
  const { data: assignments } = await sb.from('quiz_assignments').select('student_id, profiles(full_name)').eq('quiz_id', quizId);
  // 2. Get all results for this quiz, sorted by time
  const { data: results } = await sb.from('quiz_results').select('*').eq('quiz_id', quizId).order('completed_at', { ascending: false });
  
  if (!assignments?.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty-state">Chưa giao cho học sinh nào.</td></tr>';
    return;
  }
  
  // Group results by student
  const resultsByStudent = {};
  (results || []).forEach(r => {
    if (!resultsByStudent[r.student_id]) resultsByStudent[r.student_id] = [];
    resultsByStudent[r.student_id].push(r);
  });
  
  const rows = [];
  // Sort assignments by name
  assignments.sort((a, b) => (a.profiles?.full_name || '').localeCompare(b.profiles?.full_name || ''));

  assignments.forEach(a => {
    const studentResults = resultsByStudent[a.student_id] || [];
    if (studentResults.length === 0) {
      rows.push(`
        <tr>
          <td><div style="font-weight:600;">${a.profiles?.full_name || 'N/A'}</div></td>
          <td><span class="badge" style="background:var(--surface2);color:var(--text3)">⏳ Chưa làm</span></td>
          <td style="font-weight:700;color:var(--text3)">—</td>
          <td style="font-size:12px;color:var(--text3)">—</td>
        </tr>`);
    } else {
      // Find best result: Highest score primary, lowest time secondary
      const sortedByScore = [...studentResults].sort((x, y) => {
        const scoreX = x.score / x.total;
        const scoreY = y.score / y.total;
        if (scoreX !== scoreY) return scoreY - scoreX;
        return (x.time_spent || 999999) - (y.time_spent || 999999);
      });
      const best = sortedByScore[0];
      const hasHistory = studentResults.length > 1;
      
      const pct = Math.round(best.score / best.total * 100);
      const scoreColor = pct >= 80 ? 'var(--accent)' : pct >= 50 ? 'var(--gold)' : 'var(--primary)';
      
      rows.push(`
        <tr onclick="${hasHistory ? `toggleHistory('${a.student_id}')` : ''}" style="${hasHistory ? 'cursor:pointer' : ''}" title="${hasHistory ? 'Bấm để xem lịch sử làm bài' : ''}">
          <td>
            <div style="font-weight:600; display:flex; align-items:center; gap:6px;">
              ${a.profiles?.full_name || 'N/A'} 
              ${hasHistory ? `<span style="font-size:10px; color:var(--accent); background:var(--accent-bg); padding:1px 4px; border-radius:4px;">+${studentResults.length - 1} lượt</span>` : ''}
            </div>
          </td>
          <td><span class="badge badge-done" style="background:var(--accent-bg);color:var(--accent)">✓ Đã nộp</span></td>
          <td style="font-weight:700;color:${scoreColor}">${best.score}/${best.total} <span style="font-size:10px; font-weight:400; color:var(--text3)">(Cao nhất · ${fmtTime(best.time_spent)})</span></td>
          <td style="font-size:12px;color:var(--text3)">${fmtDate(best.completed_at)}</td>
        </tr>`);
        
      if (hasHistory) {
        rows.push(`
          <tr id="history-${a.student_id}" style="display:none; background:var(--surface2);">
            <td colspan="4" style="padding:0;">
              <div style="padding:10px 15px; border-left:3px solid var(--accent);">
                <div style="font-size:11px; font-weight:700; color:var(--text2); margin-bottom:6px; text-transform:uppercase;">Lịch sử làm bài:</div>
                ${(() => {
                  let displayed = studentResults;
                  if (studentResults.length > 4) {
                    const first = studentResults[studentResults.length - 1];
                    const latest3 = studentResults.slice(0, 3);
                    displayed = [...latest3];
                    if (!latest3.find(r => r.id === first.id)) displayed.push(first);
                  }
                  
                  return displayed.map((res, idx) => {
                    const rPct = Math.round(res.score / res.total * 100);
                    const isFirst = idx === displayed.length - 1 && studentResults.length > 3;
                    const isBest = res.id === best.id;
                    return `
                      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:6px 0; border-bottom:1px solid var(--border);">
                        <span style="color:var(--text3)">${isFirst ? '🏁 Lần đầu' : 'Lần ' + (studentResults.length - studentResults.indexOf(res))}</span>
                        <span style="font-weight:600; color:${rPct >= 80 ? 'var(--accent)' : rPct >= 50 ? 'var(--gold)' : 'var(--primary)'}">${res.score}/${res.total} (${fmtTime(res.time_spent)}) ${isBest ? '⭐' : ''}</span>
                        <span style="color:var(--text3); font-size:11px;">${fmtDate(res.completed_at)}</span>
                      </div>`;
                  }).join('');
                })()}
              </div>
            </td>
          </tr>`);
      }
    }
  });
  
  body.innerHTML = rows.join('');
}

function toggleHistory(sid) {
  const el = document.getElementById(`history-${sid}`);
  if (el) el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
}

// ══════════════════════════════════════════
//  TEACHER LEADERBOARD
// ══════════════════════════════════════════
let currentTeacherLeaderboardMode = 'xp';
let currentTeacherPracticeType = 'all';

function switchTeacherLeaderboard(btn, mode) {
  currentTeacherLeaderboardMode = mode;
  document.querySelectorAll('#panel-results .mode-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadTeacherLeaderboard();
}

function switchTeacherPracticeType(type) {
  currentTeacherPracticeType = type;
  document.querySelectorAll('.practice-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  loadTeacherLeaderboard();
}

async function loadTeacherLeaderboard() {
  const listEl = document.getElementById('teacher-leaderboard-list');
  const levelFilter = document.getElementById('filter-leaderboard-level').value;
  
  if (!listEl) return;
  listEl.innerHTML = '<p class="loading">Đang tải dữ liệu xếp hạng...</p>';
  
  if (document.getElementById('filter-leaderboard-level')) {
    document.getElementById('filter-leaderboard-level').style.display = currentTeacherLeaderboardMode === 'weekly_practice' ? 'none' : 'block';
  }

  try {
    // 1. Get student level mappings
    const { data: levels } = await sb.from('hsk_student_levels').select('student_id, hsk_level');
    const levelMap = {};
    (levels || []).forEach(lp => levelMap[lp.student_id] = lp.hsk_level);
    
    // 2. Get quiz results
    const { data: allResults, error } = await sb.from('quiz_results').select('*');
    if (error) throw error;

    // 3. Get student profiles
    const { data: allProfiles } = await sb.from('profiles').select('id, full_name').eq('role', 'student');
    const profileMap = {};
    (allProfiles || []).forEach(p => profileMap[p.id] = p.full_name);

    let ranking = [];

    allProfiles.forEach(p => {
      const sid = p.id;
      const sLevel = levelMap[sid] || 1;
      
      // Filter by level if requested
      if (levelFilter !== 'all' && String(sLevel) !== String(levelFilter)) return;

      const studentResults = allResults.filter(r => r.student_id === sid);
      if (studentResults.length === 0 && currentTeacherLeaderboardMode !== 'mastery') return;

      if (currentTeacherLeaderboardMode === 'xp') {
        const xp = studentResults.reduce((sum, r) => sum + (r.score || 0), 0);
        if (xp > 0) ranking.push({ id: sid, name: p.full_name, value: xp, unit: 'XP', level: sLevel });
      } 
      else if (currentTeacherLeaderboardMode === 'accuracy') {
        const valid = studentResults.filter(r => r.total > 0);
        if (valid.length >= 1) {
          const avg = Math.round(valid.reduce((sum, r) => sum + (r.score / r.total * 100), 0) / valid.length);
          ranking.push({ id: sid, name: p.full_name, value: avg, unit: '%', level: sLevel });
        }
      }
      else if (currentTeacherLeaderboardMode === 'mastery') {
        const masterCount = new Set(studentResults.filter(r => (r.score / r.total) >= 0.8).map(r => r.quiz_id)).size;
        ranking.push({ id: sid, name: p.full_name, value: masterCount, unit: 'bài', level: sLevel });
      }
      else if (currentTeacherLeaderboardMode === 'streak') {
        const dates = new Set(studentResults.map(r => new Date(r.completed_at).toLocaleDateString('en-CA')));
        let streak = 0;
        let checkDate = new Date();
        for (let i = 0; i < 100; i++) {
          const ds = checkDate.toLocaleDateString('en-CA');
          if (dates.has(ds)) { streak++; checkDate.setDate(checkDate.getDate() - 1); }
          else { if (i === 0) { checkDate.setDate(checkDate.getDate() - 1); continue; } break; }
        }
        if (streak > 0) ranking.push({ id: sid, name: p.full_name, value: streak, unit: 'ngày', level: sLevel });
      }
      else if (currentTeacherLeaderboardMode === 'speed') {
        const valid = studentResults.filter(r => r.time_spent > 0 && r.total > 0);
        if (valid.length >= 1) {
          const avg = parseFloat((valid.reduce((sum, r) => sum + (r.time_spent / r.total), 0) / valid.length).toFixed(1));
          ranking.push({ id: sid, name: p.full_name, value: avg, unit: 's/câu', level: sLevel });
        }
      }
    });

    if (currentTeacherLeaderboardMode === 'weekly_practice') {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      // Filter and decode
      let weeklyResults = allResults.filter(r => new Date(r.completed_at) >= weekAgo);
      if (currentTeacherPracticeType !== 'all') {
        const offsetMap = { vocab: 1000000, sentence: 2000000, practice: 3000000 };
        const min = offsetMap[currentTeacherPracticeType];
        const max = min + 1000000;
        weeklyResults = weeklyResults.filter(r => r.time_spent >= min && r.time_spent < max);
      }
      
      const normalized = weeklyResults.map(r => ({ ...r, time_spent: r.time_spent % 1000000 }));
      
      // 1. Quantity
      const countMap = {};
      normalized.forEach(r => countMap[r.student_id] = (countMap[r.student_id] || 0) + 1);
      const topCount = Object.keys(countMap).map(sid => ({
        id: sid, name: profileMap[sid] || 'Học sinh', value: countMap[sid], unit: 'lần', level: levelMap[sid]
      })).sort((a, b) => b.value - a.value).slice(0, 5);

      // 2. Accuracy
      const accMap = {};
      normalized.forEach(r => {
        if (r.total > 0) {
          if (!accMap[r.student_id]) accMap[r.student_id] = { sum: 0, count: 0 };
          accMap[r.student_id].sum += (r.score / r.total * 100);
          accMap[r.student_id].count++;
        }
      });
      const topAcc = Object.keys(accMap).map(sid => ({
        id: sid, name: profileMap[sid] || 'Học sinh', value: Math.round(accMap[sid].sum / accMap[sid].count), unit: '%', level: levelMap[sid]
      })).sort((a, b) => b.value - a.value).slice(0, 5);

      // 3. Speed
      const speedMap = {};
      normalized.forEach(r => {
        if (r.time_spent > 0 && r.total > 0) {
          if (!speedMap[r.student_id]) speedMap[r.student_id] = { sum: 0, count: 0 };
          speedMap[r.student_id].sum += (r.time_spent / r.total);
          speedMap[r.student_id].count++;
        }
      });
      const topSpeed = Object.keys(speedMap).map(sid => ({
        id: sid, name: profileMap[sid] || 'Học sinh', value: parseFloat((speedMap[sid].sum / speedMap[sid].count).toFixed(1)), unit: 's/câu', level: levelMap[sid]
      })).sort((a, b) => a.value - b.value).slice(0, 5);

      const renderMini = (title, data, icon, unit) => `
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--r); padding:16px;">
          <h4 style="margin-bottom:12px; display:flex; align-items:center; gap:8px; font-size:14px; color:var(--primary);">
            <span>${icon}</span> ${title}
          </h4>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${data.length === 0 ? '<div class="empty-state" style="padding:10px; font-size:12px;">Chưa có dữ liệu</div>' : data.map((item, i) => `
              <div style="display:flex; align-items:center; gap:10px; padding:6px; border-radius:var(--r-sm);">
                <span style="font-weight:700; width:20px; font-size:12px; color:var(--text3);">${i+1}</span>
                <div class="stu-avatar" style="background:${avatarColor(item.name)}; width:24px; height:24px; font-size:10px;">${initials(item.name)}</div>
                <div style="flex:1; min-width:0;">
                  <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</div>
                  <div style="font-size:9px; color:var(--text3);">HSK ${item.level || 1}</div>
                </div>
                <span style="font-size:12px; font-weight:700; color:var(--primary);">${item.value}<small style="font-weight:400; color:var(--text3); margin-left:2px;">${unit}</small></span>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      listEl.innerHTML = `
        <div class="practice-type-tabs" style="display:flex; gap:8px; margin-bottom:15px; background:var(--surface2); padding:4px; border-radius:8px; max-width:600px;">
          <button class="practice-type-btn ${currentTeacherPracticeType==='all'?'active':''}" data-type="all" onclick="switchTeacherPracticeType('all')">Tất cả</button>
          <button class="practice-type-btn ${currentTeacherPracticeType==='vocab'?'active':''}" data-type="vocab" onclick="switchTeacherPracticeType('vocab')">Trắc nghiệm từ</button>
          <button class="practice-type-btn ${currentTeacherPracticeType==='sentence'?'active':''}" data-type="sentence" onclick="switchTeacherPracticeType('sentence')">Luyện câu</button>
          <button class="practice-type-btn ${currentTeacherPracticeType==='practice'?'active':''}" data-type="practice" onclick="switchTeacherPracticeType('practice')">Tự luyện từ</button>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:16px; margin-top:10px;">
          ${renderMini('Chăm chỉ nhất', topCount, '🔥', 'lần')}
          ${renderMini('Chính xác nhất', topAcc, '🎯', '%')}
          ${renderMini('Phản xạ nhanh', topSpeed, '⚡', 's/c')}
        </div>
      `;
      return;
    }

    // Sort
    if (currentTeacherLeaderboardMode === 'speed') {
      ranking.sort((a, b) => a.value - b.value);
    } else {
      ranking.sort((a, b) => b.value - a.value);
    }

    const topList = ranking.slice(0, 20); // Teachers see top 20
    if (topList.length === 0) {
      listEl.innerHTML = '<div class="empty-state">Không có dữ liệu cho mục này.</div>';
      return;
    }

    listEl.innerHTML = `
      <div class="leaderboard-container">
        ${topList.map((item, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : (index + 1);
          const color = avatarColor(item.name);
          return `
            <div class="leaderboard-item">
              <div class="rank-num">${medal}</div>
              <div class="stu-avatar" style="background:${color}; width:36px; height:36px; font-size:13px;">${initials(item.name)}</div>
              <div class="stu-name-wrap">
                <div class="stu-name">${item.name}</div>
                <div class="stu-level-tag">HSK ${item.level}</div>
              </div>
              <div class="rank-value">
                <strong>${item.value}</strong>
                <span>${item.unit}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

  } catch (err) {
    console.error("Teacher Leaderboard error:", err);
    listEl.innerHTML = '<div class="empty-state">Lỗi tải dữ liệu.</div>';
  }
}

function toggleHistory(sid) {
  const el = document.getElementById(`history-${sid}`);
  if (!el) return;
  const isHidden = el.style.display === 'none';
  el.style.display = isHidden ? 'table-row' : 'none';
}
