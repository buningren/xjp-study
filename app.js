/* ============================================================
   习近平新时代思想概论练习系统 - 核心逻辑
   ============================================================ */

// ===== STATE =====
const S = {
  // Practice
  pList: [],        // current practice question list
  pIdx: 0,          // current index
  pSelected: [],    // selected options
  pAnswered: false, // answered current?
  pFilter: { type: 'all', ch: 'all' },
  pStats: { correct: 0, total: 0 },

  // Exam
  eList: [],        // exam question list
  eIdx: 0,
  eAnswers: {},     // { id: [answers] }
  eConfig: { count: 20, time: 30, etype: 'all' },
  eTimer: null,
  eSeconds: 0,
  eStartTime: 0,

  // Wrong book
  wrongFilter: 'all',

  // Data from localStorage
  wrongBook: {},    // { qid: { q, myAns, rightAns, count, mastered, chapter, type } }
  practiceRecord: {}, // { qid: { correct: bool } }
};

// ===== STORAGE =====
function save() {
  try {
    localStorage.setItem('xjp_wrong', JSON.stringify(S.wrongBook));
    localStorage.setItem('xjp_record', JSON.stringify(S.practiceRecord));
  } catch(e) {}
}
function load() {
  try {
    S.wrongBook = JSON.parse(localStorage.getItem('xjp_wrong') || '{}');
    S.practiceRecord = JSON.parse(localStorage.getItem('xjp_record') || '{}');
  } catch(e) { S.wrongBook = {}; S.practiceRecord = {}; }
}

// ===== UTILS =====
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function showToast(msg, dur = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}
function showModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('overlay').classList.add('open');
}
function closeModal() {
  document.getElementById('overlay').classList.remove('open');
}
function fmtTime(s) {
  const m = Math.floor(s / 60), ss = s % 60;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}
function getChapters() {
  return [...new Set(QUESTIONS.map(q => q.chapter))];
}
function getQByChapter(ch) {
  return QUESTIONS.filter(q => q.chapter === ch);
}
// Get answer display string
function answerStr(q) {
  if (q.type === 'single') return q.answer;
  return Array.isArray(q.answer) ? q.answer.join('、') : q.answer;
}
// Check if answer correct
function isCorrect(q, sel) {
  if (q.type === 'single') {
    return sel.length === 1 && sel[0] === q.answer;
  } else {
    const right = Array.isArray(q.answer) ? [...q.answer].sort() : [];
    const given = [...sel].sort();
    return JSON.stringify(right) === JSON.stringify(given);
  }
}

// ===== PAGE NAVIGATION =====
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.nav-tab')[
    ['home','practice','exam','wrong','mind'].indexOf(name)
  ].classList.add('active');

  if (name === 'home') updateHomeStats();
  if (name === 'wrong') renderWrongList();
  if (name === 'mind') renderMind();
  if (name === 'practice') renderChapterChips();
}

// ===== HOME =====
function updateHomeStats() {
  const done = Object.keys(S.practiceRecord).length;
  const wrongCount = Object.values(S.wrongBook).filter(w => !w.mastered).length;
  const masteredCount = Object.values(S.wrongBook).filter(w => w.mastered).length;
  const records = Object.values(S.practiceRecord);
  const correct = records.filter(r => r.correct).length;
  const acc = done > 0 ? Math.round(correct / done * 100) + '%' : '—';

  document.getElementById('stat-total').textContent = QUESTIONS.length;
  document.getElementById('stat-done').textContent = done;
  document.getElementById('stat-acc').textContent = acc;
  document.getElementById('stat-wrong').textContent = wrongCount;

  renderChapterGrid();
}

function renderChapterGrid() {
  const grid = document.getElementById('chapter-grid');
  const chapters = getChapters();
  grid.innerHTML = chapters.map(ch => {
    const qs = getQByChapter(ch);
    const done = qs.filter(q => S.practiceRecord[q.id]).length;
    const pct = Math.round(done / qs.length * 100);
    const title = KNOWLEDGE.find(k => k.chapter === ch)?.title || ch;
    return `<div class="chapter-card" onclick="practiceByChapter('${ch}')">
      <div style="font-size:11px;color:var(--text3);margin-bottom:3px">${ch}</div>
      <h3>${title}</h3>
      <p>${qs.length}道题 · 已练习${done}题</p>
      <div class="prog-wrap"><div class="prog-bar" style="width:${pct}%"></div></div>
      <span class="c-badge">${pct}%</span>
    </div>`;
  }).join('');
}

