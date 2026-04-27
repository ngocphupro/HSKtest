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
let allSentencesT = [];
let selectedVocabIds = new Set();
let selectedStudentIds = new Set();
let selectedClassIds = new Set();
let selectedGroupIds = new Set();
let quizType = 'homework';
let assignTarget = 'class';
let studentLevels = {}; // { student_id: hsk_level }

const AVATAR_COLORS = ['#C84B31', '#3D6B4F', '#2A5FA5', '#6B3FA0', '#C08830', '#1F7A4D', '#8B4513', '#2E86C1'];
function avatarColor(name) { let h = 0; for (let c of name) h = (h + c.charCodeAt(0)) % AVATAR_COLORS.length; return AVATAR_COLORS[h]; }
function initials(name) { return name.trim().split(' ').slice(-2).map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function hskBadge(level) {
  const map = { 1: 'badge-hsk1', 2: 'badge-hsk2', 3: 'badge-hsk3', 4: 'badge-hsk4', 5: 'badge-hsk5', 6: 'badge-hsk6' };
  return `<span class="badge ${map[level] || 'badge-hsk1'}">HSK ${level}</span>`;
}
function fmtDate(dt) { return dt ? new Date(dt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }

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
  document.getElementById('teacher-name').textContent = profile.full_name;
  document.getElementById('teacher-avatar').textContent = initials(profile.full_name);
  document.getElementById('teacher-avatar').style.background = avatarColor(profile.full_name);
  await Promise.all([loadStudents(), loadGroups(), loadClasses(), loadVocab(), loadQuizzes(), loadResults(), loadHskBadge(), loadAnnouncements(), loadSentencesT()]);
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
  if (id === 'announcements') loadAnnouncements();
  if (id === 'classes') loadLessons();
  if (id === 'sentences') loadSentencesT();
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
    return `
      <div class="student-card">
        <div class="stu-avatar" style="background:${avatarColor(s.full_name)}">${initials(s.full_name)}</div>
        <div class="stu-info">
          <div class="stu-name">${s.full_name}</div>
          <div class="stu-sub">${sub}</div>
        </div>
        <div class="stu-actions-panel">
          <div style="display:flex;gap:4px;margin-bottom:8px;">
            ${hskBadge(s.hsk_level)}
            ${prog !== null ? `<div class="stu-pct ${progCls}">${prog}%</div>` : ''}
          </div>
          <div class="btn-group-row">
            <button class="btn-primary btn-xs" onclick="promoteStudent('${s.id}', '${s.full_name}', ${s.hsk_level})">🚀 Nâng cấp</button>
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
  if (!confirm(`Nâng cấp học sinh "${name}" lên HSK${nextLevel}?`)) return;
  
  const { error } = await sb.from('hsk_student_levels').upsert({
    student_id: id,
    hsk_level: nextLevel,
    updated_at: new Date()
  }, { onConflict: 'student_id' });
  
  if (error) { showToast('Lỗi: ' + error.message); return; }
  showToast(`✓ Đã nâng cấp ${name} lên HSK${nextLevel}`);
  await loadStudents();
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
        <div class="card-actions">
          <button class="btn-ghost btn-xs" onclick="openManageClassMembers(${c.id}, '${c.name}')">👥 Thành viên</button>
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

function openCreateLesson() {
  const sel = document.getElementById('lesson-class-id');
  sel.innerHTML = '<option value="">-- Lưu vào thư viện (Mẫu) --</option>' + allClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  
  selectedVocabIds.clear();
  const picker = document.getElementById('lesson-vocab-picker');
  // Order allVocab by level for the picker
  const pickerList = [...allVocab].sort((a,b) => a.hsk_level - b.hsk_level);
  picker.innerHTML = pickerList.slice(0, 500).map(v => `
    <div class="picker-item" onclick="togglePick(this,'vocab',${v.id})">
      <span style="font-family:'Noto Serif SC',serif">${v.hanzi}</span>
      <span class="pi-name">${v.pinyin} (HSK ${v.hsk_level})</span>
      <span class="pi-check">✓</span>
    </div>`).join('');
  openModal('modal-create-lesson');
}

let activeTemplateId = null;
function openAssignLesson(lessonId) {
  activeTemplateId = lessonId;
  const sel = document.getElementById('assign-lesson-class-id');
  sel.innerHTML = allClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  openModal('modal-assign-lesson');
}

async function assignLessonToClass() {
  const classId = document.getElementById('assign-lesson-class-id').value;
  if (!classId || !activeTemplateId) return;
  
  // Clone the lesson template to the class
  const { data: template } = await sb.from('lessons').select('*').eq('id', activeTemplateId).single();
  const { data: vocab } = await sb.from('lesson_vocab').select('vocab_id, position').eq('lesson_id', activeTemplateId);
  
  const { data: newLesson } = await sb.from('lessons').insert({
    class_id: classId,
    title: template.title,
    created_by: currentUser.id
  }).select().single();
  
  const rows = (vocab || []).map(v => ({ lesson_id: newLesson.id, vocab_id: v.vocab_id, position: v.position }));
  await sb.from('lesson_vocab').insert(rows);
  
  closeModal('modal-assign-lesson');
  await loadLessons();
  showToast('✓ Đã thêm bài học vào lớp');
}

async function createLesson() {
  const classVal = document.getElementById('lesson-class-id').value;
  const classId  = classVal === "" ? null : parseInt(classVal);
  const title    = document.getElementById('lesson-title').value.trim();
  if (!title || !selectedVocabIds.size) return alert('Nhập tiêu đề và chọn từ vựng');
  
  const { data: lesson, error } = await sb.from('lessons').insert({
    class_id: classId,
    title,
    created_by: currentUser.id
  }).select().single();
  
  if (error) { alert('Lỗi: ' + error.message); return; }
  
  const rows = [...selectedVocabIds].map((vid, idx) => ({ lesson_id: lesson.id, vocab_id: vid, position: idx + 1 }));
  await sb.from('lesson_vocab').insert(rows);
  
  closeModal('modal-create-lesson');
  await loadLessons();
  showToast('✓ Đã tạo bài học ' + title);
}

async function deleteLesson(id, title) {
  if (!confirm(`Bạn có chắc muốn xoá bài học "${title}"?`)) return;
  
  // 1. Delete associated vocab mapping first
  await sb.from('lesson_vocab').delete().eq('lesson_id', id);
  // 2. Delete the lesson itself
  const { error } = await sb.from('lessons').delete().eq('id', id);
  
  if (error) { alert('Lỗi: ' + error.message); return; }
  showToast(`✓ Đã xoá bài học "${title}"`);
  await loadLessons();
}

async function openEditLesson(lessonId) {
  const { data: lesson } = await sb.from('lessons').select('*, lesson_vocab(vocab_id)').eq('id', lessonId).single();
  if (!lesson) return;
  
  document.getElementById('edit-lesson-id').value = lesson.id;
  document.getElementById('edit-lesson-title').value = lesson.title;
  
  selectedVocabIds.clear();
  (lesson.lesson_vocab || []).forEach(lv => selectedVocabIds.add(lv.vocab_id));
  
  const picker = document.getElementById('edit-lesson-vocab-picker');
  picker.innerHTML = allVocab.slice(0, 100).map(v => {
    const isSelected = selectedVocabIds.has(v.id);
    return `
      <div class="picker-item ${isSelected ? 'selected' : ''}" onclick="togglePick(this,'vocab',${v.id})">
        <span style="font-family:'Noto Serif SC',serif">${v.hanzi}</span>
        <span class="pi-name">${v.pinyin}</span>
        <span class="pi-check">✓</span>
      </div>`;
  }).join('');
  
  openModal('modal-edit-lesson');
}

async function updateLesson() {
  const id = parseInt(document.getElementById('edit-lesson-id').value);
  const title = document.getElementById('edit-lesson-title').value.trim();
  if (!title || !selectedVocabIds.size) return alert('Nhập tiêu đề và chọn từ vựng');
  
  // 1. Update title
  await sb.from('lessons').update({ title }).eq('id', id);
  
  // 2. Sync vocab
  await sb.from('lesson_vocab').delete().eq('lesson_id', id);
  const rows = [...selectedVocabIds].map((vid, idx) => ({ lesson_id: id, vocab_id: vid, position: idx + 1 }));
  await sb.from('lesson_vocab').insert(rows);
  
  closeModal('modal-edit-lesson');
  await loadLessons();
  showToast('✓ Đã cập nhật bài học');
}

// ══════════════════════════════════════════
//  VOCAB
// ══════════════════════════════════════════
async function loadVocab() {
  const { data } = await sb.from('vocab').select('*').order('hsk_level').order('id');
  allVocab = data || [];
  renderVocabTable(allVocab);
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
    const vLvl = v.hsk_level || 1;
    const vCat = v.category || 'Khác';
    
    if (vLvl !== currentLvl) {
      currentLvl = vLvl;
      currentCat = vCat;
      groupRow = `<tr class="table-group-header-lvl"><td colspan="6">🏆 Cấp độ HSK ${currentLvl}</td></tr>
                  <tr class="table-group-header"><td colspan="6">📁 Chủ đề: ${currentCat}</td></tr>`;
    } else if (vCat !== currentCat) {
      currentCat = vCat;
      groupRow = `<tr class="table-group-header"><td colspan="6">📁 Chủ đề: ${currentCat}</td></tr>`;
    }
    
    const level = v.hsk_level || 1;
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
  const { data } = await sb.from('quizzes').select('*').order('created_at', { ascending: false });
  allQuizzes = data || [];
  const { data: results } = await sb.from('quiz_results').select('quiz_id');
  const submitMap = {};
  (results || []).forEach(r => { submitMap[r.quiz_id] = (submitMap[r.quiz_id] || 0) + 1; });
  const { data: assigns } = await sb.from('quiz_assignments').select('quiz_id');
  const assignMap = {};
  (assigns || []).forEach(a => { assignMap[a.quiz_id] = (assignMap[a.quiz_id] || 0) + 1; });

  const el = document.getElementById('quiz-list');
  if (!allQuizzes.length) { el.innerHTML = '<div class="empty-state"><span class="empty-icon">✏️</span>Chưa có quiz nào.</div>'; return; }
  el.innerHTML = allQuizzes.map(q => {
    const submitted = submitMap[q.id] || 0;
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
              ${isQuick && q.duration_seconds ? ' · ' + Math.round(q.duration_seconds / 60) + ' phút' : ''}
            </div>
          </div>
          <span class="badge ${isQuick ? 'badge-new' : 'badge-done'}">${isQuick ? '⚡ Nhanh' : '📝 Homework'}</span>
        </div>
        <div style="margin-bottom:6px;display:flex;justify-content:space-between;font-size:12px;color:var(--text3);">
          <span>Đã nộp: <strong style="color:var(--text)">${submitted}/${total}</strong></span>
          <span>${pct}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill${pct >= 80 ? ' ' : pct >= 40 ? ' gold' : ' red'}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
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
  document.getElementById('assign-group-field').style.display = target === 'group' ? 'block' : 'none';
  document.getElementById('assign-student-field').style.display = target === 'student' ? 'block' : 'none';
}

function openCreateQuiz() {
  selectedVocabIds.clear();
  selectedClassIds.clear();
  selectedGroupIds.clear();
  selectedStudentIds.clear();
  renderVocabPicker();
  renderAssignPickers();
  openModal('modal-create-quiz');
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
  const groupPicker = document.getElementById('assign-group-picker');
  groupPicker.innerHTML = allGroups.map(g => `
    <div class="picker-item" onclick="togglePick(this,'group',${g.id})">
      <span class="pi-name">👥 ${g.name}</span>
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

  const { data: quiz, error } = await sb.from('quizzes').insert({
    title,
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
        <td style="font-size:12px;color:var(--text3);">${fmtDate(r.completed_at)}</td>
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
        <div style="font-size:10px;color:var(--text3);margin-top:4px;">${fmtDate(a.created_at)}</div>
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
  if (!title || !content) return alert('Nhập tiêu đề và nội dung');
  
  const row = { title, content, class_id: classId ? parseInt(classId) : null };
  const { error } = await sb.from('announcements').update(row).eq('id', id);
  if (error) return alert('Lỗi: ' + error.message);
  
  closeModal('modal-edit-announcement');
  await loadAnnouncements();
  showToast('✓ Đã cập nhật thông báo');
}

function openCreateAnnouncement() {
  const sel = document.getElementById('ann-class-id');
  sel.innerHTML = '<option value="">Toàn trường (Tất cả học sinh)</option>' + 
    allClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  openModal('modal-create-announcement');
}

async function createAnnouncement() {
  const title = document.getElementById('ann-title').value.trim();
  const content = document.getElementById('ann-content').value.trim();
  const classId = document.getElementById('ann-class-id').value;
  if (!title || !content) return alert('Vui lòng nhập đầy đủ tiêu đề và nội dung');
  
  const row = { title, content, created_by: currentUser.id };
  if (classId) row.class_id = parseInt(classId);

  const { error } = await sb.from('announcements').insert(row);
  if (error) { alert('Lỗi: ' + error.message); return; }

  closeModal('modal-create-announcement');
  document.getElementById('ann-title').value = '';
  document.getElementById('ann-content').value = '';
  await loadAnnouncements();
  showToast('✓ Đã gửi thông báo');
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
  showToast('✅ Đã duyệt yêu cầu thành công!');
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
  // 2. Get results
  const { data: results } = await sb.from('quiz_results').select('*').eq('quiz_id', quizId);
  
  if (!assignments?.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty-state">Chưa giao cho học sinh nào.</td></tr>';
    return;
  }
  
  const resultByStudent = {};
  (results || []).forEach(r => { resultByStudent[r.student_id] = r; });
  
  body.innerHTML = assignments.map(a => {
    const res = resultByStudent[a.student_id];
    const isDone = !!res;
    const scoreText = isDone ? `${res.score}/${res.total}` : '—';
    const pct = isDone ? Math.round(res.score / res.total * 100) : 0;
    const scoreColor = isDone ? (pct >= 80 ? 'var(--accent)' : pct >= 50 ? 'var(--gold)' : 'var(--primary)') : 'var(--text3)';
    
    return `
      <tr>
        <td>
          <div style="font-weight:600;">${a.profiles?.full_name || 'N/A'}</div>
        </td>
        <td>
          ${isDone 
            ? '<span class="badge badge-done" style="background:var(--accent-bg);color:var(--accent)">✓ Đã nộp</span>' 
            : '<span class="badge" style="background:var(--surface2);color:var(--text3)">⏳ Chưa làm</span>'}
        </td>
        <td style="font-weight:700;color:${scoreColor}">${scoreText}</td>
        <td style="font-size:12px;color:var(--text3)">${isDone ? fmtDate(res.completed_at) : '—'}</td>
      </tr>`;
  }).join('');
}