function practiceByChapter(ch) {
  S.pFilter = { type: 'all', ch };
  showPage('practice');
  setTimeout(() => {
    setFilter('ch', ch);
  }, 50);
}

function startQuickPractice(type) {
  S.pFilter = { type, ch: 'all' };
  showPage('practice');
  setTimeout(() => {
    setFilter('type', type);
  }, 50);
}

function startExamMode() {
  showPage('exam');
  resetExam();
}

function startWrongPractice() {
  const wrongs = Object.values(S.wrongBook).filter(w => !w.mastered);
  if (wrongs.length === 0) { showToast('暂无错题，快去做题吧！'); return; }
  showPage('practice');
  setTimeout(() => practiceWrong(), 100);
}

// ===== PRACTICE =====
function buildPracticeList() {
  let list = QUESTIONS;
  if (S.pFilter.type !== 'all') list = list.filter(q => q.type === S.pFilter.type);
  if (S.pFilter.ch !== 'all') list = list.filter(q => q.chapter === S.pFilter.ch);
  return shuffle(list);
}

function initPractice() {
  S.pList = buildPracticeList();
  S.pIdx = 0;
  S.pSelected = [];
  S.pAnswered = false;
  S.pStats = { correct: 0, total: 0 };
  renderQuestion();
  updateFilterCount();
}

function renderChapterChips() {
  const container = document.getElementById('chapter-chips');
  const chapters = getChapters();
  container.innerHTML = chapters.map(ch =>
    `<span class="chip ${S.pFilter.ch === ch ? 'active' : ''}" id="filter-ch-${ch.replace(/[^a-z0-9]/gi,'')}"
      onclick="setFilter('ch','${ch}')">${ch}</span>`
  ).join('');
}

function setFilter(dim, val) {
  if (dim === 'type') {
    S.pFilter.type = val;
    ['all','single','multi'].forEach(v => {
      const el = document.getElementById('filter-type-' + v);
      if (el) el.classList.toggle('active', v === val);
    });
  }
  if (dim === 'ch') {
    S.pFilter.ch = val;
    document.querySelectorAll('[id^="filter-ch-"]').forEach(el => el.classList.remove('active'));
    const targetId = val === 'all' ? 'filter-ch-all' : 'filter-ch-' + val.replace(/[^a-z0-9]/gi,'');
    const target = document.getElementById(targetId);
    if (target) target.classList.add('active');
  }
  initPractice();
}

function renderQuestion() {
  if (S.pList.length === 0) {
    document.getElementById('q-text').textContent = '没有符合条件的题目';
    document.getElementById('options').innerHTML = '';
    return;
  }
  const q = S.pList[S.pIdx];
  S.pSelected = [];
  S.pAnswered = false;

  // Header
  document.getElementById('q-num').textContent = `${S.pIdx + 1} / ${S.pList.length}`;
  document.getElementById('q-type-tag').textContent = q.type === 'single' ? '单选题' : '多选题';
  document.getElementById('q-type-tag').className = 'tag ' + (q.type === 'single' ? 'tag-single' : 'tag-multi');
  document.getElementById('q-chapter-tag').textContent = q.chapter;
  const pct = Math.round((S.pIdx + 1) / S.pList.length * 100);
  document.getElementById('q-progress-bar').style.width = pct + '%';
  document.getElementById('q-progress-text').textContent = `正确率 ${S.pStats.total > 0 ? Math.round(S.pStats.correct/S.pStats.total*100) + '%' : '—'}`;

  // Question
  document.getElementById('q-text').textContent = q.q;
  document.getElementById('multi-hint').style.display = q.type === 'multi' ? 'block' : 'none';

  // Options
  renderOptions(q, 'options', false);

  // Result bar
  const rb = document.getElementById('result-bar');
  rb.className = 'result-bar';
  rb.textContent = '';

  // Buttons
  document.getElementById('btn-prev').disabled = S.pIdx === 0;
  document.getElementById('btn-main').textContent = '提交答案';
  document.getElementById('btn-main').className = 'btn btn-primary';
  document.getElementById('btn-skip').style.display = '';

  const cc = document.getElementById('q-correct-count');
  cc.textContent = `已答 ${S.pStats.total} 题，正确 ${S.pStats.correct} 题`;
}

function renderOptions(q, containerId, disabled, myAns = [], showRight = false) {
  const container = document.getElementById(containerId);
  container.innerHTML = q.options.map((opt, i) => {
    const key = opt[0]; // A/B/C/D
    let cls = 'opt';
    let mark = '';
    if (disabled) {
      const isRight = q.type === 'single'
        ? key === q.answer
        : (Array.isArray(q.answer) ? q.answer.includes(key) : false);
      const mySelected = myAns.includes(key);
      if (mySelected && isRight) { cls += ' correct'; mark = '✓'; }
      else if (mySelected && !isRight) { cls += ' wrong'; mark = '✗'; }
      else if (!mySelected && isRight && showRight) { cls += ' correct-hint'; mark = '●'; }
    }
    return `<button class="${cls}" ${disabled ? 'disabled' : ''} onclick="selectOption('${key}',${q.id})" data-key="${key}">
      <span class="opt-key">${key}</span>
      <span style="flex:1">${opt.slice(2)}</span>
      ${mark ? `<span class="opt-mark">${mark}</span>` : ''}
    </button>`;
  }).join('');
}

function selectOption(key, qid) {
  if (S.pAnswered) return;
  const q = S.pList.find(q => q.id === qid) || S.pList[S.pIdx];

  if (q.type === 'single') {
    S.pSelected = [key];
    // Highlight
    document.querySelectorAll('#options .opt').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.key === key);
    });
  } else {
    // Multi
    const idx = S.pSelected.indexOf(key);
    if (idx >= 0) S.pSelected.splice(idx, 1);
    else S.pSelected.push(key);
    document.querySelectorAll('#options .opt').forEach(btn => {
      btn.classList.toggle('selected', S.pSelected.includes(btn.dataset.key));
    });
  }
}

function submitOrNext() {
  if (!S.pAnswered) {
    // Submit
    if (S.pSelected.length === 0) { showToast('请先选择答案'); return; }
    const q = S.pList[S.pIdx];
    const correct = isCorrect(q, S.pSelected);
    S.pAnswered = true;
    S.pStats.total++;
    if (correct) S.pStats.correct++;

    // Update record
    S.practiceRecord[q.id] = { correct };

    // Update wrong book
    if (!correct) {
      if (!S.wrongBook[q.id]) {
        S.wrongBook[q.id] = {
          id: q.id, q: q.q, options: q.options,
          myAns: S.pSelected, rightAns: q.answer,
          count: 1, mastered: false,
          chapter: q.chapter, type: q.type
        };
      } else {
        S.wrongBook[q.id].count++;
        S.wrongBook[q.id].myAns = S.pSelected;
        S.wrongBook[q.id].mastered = false;
      }
    } else {
      // If previously wrong but now correct 3 times, mark mastered?
      if (S.wrongBook[q.id]) {
        // Still show in wrong book until user marks mastered
      }
    }
    save();

    // Disable options and show correct/wrong
    renderOptions(q, 'options', true, S.pSelected, true);

    // Result bar
    const rb = document.getElementById('result-bar');
    if (correct) {
      rb.className = 'result-bar bar-correct show';
      rb.innerHTML = `<div class="answer-hint">✅ 回答正确！</div>正确答案：<strong>${answerStr(q)}</strong>`;
    } else {
      rb.className = 'result-bar bar-wrong show';
      rb.innerHTML = `<div class="answer-hint">❌ 回答错误</div>你的答案：<strong>${S.pSelected.join('、')}</strong> · 正确答案：<strong>${answerStr(q)}</strong>`;
    }

    document.getElementById('btn-main').textContent = S.pIdx < S.pList.length - 1 ? '下一题 →' : '完成';
    document.getElementById('btn-skip').style.display = 'none';
    document.getElementById('q-correct-count').textContent = `已答 ${S.pStats.total} 题，正确 ${S.pStats.correct} 题`;

  } else {
    // Next
    if (S.pIdx < S.pList.length - 1) {
      S.pIdx++;
      renderQuestion();
    } else {
      // Done
      const acc = Math.round(S.pStats.correct / S.pStats.total * 100);
      showToast(`🎉 本次练习完成！答对 ${S.pStats.correct}/${S.pStats.total} 题，正确率 ${acc}%`, 3500);
      setTimeout(initPractice, 3600);
    }
  }
}

function prevQuestion() {
  if (S.pIdx > 0) { S.pIdx--; renderQuestion(); }
}

function skipQuestion() {
  if (S.pIdx < S.pList.length - 1) { S.pIdx++; renderQuestion(); }
  else showToast('已是最后一题');
}

function shuffleAndRestart() {
  initPractice();
  showToast('已重新打乱题目顺序');
}

function resetProgress() {
  if (!confirm('确定要清除练习记录吗？')) return;
  S.practiceRecord = {};
  S.pStats = { correct: 0, total: 0 };
  save();
  initPractice();
  showToast('练习记录已清除');
}

function updateFilterCount() {
  const el = document.getElementById('filter-count');
  if (el) el.textContent = `共 ${S.pList.length} 道题`;
}

function practiceWrong() {
  const wrongs = Object.values(S.wrongBook).filter(w => !w.mastered);
  if (wrongs.length === 0) { showToast('暂无错题，继续加油！'); return; }
  const ids = new Set(wrongs.map(w => w.id));
  S.pList = shuffle(QUESTIONS.filter(q => ids.has(q.id)));
  S.pIdx = 0;
  S.pSelected = [];
  S.pAnswered = false;
  S.pStats = { correct: 0, total: 0 };
  renderQuestion();
  updateFilterCount();
  if (document.getElementById('page-practice').classList.contains('active')) {
    showToast(`已加载 ${S.pList.length} 道错题`);
  }
}

// ===== EXAM =====
function selectExamOpt(el, dim) {
  el.closest('.exam-opts-row').querySelectorAll('.exam-opt').forEach(e => e.classList.remove('sel'));
  el.classList.add('sel');
  if (dim === 'count') S.eConfig.count = +el.dataset.count;
  if (dim === 'time') S.eConfig.time = +el.dataset.time;
  if (dim === 'etype') S.eConfig.etype = el.dataset.etype;
}

function startExam() {
  let pool = QUESTIONS;
  if (S.eConfig.etype !== 'all') pool = pool.filter(q => q.type === S.eConfig.etype);
  const n = Math.min(S.eConfig.count, pool.length);
  S.eList = shuffle(pool).slice(0, n);
  S.eIdx = 0;
  S.eAnswers = {};
  S.eStartTime = Date.now();

  document.getElementById('exam-setup').style.display = 'none';
  document.getElementById('exam-doing').style.display = 'block';
  document.getElementById('exam-result').style.display = 'none';

  // Build dots
  renderExamDots();
  renderExamQuestion();

  // Timer
  if (S.eTimer) clearInterval(S.eTimer);
  if (S.eConfig.time > 0) {
    S.eSeconds = S.eConfig.time * 60;
    updateTimerDisplay();
    S.eTimer = setInterval(() => {
      S.eSeconds--;
      updateTimerDisplay();
      if (S.eSeconds <= 0) { clearInterval(S.eTimer); submitExam(); }
      if (S.eSeconds <= 60) document.getElementById('exam-timer').classList.add('warn');
      else document.getElementById('exam-timer').classList.remove('warn');
    }, 1000);
  } else {
    document.getElementById('timer-text').textContent = '不限时';
    document.getElementById('exam-timer').style.display = 'none';
  }
}

function updateTimerDisplay() {
  document.getElementById('timer-text').textContent = fmtTime(S.eSeconds);
}

function renderExamDots() {
  const dots = document.getElementById('exam-dots');
  dots.innerHTML = S.eList.map((q, i) =>
    `<div class="exam-dot ${i === S.eIdx ? 'current' : ''} ${S.eAnswers[q.id] ? 'answered' : ''}"
      onclick="jumpExamQ(${i})">${i+1}</div>`
  ).join('');
}

function renderExamQuestion() {
  const q = S.eList[S.eIdx];
  document.getElementById('exam-q-num').textContent = `${S.eIdx+1} / ${S.eList.length}`;
  document.getElementById('exam-q-index').textContent = `${S.eIdx+1}/${S.eList.length}`;
  document.getElementById('exam-q-type').textContent = q.type === 'single' ? '单选题' : '多选题';
  document.getElementById('exam-q-type').className = 'tag ' + (q.type === 'single' ? 'tag-single' : 'tag-multi');
  document.getElementById('exam-q-chapter').textContent = q.chapter;
  document.getElementById('exam-q-text').textContent = q.q;
  document.getElementById('exam-multi-hint').style.display = q.type === 'multi' ? 'block' : 'none';

  const saved = S.eAnswers[q.id] || [];
  const opts = document.getElementById('exam-options');
  opts.innerHTML = q.options.map(opt => {
    const key = opt[0];
    return `<button class="opt ${saved.includes(key) ? 'selected' : ''}"
      onclick="examSelectOpt('${key}',${q.id})" data-key="${key}">
      <span class="opt-key">${key}</span>
      <span style="flex:1">${opt.slice(2)}</span>
    </button>`;
  }).join('');

  document.getElementById('exam-btn-prev').disabled = S.eIdx === 0;
  document.getElementById('exam-btn-next').textContent = S.eIdx === S.eList.length - 1 ? '完成答题' : '下一题 →';

  const answered = Object.keys(S.eAnswers).length;
  document.getElementById('exam-answered-count').textContent = `已答 ${answered} 题`;
}

function examSelectOpt(key, qid) {
  const q = S.eList.find(q => q.id === qid);
  if (!q) return;
  let ans = S.eAnswers[q.id] ? [...S.eAnswers[q.id]] : [];
  if (q.type === 'single') {
    ans = [key];
  } else {
    const idx = ans.indexOf(key);
    if (idx >= 0) ans.splice(idx, 1);
    else ans.push(key);
  }
  S.eAnswers[q.id] = ans;
  renderExamQuestion();
  renderExamDots();
}

function examNext() {
  if (S.eIdx < S.eList.length - 1) {
    S.eIdx++;
    renderExamQuestion();
    renderExamDots();
  } else {
    submitExam();
  }
}

function examPrev() {
  if (S.eIdx > 0) {
    S.eIdx--;
    renderExamQuestion();
    renderExamDots();
  }
}

function jumpExamQ(i) {
  S.eIdx = i;
  renderExamQuestion();
  renderExamDots();
}

function submitExam() {
  if (S.eTimer) clearInterval(S.eTimer);
  const unanswered = S.eList.filter(q => !S.eAnswers[q.id] || S.eAnswers[q.id].length === 0).length;
  if (unanswered > 0 && !confirm(`还有 ${unanswered} 道题未作答，确认交卷？`)) return;

  let correct = 0;
  const chStats = {};
  S.eList.forEach(q => {
    const ans = S.eAnswers[q.id] || [];
    const ok = isCorrect(q, ans);
    if (ok) correct++;
    // Update wrong book
    if (!ok && ans.length > 0) {
      if (!S.wrongBook[q.id]) {
        S.wrongBook[q.id] = {
          id: q.id, q: q.q, options: q.options,
          myAns: ans, rightAns: q.answer,
          count: 1, mastered: false,
          chapter: q.chapter, type: q.type
        };
      } else {
        S.wrongBook[q.id].count++;
        S.wrongBook[q.id].myAns = ans;
        S.wrongBook[q.id].mastered = false;
      }
    }
    // Update record
    S.practiceRecord[q.id] = { correct: ok };
    // Chapter stats
    if (!chStats[q.chapter]) chStats[q.chapter] = { total: 0, correct: 0 };
    chStats[q.chapter].total++;
    if (ok) chStats[q.chapter].correct++;
  });
  save();

  const score = Math.round(correct / S.eList.length * 100);
  const elapsed = Math.round((Date.now() - S.eStartTime) / 1000);

  document.getElementById('exam-doing').style.display = 'none';
  document.getElementById('exam-result').style.display = 'block';
  document.getElementById('exam-review').style.display = 'none';

  document.getElementById('result-score').textContent = score;
  document.getElementById('result-correct').textContent = correct;
  document.getElementById('result-wrong').textContent = S.eList.length - correct;
  document.getElementById('result-total').textContent = S.eList.length;

  // Animate score arc
  setTimeout(() => {
    const arc = document.getElementById('score-arc');
    const pct = score / 100;
    arc.style.strokeDashoffset = 314 * (1 - pct);
    const color = score >= 80 ? '#27ae60' : score >= 60 ? '#f39c12' : '#e74c3c';
    arc.style.stroke = color;
    document.getElementById('result-score').style.color = color;
  }, 100);

  // Chapter stats
  const csEl = document.getElementById('result-chapter-stats');
  csEl.innerHTML = '<div style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--text)">各章节得分</div>' +
    Object.entries(chStats).map(([ch, s]) => {
      const p = Math.round(s.correct / s.total * 100);
      const c = p >= 80 ? '#27ae60' : p >= 60 ? '#f39c12' : '#e74c3c';
      return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px;font-size:13px">
        <span style="width:80px;flex-shrink:0;color:var(--text2)">${ch}</span>
        <div class="prog-wrap" style="flex:1"><div class="prog-bar" style="width:${p}%;background:${c}"></div></div>
        <span style="width:70px;text-align:right;color:${c};font-weight:700">${s.correct}/${s.total} (${p}%)</span>
      </div>`;
    }).join('');
}

function reviewExam() {
  const reviewEl = document.getElementById('exam-review');
  reviewEl.style.display = 'block';
  reviewEl.innerHTML = '<div class="section-title" style="margin-bottom:16px">📋 详细解析</div>' +
    S.eList.map((q, i) => {
      const ans = S.eAnswers[q.id] || [];
      const ok = isCorrect(q, ans);
      const border = ok ? 'var(--green)' : 'var(--primary2)';
      const icon = ok ? '✅' : '❌';
      const optsHtml = q.options.map(opt => {
        const key = opt[0];
        const isRight = q.type === 'single'
          ? key === q.answer
          : (Array.isArray(q.answer) ? q.answer.includes(key) : false);
        const selected = ans.includes(key);
        let bg = '#f8f9fa', col = 'var(--text)';
        if (selected && isRight) { bg = '#eafaf1'; col = '#1e8449'; }
        else if (selected && !isRight) { bg = '#fdedec'; col = '#c0392b'; }
        else if (!selected && isRight) { bg = 'rgba(39,174,96,.06)'; col = '#1e8449'; }
        return `<div style="padding:8px 12px;border-radius:6px;margin:4px 0;background:${bg};color:${col};font-size:13px">
          <strong>${key}.</strong> ${opt.slice(2)}
          ${isRight ? ' ✓' : ''}${selected && !isRight ? ' ✗' : ''}
        </div>`;
      }).join('');
      return `<div class="card" style="margin-bottom:12px;border-left:4px solid ${border}">
        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
          <span>${icon}</span>
          <div style="flex:1">
            <span style="font-size:12px;color:var(--text2)">${i+1}. ${q.chapter} · ${q.type==='single'?'单选':'多选'}</span>
            <div style="font-size:14px;font-weight:600;margin-top:4px;line-height:1.7">${q.q}</div>
          </div>
        </div>
        ${optsHtml}
        ${!ok ? `<div style="margin-top:8px;font-size:13px;color:var(--primary);padding:8px 12px;background:var(--primary3);border-radius:6px">
          我的答案：<strong>${ans.length ? ans.join('、') : '未作答'}</strong> &nbsp;|&nbsp; 正确答案：<strong>${answerStr(q)}</strong>
        </div>` : ''}
      </div>`;
    }).join('');

  reviewEl.scrollIntoView({ behavior: 'smooth' });
}

function resetExam() {
  if (S.eTimer) clearInterval(S.eTimer);
  document.getElementById('exam-setup').style.display = 'block';
  document.getElementById('exam-doing').style.display = 'none';
  document.getElementById('exam-result').style.display = 'none';
}

// ===== WRONG BOOK =====
function setWrongFilter(f) {
  S.wrongFilter = f;
  ['all','single','multi','mastered'].forEach(v => {
    const el = document.getElementById('wf-' + v);
    if (el) el.classList.toggle('active', v === f);
  });
  renderWrongList();
}

function renderWrongList() {
  // Stats
  const all = Object.values(S.wrongBook);
  document.getElementById('w-total').textContent = all.filter(w => !w.mastered).length;
  document.getElementById('w-single').textContent = all.filter(w => !w.mastered && w.type === 'single').length;
  document.getElementById('w-multi').textContent = all.filter(w => !w.mastered && w.type === 'multi').length;
  document.getElementById('w-mastered').textContent = all.filter(w => w.mastered).length;

  let list = all;
  if (S.wrongFilter === 'single') list = list.filter(w => w.type === 'single');
  else if (S.wrongFilter === 'multi') list = list.filter(w => w.type === 'multi');
  else if (S.wrongFilter === 'mastered') list = list.filter(w => w.mastered);
  else list = list.filter(w => !w.mastered);

  // Search
  const kw = (document.getElementById('wrong-search')?.value || '').trim().toLowerCase();
  if (kw) list = list.filter(w => w.q.toLowerCase().includes(kw) || w.chapter.toLowerCase().includes(kw));

  // Sort: most errors first
  list.sort((a, b) => b.count - a.count);

  const container = document.getElementById('wrong-list-container');
  if (list.length === 0) {
    container.innerHTML = `<div class="wrong-empty">
      <span class="icon">${S.wrongFilter === 'mastered' ? '🏆' : '🎉'}</span>
      <h3>${S.wrongFilter === 'mastered' ? '暂无已掌握题目' : '暂无错题'}</h3>
      <p>${S.wrongFilter === 'mastered' ? '做题后可将错题标记为已掌握' : '做题时答错的题目会自动收录到这里'}</p>
    </div>`;
    return;
  }

  container.innerHTML = '<div class="wrong-list">' + list.map(w => {
    const typeTag = `<span class="tag ${w.type === 'single' ? 'tag-single' : 'tag-multi'}">${w.type === 'single' ? '单选' : '多选'}</span>`;
    const masteredTag = w.mastered ? '<span class="tag" style="background:#eafaf1;color:#1e8449">✅已掌握</span>' : '';
    const myAnsStr = Array.isArray(w.myAns) ? w.myAns.join('、') : w.myAns;
    const rightAnsStr = Array.isArray(w.rightAns) ? w.rightAns.join('、') : w.rightAns;
    const optsHtml = (w.options || []).map(opt => {
      const key = opt[0];
      const isRight = Array.isArray(w.rightAns) ? w.rightAns.includes(key) : key === w.rightAns;
      const isMy = Array.isArray(w.myAns) ? w.myAns.includes(key) : key === w.myAns;
      let style = '';
      if (isRight) style = 'color:var(--green);font-weight:600';
      else if (isMy && !isRight) style = 'color:var(--primary2);font-weight:600;text-decoration:line-through';
      else style = 'color:var(--text3)';
      return `<div style="font-size:13px;${style};padding:2px 0">${opt}</div>`;
    }).join('');
    return `<div class="wrong-item">
      <div class="wrong-item-header">
        ${typeTag}
        <span class="tag tag-chapter">${w.chapter}</span>
        ${masteredTag}
        <span class="wrong-count-badge">错误 ${w.count} 次</span>
      </div>
      <div class="wrong-q">${w.q}</div>
      <details style="font-size:13px;cursor:pointer">
        <summary style="color:var(--blue2);margin-bottom:6px">查看选项</summary>
        <div style="padding:8px;background:#f8f9fa;border-radius:6px">${optsHtml}</div>
      </details>
      <div class="wrong-detail my-ans"><label>我的答案：</label>${myAnsStr}</div>
      <div class="wrong-detail right-ans"><label>正确答案：</label>${rightAnsStr}</div>
      <div class="wrong-action-row">
        <button class="btn btn-primary" style="padding:6px 14px;font-size:12px" onclick="reDoWrong(${w.id})">重新练习</button>
        ${!w.mastered
          ? `<button class="btn btn-green" style="padding:6px 14px;font-size:12px" onclick="markMastered(${w.id})">标为已掌握</button>`
          : `<button class="btn btn-secondary" style="padding:6px 14px;font-size:12px" onclick="unmarkMastered(${w.id})">取消已掌握</button>`}
        <button class="btn btn-secondary" style="padding:6px 14px;font-size:12px" onclick="deleteWrong(${w.id})">删除</button>
      </div>
    </div>`;
  }).join('') + '</div>';
}

function markMastered(id) {
  if (S.wrongBook[id]) { S.wrongBook[id].mastered = true; save(); renderWrongList(); showToast('已标记为掌握 ✅'); }
}
function unmarkMastered(id) {
  if (S.wrongBook[id]) { S.wrongBook[id].mastered = false; save(); renderWrongList(); }
}
function deleteWrong(id) {
  delete S.wrongBook[id]; save(); renderWrongList(); showToast('已删除');
}
function clearWrong() {
  if (!confirm('确定清空全部错题？')) return;
  S.wrongBook = {}; save(); renderWrongList(); showToast('错题本已清空');
}
function reDoWrong(id) {
  const q = QUESTIONS.find(q => q.id === id);
  if (!q) return;
  S.pList = [q];
  S.pIdx = 0;
  S.pSelected = [];
  S.pAnswered = false;
  S.pStats = { correct: 0, total: 0 };
  showPage('practice');
  renderQuestion();
  showToast('正在练习该错题');
}

// ===== MIND MAP =====
function renderMind(filter = '') {
  const container = document.getElementById('mind-chapters');
  const chapters = getChapters();
  container.innerHTML = chapters.map((ch, i) => {
    const knowledge = KNOWLEDGE.find(k => k.chapter === ch);
    if (!knowledge) return '';
    const title = knowledge.title;
    const points = knowledge.points || [];
    const qCount = getQByChapter(ch).length;

    // Filter
    let filteredPoints = points;
    if (filter) {
      filteredPoints = points.filter(p =>
        p.toLowerCase().includes(filter.toLowerCase()) ||
        title.toLowerCase().includes(filter.toLowerCase()) ||
        ch.toLowerCase().includes(filter.toLowerCase())
      );
      if (filteredPoints.length === 0 && !title.toLowerCase().includes(filter.toLowerCase()) && !ch.toLowerCase().includes(filter.toLowerCase())) return '';
    }

    const pointsHtml = filteredPoints.map((p, pi) => {
      let text = p;
      if (filter) {
        const re = new RegExp(`(${filter.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
        text = text.replace(re, '<mark style="background:#fff3cd;padding:1px 3px;border-radius:3px">$1</mark>');
      }
      return `<div class="point-item">
        <div class="point-num">${pi+1}</div>
        <div class="point-text">${text}</div>
      </div>`;
    }).join('');

    const isOpen = filter.length > 0;
    return `<div class="mind-item">
      <div class="mind-head" onclick="toggleMind(this)">
        <div class="mind-head-left">
          <div class="mind-chapter-num">${i+1}</div>
          <div>
            <div class="mind-chapter-title">${ch} · ${title}</div>
            <div class="mind-chapter-sub">${points.length} 个知识点</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="mind-q-count">${qCount}题</span>
          <span class="mind-toggle">${isOpen ? '▲' : '▼'}</span>
        </div>
      </div>
      <div class="mind-body ${isOpen ? 'open' : ''}">
        <div class="points-grid">${pointsHtml}</div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);
          display:flex;gap:8px;align-items:center">
          <button class="btn btn-primary" style="padding:7px 16px;font-size:12px"
            onclick="event.stopPropagation();practiceByChapter('${ch}')">📝 练习本章</button>
          <span style="font-size:12px;color:var(--text3)">共 ${qCount} 道题</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleMind(head) {
  const body = head.nextElementSibling;
  const toggle = head.querySelector('.mind-toggle');
  body.classList.toggle('open');
  toggle.textContent = body.classList.contains('open') ? '▲' : '▼';
}

function filterMind() {
  const kw = document.getElementById('mind-search').value.trim();
  renderMind(kw);
}

function expandAllMind() {
  document.querySelectorAll('.mind-body').forEach(b => b.classList.add('open'));
  document.querySelectorAll('.mind-toggle').forEach(t => t.textContent = '▲');
}
function collapseAllMind() {
  document.querySelectorAll('.mind-body').forEach(b => b.classList.remove('open'));
  document.querySelectorAll('.mind-toggle').forEach(t => t.textContent = '▼');
}

// ===== INIT =====
function init() {
  load();
  updateHomeStats();
  renderChapterChips();
  initPractice();
  renderMind();
}

// Start
document.addEventListener('DOMContentLoaded', init);
