/* 诗画同源 · 主交互
 * 单页视图切换（hash 路由）：
 *   #/list  #/img  #/authors  #/author/<name>  #/practice  #/quiz  #/duizhang  #/poem/<id>
 * ES2017，无模块，无网络请求。进度存 localStorage。
 */
(function () {
  'use strict';

  var POEMS = window.POEMS || [];
  var IMG_INDEX = window.IMG_INDEX || [];
  var AUTHORS = window.AUTHORS || [];
  var IMG_NAME = {
    moon: '月', sun: '日', star: '星', rain: '雨', snow: '雪霜', wind: '风',
    cloud: '云雾', mountain: '山', water: '江河湖海', willow: '柳',
    flower: '花', grass: '草原', tree: '树木竹', field: '田园', boat: '舟船',
    bird: '鸟禽', horse: '马', building: '楼台桥寺', lamp: '灯火', person: '人物'
  };
  /* 点画出诗：意象 → 诗中检索用字 */
  var IMG_CHAR = {
    moon: '月', sun: '日', star: '星', rain: '雨', snow: '雪', wind: '风',
    cloud: '云', mountain: '山', water: '水', willow: '柳', flower: '花',
    grass: '草', tree: '树', field: '田', boat: '舟', bird: '鸟',
    horse: '马', building: '楼', lamp: '灯', person: '人'
  };
  var SEG_NAMES = ['起', '承', '转', '合'];
  var RHYME_CLASS = ['rhyme-0', 'rhyme-1', 'rhyme-2'];
  var HANZI = /[一-鿿]/;
  var PUNCT = /[，。！？；、：…]/g;
  var REVIEW_INTERVALS = [1, 3, 7, 14, 30]; /* 艾宾浩斯复习间隔（天） */

  /* ---------- 本地进度 ---------- */

  var LS_KEY = 'poemviz.v1';
  var store = {
    data: {},
    load: function () {
      try {
        this.data = JSON.parse(localStorage.getItem(LS_KEY)) || {};
      } catch (e) { this.data = {}; }
      /* 旧版只有诗句接龙有成绩，迁移到统一的 best.* 记录 */
      if (this.data._quizBest && this.data._quizBest.score !== undefined) {
        var old = this.data._quizBest.score;
        if (!this.data['best.quiz'] || old > this.data['best.quiz'].n) {
          this.data['best.quiz'] = { n: old };
        }
      }
    },
    save: function () {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); } catch (e) {}
    },
    get: function (id) { return this.data[id] || {}; },
    mark: function (id, key) {
      if (!this.data[id]) this.data[id] = {};
      this.data[id][key] = Date.now();
      this.save();
    },
    recite: function (id) {
      /* 首次背诵 stage=0；复习会背后 stage 递增；同时记录背诵日志 */
      var g = this.data[id] || {};
      g.stage = g.recited ? Math.min((g.stage || 0) + 1, REVIEW_INTERVALS.length) : 0;
      g.recited = Date.now();
      this.data[id] = g;
      var log = this.data._log || [];
      log.push(Date.now());
      if (log.length > 300) log = log.slice(-300);
      this.data._log = log;
      this.save();
    },
    awards: function () { return this.data._awards || []; },
    addAward: function (tier) {
      var a = this.awards().slice();
      a.push(tier);
      this.data._awards = a;
      this.save();
    }
  };
  store.load();

  /* ---------- 工具 ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /* 无障碍：让 span/div 扮演按钮时可聚焦、可键盘触发（Chrome 61 基线能力） */
  function btnify(node, label) {
    node.setAttribute('role', 'button');
    node.tabIndex = 0;
    if (label !== undefined) node.setAttribute('aria-label', label);
    node.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        node.click();
      }
    });
    return node;
  }

  /* 滚动记忆：进入子视图前记住来源视图的滚动位置，返回时恢复 */
  function saveScroll(view) {
    state.scrollMem[view] = window.pageYOffset || document.documentElement.scrollTop || 0;
  }
  function restoreScroll(view) {
    var y = state.scrollMem[view];
    delete state.scrollMem[view];
    if (y) {
      requestAnimationFrame(function () { window.scrollTo(0, y); });
    }
  }

  function toast(msg) {
    var t = el('div', 'toast', msg);
    document.body.appendChild(t);
    setTimeout(function () { t.parentNode && t.parentNode.removeChild(t); }, 1800);
  }

  function findPoem(id) {
    for (var i = 0; i < POEMS.length; i++) {
      if (POEMS[i].id === id) return POEMS[i];
    }
    return null;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function hanziCount(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) if (HANZI.test(s.charAt(i))) n++;
    return n;
  }

  function stripPunct(s) { return s.replace(PUNCT, ''); }

  function bridge() {
    return (window.xhs && window.xhs.miniTool) || null;
  }

  function bridgeSave(dataUrl, done) {
    var b = bridge();
    if (!b || typeof b.saveImageToPhotosAlbum !== 'function') {
      toast('当前环境不支持保存相册');
      return;
    }
    b.saveImageToPhotosAlbum({ filePath: dataUrl }).then(function () {
      toast('已保存到相册');
      done && done();
    }).catch(function (err) {
      toast((err && err.errMsg) || '保存失败');
    });
  }

  function bridgePost(dataUrl, poem, done) {
    var b = bridge();
    if (!b || typeof b.postNote !== 'function') {
      toast('当前环境不支持发笔记');
      return;
    }
    b.postNote({
      title: poem ? poem.t : '我的诗词打卡',
      content: poem ? '【' + poem.d + '】' + poem.a + '\n' + poem.l.join('')
        : '我用「诗画同源」学古诗啦',
      pageType: 'photo_publish',
      mediaInfo: { image_resources: [{ url: dataUrl }] }
    }).then(function () {
      done && done();
    }).catch(function (err) {
      toast((err && err.errMsg) || '已取消');
    });
  }

  /* 卡片弹层：预览 + 按能力提供 发笔记/存相册 */
  function showCardSheet(title, canvas, poemForPost) {
    var dataUrl;
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch (e) {
      toast('生成图片失败');
      return;
    }
    var br = bridge();
    var mask = el('div', 'mask');
    var sheet = el('div', 'sheet');
    sheet.appendChild(el('div', 'sheet-title', title));

    function close() {
      mask.parentNode && mask.parentNode.removeChild(mask);
      sheet.parentNode && sheet.parentNode.removeChild(sheet);
    }
    mask.addEventListener('click', close);

    if (br) {
      var btnNote = el('button', 'sheet-btn primary', '发笔记分享');
      btnNote.addEventListener('click', function () {
        bridgePost(dataUrl, poemForPost, close);
      });
      var btnSave = el('button', 'sheet-btn', '保存到相册');
      btnSave.addEventListener('click', function () { bridgeSave(dataUrl, close); });
      sheet.appendChild(btnNote);
      sheet.appendChild(btnSave);
    } else {
      var img = document.createElement('img');
      img.className = 'sheet-preview';
      img.src = dataUrl;
      img.alt = title;
      sheet.appendChild(img);
      sheet.appendChild(el('div', 'sheet-hint', '浏览器预览模式：长按图片可保存'));
    }
    var btnCancel = el('button', 'sheet-btn', '取消');
    btnCancel.addEventListener('click', close);
    sheet.appendChild(btnCancel);

    document.body.appendChild(mask);
    document.body.appendChild(sheet);
  }

  /* 当前 hash 顶层路由（#/quiz -> quiz），供异步回调用做「视图守卫」 */
  function inView(name) {
    var h = location.hash.replace(/^#\/?/, '');
    return h.split('/')[0] === name || (name === 'list' && h === '');
  }

  /* 通用动作面板：一组 { label, hint, run } 选项，点选后执行 */
  function openCardHub(title, options) {
    var mask = el('div', 'mask');
    var sheet = el('div', 'sheet');
    sheet.appendChild(el('div', 'sheet-title', title));

    function close() {
      mask.parentNode && mask.parentNode.removeChild(mask);
      sheet.parentNode && sheet.parentNode.removeChild(sheet);
    }
    mask.addEventListener('click', close);

    options.forEach(function (opt) {
      var row = el('div', 'hub-row');
      var label = el('div', 'hub-label', opt.label);
      row.appendChild(label);
      if (opt.hint) row.appendChild(el('div', 'hub-hint', opt.hint));
      row.addEventListener('click', function () {
        close();
        if (opt.run) opt.run();
      });
      btnify(row, opt.label);
      sheet.appendChild(row);
    });

    var btnCancel = el('button', 'sheet-btn', '取消');
    btnCancel.addEventListener('click', close);
    sheet.appendChild(btnCancel);

    document.body.appendChild(mask);
    document.body.appendChild(sheet);
  }

  /* ---------- 路由 ---------- */

  var app = document.getElementById('app');
  /* 一级导航（单一数据源：navBar / journey 等页共用） */
  var TABS = [['list', '诗集'], ['img', '意象'], ['authors', '诗人'],
    ['journey', '诗径'], ['practice', '练习']];
  /* 各视图的返回目标由各调用点显式传入 backBtn(text, fallback) */
  var state = {
    grade: 0,
    query: '',
    reviewOnly: false,
    showPy: true,
    showTone: true,
    recite: 0,      /* 隐藏强度：0 关 / 1 首字提示 / 2 半隐 / 3 全隐挑战 */
    pair: 0,        /* 亲子对背：0 关 / 4 我背出句 / 5 我背对句（与 recite 正交） */
    revealed: {},
    openLine: -1,
    view: 'list',   /* 当前顶层视图（list/img/authors/journey/practice） */
    scrollMem: {}   /* 各列表视图离开时的滚动位置（返回时恢复） */
  };

  function route() {
    var hash = location.hash.replace(/^#\/?/, '');
    var parts = hash.split('/');
    var v = parts[0];
    var prevView = state.view;
    /* 畸形/截断的 % 编码不抛 URIError，回退原串走正常列表页 */
    function dec(s) {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    }
    if (v === 'poem' && parts[1]) renderDetail(parts[1]);
    else if (v === 'img') renderImagery(parts[1] ? dec(parts[1]) : null);
    else if (v === 'authors') renderAuthors();
    else if (v === 'author' && parts[1]) renderAuthor(dec(parts[1]));
    else if (v === 'practice') renderPractice();
    else if (v === 'quiz') renderQuiz();
    else if (v === 'duizhang') renderDuizhang();
    else if (v === 'guess') renderGuess();
    else if (v === 'buhua') renderBuhua();
    else if (v === 'puzzle') renderPuzzle();
    else if (v === 'duizi') renderDuizi();
    else if (v === 'feihua') renderFeihua();
    else if (v === 'journey') renderJourney();
    else if (v === 'list' && parts[1]) {
      /* 旧入口 #/list/<意象>：先解码一次再重新编码，避免二次编码 */
      var legacyKey = dec(parts[1]);
      location.hash = '#/img/' + encodeURIComponent(legacyKey);
    } else {
      /* 筛选是「诗集」tab 的会话状态：同 tab 内进出详情保留；
         从其它一级 tab 切回时清空，避免带着旧筛选一头雾水 */
      if (prevView !== 'list') {
        state.grade = 0;
        state.query = '';
        state.reviewOnly = false;
      }
      state.view = 'list';
      renderList();
    }
  }

  function navBar(active) {
    var nav = el('div', 'nav');
    TABS.forEach(function (it) {
      var n = el('span', 'nav-item' + (active === it[0] ? ' active' : ''), it[1]);
      n.addEventListener('click', function () { location.hash = '#/' + it[0]; });
      btnify(n);
      nav.appendChild(n);
    });
    return nav;
  }

  /* 统一返回：优先浏览器历史；无历史（深链直达）时落到页面兜底目标 */
  function backBtn(text, fallback) {
    var back = el('span', 'back-btn', text || '← 返回');
    back.addEventListener('click', function () {
      if (window.history.length > 1) window.history.back();
      else location.hash = fallback || '#/list';
    });
    btnify(back);
    var row = el('div', 'back-row');
    row.appendChild(back);
    return row;
  }

  /* ---------- 复习调度 ---------- */

  function duePoems() {
    var now = Date.now();
    return POEMS.filter(function (p) {
      var g = store.get(p.id);
      if (!g.recited) return false;
      var stage = g.stage || 0;
      if (stage >= REVIEW_INTERVALS.length) return false;
      return now - g.recited > REVIEW_INTERVALS[stage] * 86400000;
    });
  }

  function recitedCount() {
    var n = 0;
    POEMS.forEach(function (p) { if (store.get(p.id).recited) n++; });
    return n;
  }

  function dayKey(d) {
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function weeklyStats() {
    var now = new Date();
    var from = new Date(now.getTime() - 7 * 86400000);
    var log = store.data._log || [];
    var days = {};
    var weekCount = 0;
    log.forEach(function (ts) {
      if (ts >= from.getTime()) {
        weekCount++;
        days[dayKey(new Date(ts))] = true;
      }
    });
    var streak = 0;
    var cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!days[dayKey(cursor)]) cursor = new Date(cursor.getTime() - 86400000);
    while (days[dayKey(cursor)]) {
      streak++;
      cursor = new Date(cursor.getTime() - 86400000);
    }
    return { weekCount: weekCount, streak: streak, total: recitedCount(), from: from, to: now };
  }

  /* ---------- 列表页 ---------- */

  /* 诗卡片水墨缩略图：懒渲染 + dataURL 缓存（筛选重排时零成本复用）
   * IntersectionObserver 在 Chrome 51+ 可用；更老环境回退为直接渲染 */
  var thumbCache = {};
  var thumbObserver = null;
  if ('IntersectionObserver' in window) {
    thumbObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        thumbObserver.unobserve(en.target);
        renderThumb(en.target);
      });
    }, { rootMargin: '240px' });
  }
  function renderThumb(cv) {
    var p = cv._poem;
    if (!p || !window.PoemScene) return;
    window.PoemScene.render(cv, p, {});
    try { thumbCache[p.id] = cv.toDataURL('image/png'); } catch (e) {}
  }
  function poemThumb(p) {
    var box = el('div', 'pc-thumb');
    if (thumbCache[p.id]) {
      var img = document.createElement('img');
      img.src = thumbCache[p.id];
      img.alt = '';
      box.appendChild(img);
      return box;
    }
    var cv = document.createElement('canvas');
    cv.width = 144;
    cv.height = 176;
    cv._poem = p;
    box.appendChild(cv);
    if (thumbObserver) thumbObserver.observe(cv);
    else renderThumb(cv);
    return box;
  }

  function poemCard(p) {
    var card = el('div', 'poem-card');
    card.appendChild(poemThumb(p));
    var body = el('div', 'pc-body');
    var head = el('div', 'pc-head');
    head.appendChild(el('span', 'pc-title', p.t));
    head.appendChild(el('span', 'pc-meta', '【' + p.d + '】' + p.a));
    body.appendChild(head);
    body.appendChild(el('div', 'pc-line', p.l[0].replace(/[，。！？；、：…]$/, '')));
    var foot = el('div', 'pc-foot');
    foot.appendChild(el('span', 'pc-grade', p.g + '年级' + (p.s || '')));
    var prog = store.get(p.id);
    if (prog.recited) foot.appendChild(el('span', 'pc-done', '已背诵 ✓'));
    else if (prog.read) foot.appendChild(el('span', 'pc-done', '已读'));
    if (p.tg.length) foot.appendChild(el('span', 'pc-tags', p.tg.slice(0, 2).join(' · ')));
    body.appendChild(foot);
    card.appendChild(body);
    card.addEventListener('click', function () {
      saveScroll(navKey());
      location.hash = '#/poem/' + p.id;
    });
    btnify(card, p.t);
    return card;
  }

  /* 当前列表视图的滚动记忆键（与 location.hash 一致，便于返回时精确恢复） */
  function navKey() {
    var h = location.hash;
    if (!h || h === '#/' || h === '#/list') return 'list';
    return h.replace(/^#\//, '');
  }

  function filterPoems() {
    var q = state.query.trim();
    var due = state.reviewOnly ? duePoems() : null;
    return POEMS.filter(function (p) {
      if (due && due.indexOf(p) < 0) return false;
      if (state.grade && p.g !== state.grade) return false;
      if (q) {
        var hay = p.t + p.a + p.d + p.l.join('') + p.tg.join('');
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  /* 列表页头部：标题区（品牌 + 一方小印）+ 卡片工坊 + 常驻复习入口 */
  function listHeader(wrap, activeNav) {
    var bar = el('div', 'topbar');
    var brand = el('div', 'brand', '诗画同源');
    brand.appendChild(el('span', 'brand-seal', '诗'));
    bar.appendChild(brand);
    bar.appendChild(el('div', 'sub', '小学必背古诗词 · 一诗一画'));
    wrap.appendChild(bar);
    wrap.appendChild(navBar(activeNav));
    return bar;
  }

  function renderList() {
    app.innerHTML = '';
    window.scrollTo(0, 0);
    var wrap = el('div', 'wrap');
    listHeader(wrap, 'list');
    /* 复习队列为空时自动退出复习模式，避免空列表 */
    if (state.reviewOnly && !duePoems().length) state.reviewOnly = false;

    /* 卡片入口收进搜索行，避免在首页形成孤立的一整行操作 */
    var cardBtn = el('span', 'card-inline', '卡片');
    cardBtn.addEventListener('click', function () {
      var today = new Date();
      openCardHub('卡片工坊', [
        { label: '今日日签', hint: '按节气/每日一诗挑一首', run: function () {
          var pick = poemOfDay(today);
          showCardSheet(pick.subtitle + ' · ' + pick.poem.t,
            window.PoemCards.composeDateCard(pick.poem, today, pick.subtitle), pick.poem);
        } },
        { label: '本周战报', hint: '本周背诵小结 · 可存相册/发笔记', run: function () {
          showCardSheet('本周背诗战报', window.PoemCards.composeWeeklyCard(weeklyStats()), null);
        } }
      ]);
    });
    btnify(cardBtn);

    var searchBox = el('div', 'search-box');
    var input = el('input');
    input.type = 'search';
    input.placeholder = '搜索诗名 / 作者 / 诗句';
    input.value = state.query;
    var searchTimer = null;
    input.addEventListener('input', function () {
      state.query = input.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { refreshCards(listHost); }, 150);
    });
    searchBox.appendChild(input);
    searchBox.appendChild(cardBtn);
    wrap.appendChild(searchBox);

    var chips = el('div', 'grade-chips');

    /* 常驻「待复习」入口：有到期即显示数量，可一键进入/退出复习队列 */
    var due = duePoems();
    if (state.reviewOnly || due.length) {
      var rvText = state.reviewOnly
        ? (due.length ? '待复习 ' + due.length + ' 首 ✕' : '全部复习完 ✕')
        : '待复习 ' + due.length + ' 首';
      var rv = el('span', 'chip' + (state.reviewOnly ? ' active' : ''), rvText);
      rv.addEventListener('click', function () {
        state.reviewOnly = !state.reviewOnly;
        renderList();
      });
      btnify(rv);
      chips.appendChild(rv);
    }
    var grades = [['全部', 0], ['一', 1], ['二', 2], ['三', 3], ['四', 4], ['五', 5], ['六', 6]];
    grades.forEach(function (gv) {
      var c = el('span', 'chip' + (state.grade === gv[1] ? ' active' : ''), gv[0]);
      c.addEventListener('click', function () {
        state.grade = gv[1];
        renderList();
      });
      btnify(c);
      chips.appendChild(c);
    });
    wrap.appendChild(chips);

    var listHost = el('div');
    wrap.appendChild(listHost);
    app.appendChild(wrap);
    refreshCards(listHost);
    restoreScroll('list');
  }

  function refreshCards(host) {
    host.innerHTML = '';
    var list = filterPoems();
    if (!list.length) {
      host.appendChild(el('div', 'empty-tip', '没有找到相关诗词'));
      return;
    }
    list.forEach(function (p) { host.appendChild(poemCard(p)); });
  }

  /* ---------- 意象页 ---------- */

  /* 意象页：长廊 chips + 页内过滤诗单（#/img/<key>），不再跳到诗集 tab */
  function renderImagery(filterKey) {
    app.innerHTML = '';
    window.scrollTo(0, 0);
    var wrap = el('div', 'wrap');
    var bar = el('div', 'topbar');
    bar.appendChild(el('div', 'brand', '意象长廊'));
    bar.appendChild(el('div', 'sub', '点一个意象，看它藏在哪些诗里'));
    wrap.appendChild(bar);
    wrap.appendChild(navBar('img'));
    state.view = 'img';

    var cloud = el('div', 'img-cloud');
    IMG_INDEX.forEach(function (it) {
      var active = filterKey === it.k;
      var chip = el('span', 'img-chip' + (active ? ' active' : ''));
      chip.appendChild(el('span', 'ic-name', IMG_NAME[it.k] || it.k));
      chip.appendChild(el('span', 'ic-count', it.n + ' 首'));
      chip.addEventListener('click', function () {
        if (active) location.hash = '#/img';
        else location.hash = '#/img/' + encodeURIComponent(it.k);
      });
      btnify(chip, (IMG_NAME[it.k] || it.k) + ' 意象');
      cloud.appendChild(chip);
    });
    wrap.appendChild(cloud);

    if (filterKey) {
      var list = POEMS.filter(function (p) { return p.img.indexOf(filterKey) >= 0; });
      var hint = el('div', 'img-filter-head');
      var clear = el('span', 'chip', '✕ 收起诗单');
      clear.addEventListener('click', function () { location.hash = '#/img'; });
      btnify(clear);
      hint.appendChild(el('span', 'img-filter-name',
        '「' + (IMG_NAME[filterKey] || filterKey) + '」 · ' + list.length + ' 首'));
      hint.appendChild(clear);
      wrap.appendChild(hint);
      var listHost = el('div');
      wrap.appendChild(listHost);
      app.appendChild(wrap);
      if (list.length) list.forEach(function (p) { listHost.appendChild(poemCard(p)); });
      else listHost.appendChild(el('div', 'empty-tip', '暂无诗词'));
    } else {
      app.appendChild(wrap);
    }
    restoreScroll(navKey());
  }

  /* ---------- 诗人页 ---------- */

  function renderAuthors() {
    app.innerHTML = '';
    window.scrollTo(0, 0);
    var wrap = el('div', 'wrap');
    var bar = el('div', 'topbar');
    bar.appendChild(el('div', 'brand', '诗人名录'));
    bar.appendChild(el('div', 'sub', '认识写诗的人'));
    wrap.appendChild(bar);
    wrap.appendChild(navBar('authors'));
    state.view = 'authors';

    AUTHORS.forEach(function (a) {
      var row = el('div', 'poem-card');
      var body = el('div', 'pc-body');
      var head = el('div', 'pc-head');
      head.appendChild(el('span', 'pc-title', a.n));
      var meta = '【' + a.d + '】';
      if (a.ti) meta += ' ' + a.ti;
      if (a.ly) meta += ' ' + a.ly;
      head.appendChild(el('span', 'pc-meta', meta));
      body.appendChild(head);
      body.appendChild(el('div', 'pc-line', a.br));
      var foot = el('div', 'pc-foot');
      foot.appendChild(el('span', 'pc-grade', '入选 ' + a.ids.length + ' 首'));
      body.appendChild(foot);
      row.appendChild(body);
      row.addEventListener('click', function () {
        saveScroll(navKey());
        location.hash = '#/author/' + encodeURIComponent(a.n);
      });
      btnify(row, '诗人 ' + a.n);
      wrap.appendChild(row);
    });
    app.appendChild(wrap);
    restoreScroll('authors');
  }

  function renderAuthor(name) {
    var author = null;
    for (var i = 0; i < AUTHORS.length; i++) {
      if (AUTHORS[i].n === name) { author = AUTHORS[i]; break; }
    }
    if (!author) { location.hash = '#/authors'; return; }

    app.innerHTML = '';
    window.scrollTo(0, 0);
    var wrap = el('div', 'wrap');
    wrap.appendChild(backBtn('← 返回', '#/authors'));

    var head = el('div', 'author-head');
    var sealBox = el('div', 'author-seal', author.n.charAt(0));
    head.appendChild(sealBox);
    var info = el('div', 'author-info');
    info.appendChild(el('div', 'author-name', author.n +
      (author.ti ? '　' + author.ti : '')));
    info.appendChild(el('div', 'author-meta',
      author.d + (author.ly ? ' · ' + author.ly : '')));
    head.appendChild(info);
    wrap.appendChild(head);

    if (author.br) wrap.appendChild(section('生平简介', author.br, true));

    wrap.appendChild(el('div', 'author-poems-title',
      '入选必背 ' + author.ids.length + ' 首'));
    author.ids.forEach(function (pid) {
      var p = findPoem(pid);
      if (p) wrap.appendChild(poemCard(p));
    });
    app.appendChild(wrap);
    restoreScroll('author/' + encodeURIComponent(name));
  }

  /* 练习中心 */
  var GAME_META = {
    quiz: ['诗句接龙', '给上句，接下句 · 10 题一组', '#/quiz', '分数', 10],
    guess: ['意象猜诗', '只看画，猜是哪首诗', '#/guess', '分数', 5],
    buhua: ['补画', '画里少了什么？补上正确的意象', '#/buhua', '分数', 5],
    puzzle: ['诗序拼图', '诗句被打乱了，点两张卡片交换位置复原', '#/puzzle', '', 0],
    duizhang: ['对仗连连看', '律诗对仗字配对 · 感受格律之美', '#/duizhang', '对', 0],
    duizi: ['平仄对对子', '按平仄提示，填出对句的字', '#/duizi', '分数', 5],
    feihua: ['飞花令', '人机对令：轮流说出含令字的诗句', '#/feihua', '轮', 0]
  };

  /* 各游戏最佳成绩：best.<key> = { n: 最佳值 }，展示在练习中心入口上 */
  function bestGet(key) {
    return store.get('best.' + key).n || 0;
  }
  function bestSet(key, n) {
    var cur = store.get('best.' + key).n || 0;
    if (n > cur) {
      store.data['best.' + key] = { n: n };
      store.save();
    }
  }

  function renderPractice() {
    app.innerHTML = '';
    window.scrollTo(0, 0);
    var wrap = el('div', 'wrap');
    var bar = el('div', 'topbar');
    bar.appendChild(el('div', 'brand', '练习'));
    bar.appendChild(el('div', 'sub', '背完来测一测 · 记录你的最好成绩'));
    wrap.appendChild(bar);
    wrap.appendChild(navBar('practice'));
    state.view = 'practice';

    Object.keys(GAME_META).forEach(function (key) {
      var m = GAME_META[key];
      var card = el('div', 'poem-card practice-card');
      var body = el('div', 'pc-body');
      var head = el('div', 'practice-head');
      head.appendChild(el('div', 'pc-title', m[0]));
      head.appendChild(el('span', 'practice-arrow', '开始 ›'));
      body.appendChild(head);
      var bestN = bestGet(key);
      body.appendChild(el('div', 'pc-line', m[1]));
      var foot = el('div', 'pc-foot practice-foot');
      foot.appendChild(el('span', 'pc-grade', bestN > 0
        ? (m[4] ? '最佳 ' + bestN + ' / ' + m[4] : '最佳 ' + bestN + ' ' + m[3])
        : '尚未挑战'));
      body.appendChild(foot);
      card.appendChild(body);
      card.addEventListener('click', function () {
        saveScroll(navKey());
        location.hash = m[2];
      });
      btnify(card, m[0]);
      wrap.appendChild(card);
    });

    app.appendChild(wrap);
    restoreScroll(navKey());
  }

  /* ---------- 诗句接龙（上句接下句） ---------- */

  function genQuiz(n) {
    var pool = POEMS.filter(function (p) { return p.l.length >= 2; });
    var qs = [];
    var used = {};
    var guard = 0;
    while (qs.length < n && guard++ < 200) {
      var p = pool[Math.floor(Math.random() * pool.length)];
      var i = Math.floor(Math.random() * (p.l.length - 1));
      var key = p.id + '-' + i;
      if (used[key]) continue;
      used[key] = true;
      var correct = stripPunct(p.l[i + 1]);
      var len = hanziCount(correct);
      /* 干扰项：等长句优先 */
      var distract = [];
      var g2 = 0;
      while (distract.length < 3 && g2++ < 300) {
        var q = POEMS[Math.floor(Math.random() * POEMS.length)];
        var cand = stripPunct(q.l[Math.floor(Math.random() * q.l.length)]);
        if (q.id === p.id || distract.indexOf(cand) >= 0 || cand === correct) continue;
        if (hanziCount(cand) !== len && distract.length < 2) continue;
        distract.push(cand);
      }
      if (distract.length < 3) continue;
      qs.push({
        prompt: stripPunct(p.l[i]),
        answer: correct,
        options: shuffle([correct].concat(distract)),
        from: '《' + p.t + '》' + p.a
      });
    }
    return qs;
  }

  function renderQuiz() {
    var qs = genQuiz(10);
    if (qs.length < 5) { location.hash = '#/practice'; return; }
    var idx = 0, score = 0;

    function draw() {
      if (!inView('quiz')) return;
      app.innerHTML = '';
      window.scrollTo(0, 0);
    window.scrollTo(0, 0);
      var wrap = el('div', 'wrap');
      wrap.appendChild(backBtn('← 退出', '#/practice'));

      if (idx >= qs.length) {
        /* 结算 */
        var done = el('div', 'quiz-result');
        done.appendChild(el('div', 'qr-score', score + ' / ' + qs.length));
        done.appendChild(el('div', 'qr-text',
          score >= 8 ? '太厉害了，诗词小达人！' :
          score >= 5 ? '不错，继续加油！' : '多读几遍，再来挑战！'));
        var hadBest = bestGet('quiz');
        if (score > hadBest) {
          bestSet('quiz', score);
          done.appendChild(el('div', 'qr-text', '新纪录！'));
        }
        var again = el('button', 'sheet-btn primary', '再来一组');
        again.addEventListener('click', renderQuiz);
        var back = el('button', 'sheet-btn', '返回练习中心');
        back.addEventListener('click', function () { location.hash = '#/practice'; });
        done.appendChild(again);
        done.appendChild(back);
        wrap.appendChild(done);
        app.appendChild(wrap);
        return;
      }

      var q = qs[idx];
      var prog = el('div', 'quiz-progress',
        '第 ' + (idx + 1) + ' / ' + qs.length + ' 题　得分 ' + score);
      wrap.appendChild(prog);

      var card = el('div', 'quiz-card');
      card.appendChild(el('div', 'qc-from', q.from));
      card.appendChild(el('div', 'qc-prompt', q.prompt));
      card.appendChild(el('div', 'qc-hint', '下一句是？'));
      wrap.appendChild(card);

      var optHost = el('div', 'quiz-options');
      q.options.forEach(function (opt) {
        var b = el('div', 'quiz-option', opt);
        b.addEventListener('click', function () {
          if (optHost.getAttribute('data-done')) return;
          optHost.setAttribute('data-done', '1');
          var right = opt === q.answer;
          if (right) score++;
          var opts = optHost.querySelectorAll('.quiz-option');
          for (var i = 0; i < opts.length; i++) {
            if (opts[i].textContent === q.answer) opts[i].className += ' right';
          }
          if (!right) b.className += ' wrong';
          setTimeout(function () { idx++; draw(); }, 900);
        });
        btnify(b, opt);
        optHost.appendChild(b);
      });
      wrap.appendChild(optHost);
      app.appendChild(wrap);
    }
    draw();
  }

  /* ---------- 对仗连连看 ---------- */

  function renderDuizhang() {
    var pool = [];
    POEMS.forEach(function (p) {
      (p.cpl || []).forEach(function (cp) {
        pool.push({ poem: p, a: cp[0], b: cp[1] });
      });
    });
    if (!pool.length) { location.hash = '#/practice'; return; }

    var round = 0, matched = 0, totalMatched = 0;
    var ROUNDS = 5;
    var sel = null; /* 左侧选中 */

    function draw() {
      if (!inView('duizhang')) return;
      app.innerHTML = '';
      window.scrollTo(0, 0);
    window.scrollTo(0, 0);
      var wrap = el('div', 'wrap');
      wrap.appendChild(backBtn('← 退出', '#/practice'));

      if (round >= ROUNDS) {
        bestSet('duizhang', totalMatched);
        var done = el('div', 'quiz-result');
        done.appendChild(el('div', 'qr-score', totalMatched + ' 对'));
        done.appendChild(el('div', 'qr-text', '对仗感受如何？再来一组巩固一下'));
        var again = el('button', 'sheet-btn primary', '再来一组');
        again.addEventListener('click', renderDuizhang);
        var back = el('button', 'sheet-btn', '返回练习中心');
        back.addEventListener('click', function () { location.hash = '#/practice'; });
        done.appendChild(again);
        done.appendChild(back);
        wrap.appendChild(done);
        app.appendChild(wrap);
        return;
      }

      var item = pool[Math.floor(Math.random() * pool.length)];
      var lineA = item.poem.l[item.a];
      var lineB = item.poem.l[item.b];
      var charsA = [];
      var charsB = [];
      var i, ch;
      for (i = 0; i < lineA.length; i++) {
        ch = lineA.charAt(i);
        if (HANZI.test(ch)) charsA.push({ ch: ch, pos: charsA.length });
      }
      for (i = 0; i < lineB.length; i++) {
        ch = lineB.charAt(i);
        if (HANZI.test(ch)) charsB.push({ ch: ch, pos: charsB.length });
      }
      charsA = shuffle(charsA);
      charsB = shuffle(charsB);
      matched = 0;
      sel = null;

      wrap.appendChild(el('div', 'quiz-progress',
        '第 ' + (round + 1) + ' / ' + ROUNDS + ' 联 · 出自《' + item.poem.t + '》' +
        item.poem.a));
      wrap.appendChild(el('div', 'dz-tip',
        '左边出句，右边对句。点左边一个字，再点右边与它「对仗」的字'));

      var board = el('div', 'dz-board');
      var colA = el('div', 'dz-col');
      var colB = el('div', 'dz-col');

      function tryMatch() {
        if (matched >= charsA.length) {
          round++;
          totalMatched += charsA.length;
          setTimeout(draw, 700);
        }
      }

      charsA.forEach(function (ca) {
        var t = el('div', 'dz-tile', ca.ch);
        t.addEventListener('click', function () {
          if (t.getAttribute('data-lock')) return;
          var prev = colA.querySelector('.dz-tile.sel');
          if (prev) prev.className = 'dz-tile';
          t.className = 'dz-tile sel';
          sel = { pos: ca.pos, node: t };
        });
        btnify(t, ca.ch + ' 出句字');
        colA.appendChild(t);
      });
      charsB.forEach(function (cb) {
        var t = el('div', 'dz-tile', cb.ch);
        t.addEventListener('click', function () {
          if (t.getAttribute('data-lock') || !sel) return;
          if (cb.pos === sel.pos) {
            t.setAttribute('data-lock', '1');
            sel.node.setAttribute('data-lock', '1');
            t.className = 'dz-tile ok';
            sel.node.className = 'dz-tile ok';
            sel = null;
            matched++;
            tryMatch();
          } else {
            t.className = 'dz-tile bad';
            setTimeout(function () { t.className = 'dz-tile'; }, 400);
          }
        });
        btnify(t, cb.ch + ' 对句字');
        colB.appendChild(t);
      });

      board.appendChild(colA);
      board.appendChild(colB);
      wrap.appendChild(board);
      app.appendChild(wrap);
    }
    draw();
  }

  /* ---------- 详情页 ---------- */

  function renderDetail(id) {
    var p = findPoem(id);
    if (!p) { location.hash = '#/list'; return; }
    store.mark(id, 'read');
    state.recite = 0;
    state.pair = 0;
    state.revealed = {};
    state.openLine = -1;

    app.innerHTML = '';
    window.scrollTo(0, 0);
    var wrap = el('div', 'wrap');
    wrap.appendChild(backBtn('← 返回', '#/list'));

    /* 诗意图 */
    var sceneBox = el('div', 'scene-box');
    var canvas = document.createElement('canvas');
    sceneBox.appendChild(canvas);
    wrap.appendChild(sceneBox);

    /* 标题 + 可点击的作者 */
    var head = el('div', 'poem-head');
    head.appendChild(el('div', 'ph-title', p.t));
    var meta = el('div', 'ph-meta');
    meta.appendChild(document.createTextNode('【' + p.d + '】'));
    var authorLink = el('span', 'author-link', p.a);
    authorLink.addEventListener('click', function () {
      location.hash = '#/author/' + encodeURIComponent(p.a);
    });
    btnify(authorLink, '查看诗人 ' + p.a);
    meta.appendChild(authorLink);
    meta.appendChild(document.createTextNode('　' + p.g + '年级' + (p.s || '') + '册'));
    head.appendChild(meta);
    wrap.appendChild(head);

    /* 工具条：视图开关 + 玩法 + 统一「卡片工坊」（诗画卡/字帖/日签/合照卡收进二级面板） */
    var bar = el('div', 'toolbar');
    var btnPy = el('span', 'tool' + (state.showPy ? ' on' : ''), '拼音');
    var btnTone = el('span', 'tool' + (state.showTone ? ' on' : ''), '平仄');
    var btnFog = el('span', 'tool', '拂雾看画');
    var btnWrite = el('span', 'tool', '画笔写诗');
    var btnCards = el('span', 'tool', '卡片工坊');
    var photoInput = document.createElement('input');
    photoInput.type = 'file';
    photoInput.accept = 'image/*';
    photoInput.style.display = 'none';
    photoInput.addEventListener('change', function () {
      var file = photoInput.files && photoInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          showCardSheet('诗画合照 · ' + p.t, window.PoemCards.composePhotoCard(p, img, new Date()), p);
        };
        img.onerror = function () { toast('请选择图片文件'); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
      photoInput.value = '';
    });
    btnPy.addEventListener('click', function () {
      state.showPy = !state.showPy;
      btnPy.className = 'tool' + (state.showPy ? ' on' : '');
      refreshVerse(verseHost, p);
    });
    btnTone.addEventListener('click', function () {
      state.showTone = !state.showTone;
      btnTone.className = 'tool' + (state.showTone ? ' on' : '');
      refreshVerse(verseHost, p);
    });
    btnFog.addEventListener('click', function () {
      toggleFog(sceneBox, canvas, btnFog);
    });
    btnWrite.addEventListener('click', function () {
      brushWrite(p, verseHost);
    });
    btnCards.addEventListener('click', function () {
      openCardHub('做一张卡片', [
        { label: '诗画卡', hint: '这首诗的水墨画 + 诗文', run: function () {
          showCardSheet('诗画卡 · ' + p.t, window.PoemScene.composeCard(p), p);
        } },
        { label: '描红字帖', hint: '田字格描红 · 每行首字为示范', run: function () {
          showCardSheet('描红字帖 · ' + p.t, window.PoemCards.composeCopybook(p), null);
        } },
        { label: '今日日签', hint: '把这首诗做成每日一诗日签', run: function () {
          var term = nearTerm(new Date());
          var sub = term ? '今日' + term[0] : '每日一诗';
          showCardSheet(sub + ' · ' + p.t,
            window.PoemCards.composeDateCard(p, new Date(), sub), p);
        } },
        { label: '合照卡', hint: '选一张孩子照片与本诗同框', run: function () { photoInput.click(); } }
      ]);
    });
    btnify(btnPy); btnify(btnTone); btnify(btnFog); btnify(btnWrite); btnify(btnCards);
    bar.appendChild(btnPy);
    bar.appendChild(btnTone);
    bar.appendChild(btnFog);
    bar.appendChild(btnWrite);
    bar.appendChild(btnCards);
    wrap.appendChild(bar);
    wrap.appendChild(photoInput);

    /* 背诵：隐藏强度（0–3，整行按强度藏字）与亲子对背（0/4/5，按奇偶行分角色）正交 */
    var rcBar = el('div', 'recite-bar');
    var maskGroup = el('div', 'recite-group');
    maskGroup.appendChild(el('div', 'rc-label', '背诵强度'));
    var maskOptions = el('div', 'recite-options');
    maskGroup.appendChild(maskOptions);
    [['无', 0], ['首字', 1], ['半隐', 2], ['全隐', 3]].forEach(function (it) {
      var b = el('span', 'rc', it[0]);
      b.setAttribute('data-group', 'mask');
      b.setAttribute('data-value', it[1]);
      b.addEventListener('click', function () {
        state.recite = it[1];
        state.revealed = {};
        paintReciteBar(rcBar);
        refreshVerse(verseHost, p);
        if (it[1] === 3) toast('点击被遮住的字可以偷看哦');
      });
      btnify(b, '背诵强度 ' + it[0]);
      maskOptions.appendChild(b);
    });
    rcBar.appendChild(maskGroup);
    var pairGroup = el('div', 'recite-group');
    pairGroup.appendChild(el('div', 'rc-label', '亲子对背'));
    var pairOptions = el('div', 'recite-options');
    pairGroup.appendChild(pairOptions);
    [['关', 0], ['我背出句', 4], ['我背对句', 5]].forEach(function (it) {
      var b = el('span', 'rc', it[0]);
      b.setAttribute('data-group', 'pair');
      b.setAttribute('data-value', it[1]);
      b.addEventListener('click', function () {
        state.pair = it[1];
        state.revealed = {};
        paintReciteBar(rcBar);
        refreshVerse(verseHost, p);
      });
      btnify(b, '亲子对背 ' + it[0]);
      pairOptions.appendChild(b);
    });
    rcBar.appendChild(pairGroup);
    var rcDone = el('span', 'rc rc-done', '我会背了');
    rcDone.addEventListener('click', function () {
      store.recite(p.id);
      toast('太棒了！已标记为「已背诵」');
      checkAward();
    });
    btnify(rcDone);
    rcBar.appendChild(rcDone);
    wrap.appendChild(rcBar);
    paintReciteBar(rcBar);

    /* 诗句 */
    var verseHost = el('div');
    wrap.appendChild(verseHost);
    refreshVerse(verseHost, p);

    wrap.appendChild(el('div', 'legend'))
      .innerHTML = '<span class="lg-ping">○ 平声</span>　<span class="lg-ze">● 仄声</span>' +
      '　<span style="color:#b03a2e">-</span> 押韵字（按普通话声调标注）';

    /* 译文 / 注释 / 赏析 / 背景 */
    wrap.appendChild(section('白话译文', p.tr, true));
    if (p.an.length) {
      var annoText = p.an.map(function (a) { return a.w + '：' + a.m; }).join('　');
      wrap.appendChild(section('字词注释', annoText, false));
    }
    wrap.appendChild(section('赏析', p.ap, false));
    if (p.bg) wrap.appendChild(section('创作背景', p.bg, false));

    app.appendChild(wrap);

    /* 画布渲染：先离屏画好，再画卷展开动画 */
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cssW = sceneBox.clientWidth || 320;
    /* 首屏优先留给诗文，画面采用更适合移动端阅读的近方形比例 */
    var cssH = Math.round(cssW * 1.05);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    var off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    window.PoemScene.render(off, p, {});
    /* scene.render 把点画热点挂到传入的离屏画布上，需拷贝到可见画布 */
    canvas._hotspots = off._hotspots || [];
    var ctx = canvas.getContext('2d');
    if (document.hidden || !window.requestAnimationFrame) {
      ctx.drawImage(off, 0, 0);
    } else {
      var t0 = Date.now();
      var DURATION = 750;
      var step = function () {
        var k = Math.min(1, (Date.now() - t0) / DURATION);
        k = 1 - (1 - k) * (1 - k); /* ease-out */
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        /* 自左向右展开画卷 */
        ctx.drawImage(off, 0, 0, off.width * k, off.height,
          0, 0, canvas.width * k, canvas.height);
        if (k < 1) window.requestAnimationFrame(step);
      };
      step();
    }

    /* 点画出诗：点击画中的意象，浮出对应的诗句 */
    canvas.addEventListener('click', function (ev) {
      var spots = canvas._hotspots || [];
      if (!spots.length) return;
      var rect = canvas.getBoundingClientRect();
      var sx = canvas.width / rect.width;
      var x = (ev.clientX - rect.left) * sx;
      var y = (ev.clientY - rect.top) * sx;
      for (var i = spots.length - 1; i >= 0; i--) {
        var s = spots[i];
        var dx = x - s.x, dy = y - s.y;
        if (dx * dx + dy * dy <= s.r * s.r) {
          showFloatLine(sceneBox, (ev.clientX - rect.left), (ev.clientY - rect.top),
            lineForKey(p, s.key));
          return;
        }
      }
    });
  }

  /* 意象 → 最相关的诗句 */
  function lineForKey(p, key) {
    var ch = IMG_CHAR[key];
    if (ch) {
      for (var i = 0; i < p.l.length; i++) {
        if (p.l[i].indexOf(ch) >= 0) return stripPunct(p.l[i]);
      }
    }
    return stripPunct(p.fl[0] || p.l[0]);
  }

  function showFloatLine(box, x, y, text) {
    var f = el('div', 'float-line', text);
    f.style.left = Math.max(8, Math.min(x - 40, box.clientWidth - 120)) + 'px';
    f.style.top = Math.max(8, y - 40) + 'px';
    box.appendChild(f);
    setTimeout(function () { f.parentNode && f.parentNode.removeChild(f); }, 1900);
  }

  /* 拂雾看画：雾层覆盖诗意图，手指拂过散开 */
  function toggleFog(box, canvas, btn) {
    var old = box.querySelector('.fog-layer');
    if (old) {
      old.parentNode.removeChild(old);
      btn.className = 'tool';
      return;
    }
    btn.className = 'tool on';
    var fog = document.createElement('canvas');
    fog.className = 'fog-layer';
    fog.width = canvas.width;
    fog.height = canvas.height;
    var fc = fog.getContext('2d');
    fc.fillStyle = 'rgba(240,235,220,0.97)';
    fc.fillRect(0, 0, fog.width, fog.height);
    /* 雾团纹理 */
    var r = 3;
    function frnd() { r = (r * 9301 + 49297) % 233280; return r / 233280; }
    fc.fillStyle = 'rgba(255,255,255,0.35)';
    for (var i = 0; i < 40; i++) {
      fc.beginPath();
      fc.ellipse(frnd() * fog.width, frnd() * fog.height,
        fog.width * (0.08 + frnd() * 0.1), fog.width * 0.04, 0, 0, Math.PI * 2);
      fc.fill();
    }
    fc.fillStyle = '#8a8474';
    fc.font = fog.width * 0.045 + 'px "KaiTi","STKaiti",serif';
    fc.textAlign = 'center';
    fc.fillText('轻 拂 开 雾 ， 见 诗 中 画', fog.width / 2, fog.height / 2);

    var cols = 10, rows = 13;
    var erased = {};
    var erasedCount = 0;
    var lifting = false;
    function erase(cx, cy) {
      var rad = fog.width * 0.07;
      var g = fc.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      fc.globalCompositeOperation = 'destination-out';
      fc.fillStyle = g;
      fc.beginPath();
      fc.arc(cx, cy, rad, 0, Math.PI * 2);
      fc.fill();
      fc.globalCompositeOperation = 'source-over';
      /* 统计擦除覆盖（网格法，不读像素） */
      var gx = Math.floor(cx / fog.width * cols);
      var gy = Math.floor(cy / fog.height * rows);
      for (var a = gx - 1; a <= gx + 1; a++) {
        for (var b = gy - 1; b <= gy + 1; b++) {
          var key = a + '-' + b;
          if (!erased[key]) { erased[key] = true; erasedCount++; }
        }
      }
      if (!lifting && erasedCount > cols * rows * 0.55) {
        lifting = true;
        fog.style.opacity = '0';
        setTimeout(function () {
          if (fog.parentNode) fog.parentNode.removeChild(fog);
          btn.className = 'tool';
        }, 650);
      }
    }
    function pointAt(ev) {
      var rect = fog.getBoundingClientRect();
      erase((ev.clientX - rect.left) * fog.width / rect.width,
        (ev.clientY - rect.top) * fog.height / rect.height);
    }
    fog.addEventListener('pointerdown', pointAt);
    fog.addEventListener('pointermove', function (ev) {
      if (ev.pointerType === 'mouse' && !ev.buttons) return;
      pointAt(ev);
    });
    box.appendChild(fog);
    toast('用手指把雾拂开');
  }

  /* 画笔写诗：按平仄节奏逐字显现 */
  var writeToken = 0;
  function brushWrite(p, host) {
    refreshVerse(host, p);
    var cells = host.querySelectorAll('.ch');
    if (!cells.length) return;
    var token = ++writeToken;
    var queue = [];
    var i;
    for (i = 0; i < cells.length; i++) {
      cells[i].className += ' w-hide';
      var delay = 90;
      if (cells[i].className.indexOf('tone-ping') >= 0) delay = 420;
      else if (cells[i].className.indexOf('tone-ze') >= 0) delay = 260;
      queue.push({ node: cells[i], delay: delay });
    }
    var pos = 0;
    var prev = null;
    function tick() {
      if (token !== writeToken || pos >= queue.length) return;
      var item = queue[pos++];
      if (prev) prev.className = prev.className.replace(' brushing', '');
      item.node.className = item.node.className.replace(' w-hide', '') + ' brushing';
      prev = item.node;
      setTimeout(tick, item.delay);
    }
    setTimeout(tick, 300);
  }

  /* 背诵达段 → 成就奖状 */
  function checkAward() {
    var count = recitedCount();
    var tiers = window.PoemCards.TIERS;
    var awarded = store.awards();
    for (var i = 0; i < tiers.length; i++) {
      var t = tiers[i][0];
      if (count >= t && awarded.indexOf(t) < 0) {
        store.addAward(t);
        showCardSheet('背诵成就 · ' + window.PoemCards.tierOf(count),
          window.PoemCards.composeAwardCard(count, new Date()), null);
        return;
      }
    }
  }

  function section(title, text, open) {
    var sec = el('div', 'section' + (open ? ' open' : ''));
    var head = el('div', 'sec-head');
    head.appendChild(document.createTextNode(title));
    head.appendChild(el('span', 'arrow', open ? '▲' : '▼'));
    var body = el('div', 'sec-body', text || '暂无内容');
    head.addEventListener('click', function () {
      var opened = sec.className.indexOf('open') >= 0;
      sec.className = opened ? 'section' : 'section open';
      head.querySelector('.arrow').textContent = opened ? '▼' : '▲';
    });
    btnify(head, title);
    sec.appendChild(head);
    sec.appendChild(body);
    return sec;
  }

  /* ---------- 诗句渲染 ---------- */

  function isFamous(p, lineText) {
    var plain = stripPunct(lineText);
    for (var i = 0; i < p.fl.length; i++) {
      var f = stripPunct(p.fl[i]);
      if (f && (plain.indexOf(f) >= 0 || f.indexOf(plain) >= 0)) return true;
    }
    return false;
  }

  function segBoundary(p) {
    var map = {};
    var idx = 0;
    for (var s = 0; s < 4; s++) {
      if (p.seg[s] > 0 && idx < p.l.length) map[idx] = SEG_NAMES[s];
      idx += p.seg[s];
    }
    return map;
  }

  /* 背诵档位条：按 data-group / data-value 重绘 on 状态（不重建 DOM） */
  function paintReciteBar(bar) {
    var btns = bar.querySelectorAll('.rc[data-group]');
    for (var i = 0; i < btns.length; i++) {
      var g = btns[i].getAttribute('data-group');
      var v = parseInt(btns[i].getAttribute('data-value'), 10);
      var on = g === 'pair' ? state.pair === v : state.recite === v;
      btns[i].className = 'rc' + (on ? ' on' : '');
    }
  }

  function refreshVerse(host, p) {
    host.innerHTML = '';
    var verse = el('div', 'verse');
    var bounds = segBoundary(p);
    var intensity = state.recite; /* 0–3：整行隐藏强度 */
    var pairMode = state.pair;    /* 0 / 4(我背出句) / 5(我背对句)：按奇偶行分角色 */

    p.l.forEach(function (line, li) {
      var row = el('div', 'line-row' + (isFamous(p, line) ? ' famous' : ''));
      if (bounds[li]) row.appendChild(el('span', 'seg-tag', bounds[li]));
      if (pairMode > 0) {
        var mine = (pairMode === 4) === (li % 2 === 0);
        row.appendChild(el('span', 'role-tag' + (mine ? ' me' : ''),
          mine ? '我背' : '提示'));
      }

      var tones = p.tones[li];
      var pys = p.py[li];
      var hanziIdx = 0;
      var chars = line.split('');
      var lastHanzi = chars.length - 1;
      while (lastHanzi >= 0 && !HANZI.test(chars[lastHanzi])) lastHanzi--;

      /* 本行是否整行隐藏（亲子对背：孩子背的那一联藏字） */
      var lineHidden = pairMode === 4 ? li % 2 === 0 : (pairMode === 5 ? li % 2 === 1 : false);

      chars.forEach(function (ch, ci) {
        if (!HANZI.test(ch)) {
          var pn = el('span', 'ch punct');
          pn.appendChild(el('span', 'py', ''));
          pn.appendChild(el('span', 'glyph', ch));
          pn.appendChild(el('span', 'tone', ''));
          row.appendChild(pn);
          return;
        }
        var tone = tones ? tones[hanziIdx] : 0;
        var py = pys ? pys[hanziIdx] : '';
        var cell = el('span', 'ch tone-' + (tone === 1 || tone === 2 ? 'ping' : (tone >= 3 ? 'ze' : 'neu')));
        cell.appendChild(el('span', 'py', state.showPy ? py : ''));
        var glyph = el('span', 'glyph', ch);
        if (ci === lastHanzi && p.rhyme[li] !== null && p.rhyme[li] !== undefined) {
          glyph.className = 'glyph ' + RHYME_CLASS[p.rhyme[li] % 3];
        }
        cell.appendChild(glyph);
        cell.appendChild(el('span', 'tone',
          state.showTone ? (tone === 1 || tone === 2 ? '○' : (tone >= 3 ? '●' : '·')) : ''));

        /* 亲子对背行整行隐藏，或背诵强度按字隐藏 */
        var masked = lineHidden ||
          (intensity === 3) ||
          (intensity === 2 && hanziIdx % 2 === 1) ||
          (intensity === 1 && hanziIdx > 0);
        if (masked && !state.revealed[li + '-' + ci]) {
          cell.className += ' masked';
          (function (key) {
            cell.addEventListener('click', function (ev) {
              ev.stopPropagation();
              state.revealed[key] = true;
              refreshVerse(host, p);
            });
            btnify(cell, '查看被遮挡的字');
          })(li + '-' + ci);
        }
        hanziIdx++;
        row.appendChild(cell);
      });

      (function (lineIdx) {
        row.addEventListener('click', function () {
          state.openLine = state.openLine === lineIdx ? -1 : lineIdx;
          refreshVerse(host, p);
        });
      })(li);
      verse.appendChild(row);

      if (state.openLine === li) {
        var panel = el('div', 'anno-panel');
        var hits = p.an.filter(function (a) { return line.indexOf(a.w) >= 0; });
        if (hits.length) {
          hits.forEach(function (a) {
            var item = el('div', 'ap-item');
            item.appendChild(el('span', 'ap-word', a.w));
            item.appendChild(document.createTextNode('　' + a.m));
            panel.appendChild(item);
          });
        } else {
          panel.appendChild(el('div', 'ap-none', '本句无重点字词注释，看看下面的「字词注释」吧'));
        }
        verse.appendChild(panel);
      }
    });

    host.appendChild(verse);
  }

  /* ---------- 练习游戏通用 ---------- */

  function resultScreen(wrap, big, small, retry) {
    var done = el('div', 'quiz-result');
    done.appendChild(el('div', 'qr-score', big));
    done.appendChild(el('div', 'qr-text', small));
    var again = el('button', 'sheet-btn primary', '再来一组');
    again.addEventListener('click', retry);
    var back = el('button', 'sheet-btn', '返回练习中心');
    back.addEventListener('click', function () { location.hash = '#/practice'; });
    done.appendChild(again);
    done.appendChild(back);
    wrap.appendChild(done);
  }

  function optionButtons(host, options, correct, onDone) {
    options.forEach(function (opt) {
      var b = el('div', 'quiz-option', opt);
      b.addEventListener('click', function () {
        if (host.getAttribute('data-done')) return;
        host.setAttribute('data-done', '1');
        var right = opt === correct;
        var os = host.querySelectorAll('.quiz-option');
        for (var i = 0; i < os.length; i++) {
          if (os[i].textContent === correct) os[i].className += ' right';
        }
        if (!right) b.className += ' wrong';
        setTimeout(function () { onDone(right); }, 900);
      });
      btnify(b, opt);
      host.appendChild(b);
    });
  }

  function sceneCanvas(wrap, poem, opts) {
    var box = el('div', 'scene-box');
    var cv = document.createElement('canvas');
    box.appendChild(cv);
    wrap.appendChild(box);
    app.appendChild(wrap);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cssW = box.clientWidth || 320;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssW * 4 / 3 * dpr);
    window.PoemScene.render(cv, poem, opts || {});
    return cv;
  }

  /* ---------- 意象猜诗 ---------- */

  function renderGuess() {
    var ROUNDS = 5, round = 0, score = 0;
    var pool = POEMS.filter(function (p) { return p.img.length > 0; });
    function draw() {
      if (!inView('guess')) return;
      app.innerHTML = '';
      window.scrollTo(0, 0);
    window.scrollTo(0, 0);
      var wrap = el('div', 'wrap');
      wrap.appendChild(backBtn('← 退出', '#/practice'));
      if (round >= ROUNDS) {
        bestSet('guess', score);
        resultScreen(wrap, score + ' / ' + ROUNDS,
          score >= 4 ? '看图识诗，厉害！' : '多看看诗意图再来', renderGuess);
        app.appendChild(wrap);
        return;
      }
      var p = pool[Math.floor(Math.random() * pool.length)];
      var others = shuffle(POEMS.filter(function (q) { return q.id !== p.id; })).slice(0, 3);
      var options = shuffle([p.t].concat(others.map(function (q) { return q.t; })));
      wrap.appendChild(el('div', 'quiz-progress',
        '第 ' + (round + 1) + ' / ' + ROUNDS + ' 题　得分 ' + score));
      sceneCanvas(wrap, p, {});
      wrap.appendChild(el('div', 'dz-tip', '这幅画藏的是哪首诗？'));
      var host = el('div', 'quiz-options');
      optionButtons(host, options, p.t, function () { round++; draw(); });
      wrap.appendChild(host);
    }
    draw();
  }

  /* ---------- 补画 ---------- */

  var BUHUA_KEYS = ['moon', 'sun', 'boat', 'bird', 'person', 'building',
    'flower', 'willow', 'tree', 'horse', 'lamp'];

  function renderBuhua() {
    var ROUNDS = 5, round = 0, score = 0;
    var pool = POEMS.filter(function (p) {
      return p.img.filter(function (k) { return BUHUA_KEYS.indexOf(k) >= 0; }).length > 0;
    });
    function draw() {
      if (!inView('buhua')) return;
      app.innerHTML = '';
      window.scrollTo(0, 0);
    window.scrollTo(0, 0);
      var wrap = el('div', 'wrap');
      wrap.appendChild(backBtn('← 退出', '#/practice'));
      if (round >= ROUNDS) {
        bestSet('buhua', score);
        resultScreen(wrap, score + ' / ' + ROUNDS,
          score >= 4 ? '意象观察家！' : '再仔细读读诗句', renderBuhua);
        app.appendChild(wrap);
        return;
      }
      var p = pool[Math.floor(Math.random() * pool.length)];
      var cand = p.img.filter(function (k) { return BUHUA_KEYS.indexOf(k) >= 0; });
      var miss = cand[Math.floor(Math.random() * cand.length)];
      var distractKeys = shuffle(BUHUA_KEYS.filter(function (k) {
        return k !== miss && p.img.indexOf(k) < 0;
      })).slice(0, 2);
      var options = shuffle([miss].concat(distractKeys))
        .map(function (k) { return IMG_NAME[k] || k; });

      wrap.appendChild(el('div', 'quiz-progress',
        '第 ' + (round + 1) + ' / ' + ROUNDS + ' 题　得分 ' + score));
      var cv = sceneCanvas(wrap, p, { exclude: miss });
      wrap.appendChild(el('div', 'dz-tip',
        '「' + stripPunct(p.l[0]) + '」—— 画里少了什么？'));
      var host = el('div', 'quiz-options');
      optionButtons(host, options, IMG_NAME[miss], function (right) {
        if (right) {
          score++;
          window.PoemScene.render(cv, p, {});
          toast('补上了！');
          setTimeout(function () { round++; draw(); }, 1000);
        } else {
          /* 答错不清掉正确高亮，重试就泄题了：重置所有选项样式后放行 */
          host.removeAttribute('data-done');
          var os = host.querySelectorAll('.quiz-option');
          for (var oi = 0; oi < os.length; oi++) os[oi].className = 'quiz-option';
          toast('再想想，诗句里写了什么？');
        }
      });
      wrap.appendChild(host);
      app.appendChild(wrap);
    }
    draw();
  }

  /* ---------- 诗序拼图 ---------- */

  function renderPuzzle() {
    var pool = POEMS.filter(function (p) { return p.l.length >= 4 && p.l.length <= 8; });
    var p = pool[Math.floor(Math.random() * pool.length)];
    var order = shuffle(p.l.map(function (_, i) { return i; }));
    /* 避免开局即正确 */
    var same = order.every(function (v, i) { return v === i; });
    if (same) { var t = order[0]; order[0] = order[1]; order[1] = t; }
    var sel = -1;

    function draw() {
      if (!inView('puzzle')) return;
      app.innerHTML = '';
      window.scrollTo(0, 0);
    window.scrollTo(0, 0);
      var wrap = el('div', 'wrap');
      wrap.appendChild(backBtn('← 退出', '#/practice'));
      wrap.appendChild(el('div', 'quiz-progress',
        '《' + p.t + '》' + p.a + ' · 诗句顺序被打乱了'));
      wrap.appendChild(el('div', 'dz-tip', '点两张卡片交换位置，排回正确顺序'));
      var host = el('div');
      order.forEach(function (lineIdx, pos) {
        var card = el('div', 'puzzle-card' + (pos === sel ? ' sel' : ''),
          (pos + 1) + '. ' + p.l[lineIdx]);
        (function (pp) {
          card.addEventListener('click', function () {
            if (sel < 0) { sel = pp; }
            else if (sel === pp) { sel = -1; }
            else {
              var t = order[sel]; order[sel] = order[pp]; order[pp] = t;
              sel = -1;
            }
            draw();
          });
          btnify(card, '第 ' + (pos + 1) + ' 句卡片');
        })(pos);
        host.appendChild(card);
      });
      wrap.appendChild(host);
      var btnCheck = el('button', 'sheet-btn primary', '检查顺序');
      btnCheck.addEventListener('click', function () {
        var right = 0;
        order.forEach(function (v, i) { if (v === i) right++; });
        if (right === order.length) {
          toast('完全正确！');
          store.mark(p.id, 'read');
          var done = el('div', 'quiz-result');
          done.appendChild(el('div', 'qr-text', '《' + p.t + '》复原成功'));
          var next = el('button', 'sheet-btn primary', '下一首');
          next.addEventListener('click', renderPuzzle);
          var detail = el('button', 'sheet-btn', '去看这首诗');
          detail.addEventListener('click', function () {
            location.hash = '#/poem/' + p.id;
          });
          done.appendChild(next);
          done.appendChild(detail);
          wrap.appendChild(done);
        } else {
          toast('对了 ' + right + ' / ' + order.length + ' 句，继续调整');
        }
      });
      wrap.appendChild(btnCheck);
      app.appendChild(wrap);
    }
    draw();
  }

  /* ---------- 平仄对对子 ---------- */

  function renderDuizi() {
    /* 收集带声调的偶联字库 */
    var couples = [];
    var charPool = [];
    POEMS.forEach(function (p) {
      (p.cpl || []).forEach(function (cp) {
        var tA = p.tones[cp[0]], tB = p.tones[cp[1]];
        if (!tA || !tB) return;
        var hA = [], hB = [];
        var i, ch;
        for (i = 0; i < p.l[cp[0]].length; i++) {
          ch = p.l[cp[0]].charAt(i);
          if (HANZI.test(ch)) hA.push(ch);
        }
        for (i = 0; i < p.l[cp[1]].length; i++) {
          ch = p.l[cp[1]].charAt(i);
          if (HANZI.test(ch)) hB.push(ch);
        }
        if (hA.length === tA.length && hB.length === tB.length && hA.length === hB.length) {
          couples.push({ poem: p, a: hA, b: hB, ta: tA, tb: tB });
          for (i = 0; i < hB.length; i++) {
            charPool.push({ ch: hB[i], tone: tB[i] });
            charPool.push({ ch: hA[i], tone: tA[i] });
          }
        }
      });
    });
    if (!couples.length) { location.hash = '#/practice'; return; }

    var ROUNDS = 5, round = 0, score = 0;
    function draw() {
      if (!inView('duizi')) return;
      app.innerHTML = '';
      window.scrollTo(0, 0);
    window.scrollTo(0, 0);
      var wrap = el('div', 'wrap');
      wrap.appendChild(backBtn('← 退出', '#/practice'));
      if (round >= ROUNDS) {
        bestSet('duizi', score);
        resultScreen(wrap, score + ' / ' + ROUNDS,
          score >= 4 ? '平仄小高手！' : '记住：一声二声是平，三声四声是仄', renderDuizi);
        app.appendChild(wrap);
        return;
      }
      var c = couples[Math.floor(Math.random() * couples.length)];
      var pos = Math.floor(Math.random() * c.b.length);
      var correct = c.b[pos];
      var needTone = c.tb[pos];
      var distract = [];
      var guard = 0;
      while (distract.length < 3 && guard++ < 400) {
        var cand = charPool[Math.floor(Math.random() * charPool.length)];
        if (cand.ch === correct || distract.indexOf(cand.ch) >= 0) continue;
        /* 干扰字取不同声调，强化平仄对比 */
        var candPing = cand.tone === 1 || cand.tone === 2;
        var needPing = needTone === 1 || needTone === 2;
        if (candPing === needPing && distract.length < 2) continue;
        distract.push(cand.ch);
      }
      while (distract.length < 3) distract.push('之乎者也'[distract.length]);
      var options = shuffle([correct].concat(distract));

      var lineB = '';
      for (var i = 0; i < c.b.length; i++) lineB += i === pos ? '＿' : c.b[i];
      wrap.appendChild(el('div', 'quiz-progress',
        '第 ' + (round + 1) + ' / ' + ROUNDS + ' 题　得分 ' + score));
      var card = el('div', 'quiz-card');
      card.appendChild(el('div', 'qc-from',
        '《' + c.poem.t + '》' + c.poem.a));
      card.appendChild(el('div', 'qc-prompt', c.a.join('')));
      card.appendChild(el('div', 'qc-prompt', lineB));
      card.appendChild(el('div', 'qc-hint',
        '此处应填' + (needTone === 1 || needTone === 2 ? '平声（○ 一声或二声）' : '仄声（● 三声或四声）') + '字'));
      wrap.appendChild(card);
      var host = el('div', 'quiz-options');
      optionButtons(host, options, correct, function () { round++; draw(); });
      wrap.appendChild(host);
      app.appendChild(wrap);
    }
    draw();
  }

  /* ---------- 飞花令（人机对令） ---------- */

  var FEIHUA_KWS = ['花', '月', '山', '水', '风', '雪', '云', '雨',
    '鸟', '春', '江', '夜', '日', '天', '柳'];

  function feihuaLines(kw) {
    var seen = {};
    var out = [];
    POEMS.forEach(function (p) {
      p.l.forEach(function (line) {
        var clean = line.replace(/[，。！？；、：…]/g, '');
        if (clean.indexOf(kw) < 0 || seen[clean]) return;
        seen[clean] = true;
        out.push({ p: p, text: line });
      });
    });
    return out;
  }

  function feihuaBest() { return store.data._feihuaBest || {}; }

  function renderFeihua() {
    app.innerHTML = '';
    window.scrollTo(0, 0);
    var wrap = el('div', 'wrap');
    wrap.appendChild(backBtn('← 退出', '#/practice'));
    wrap.appendChild(el('div', 'quiz-progress', '飞花令 · 选一个令字'));
    wrap.appendChild(el('div', 'dz-tip',
      '人机对令：双方轮流说出含令字的诗句，接不上就算输'));
    var best = feihuaBest();
    var chips = el('div', 'fh-chips');
    FEIHUA_KWS.forEach(function (kw) {
      var lines = feihuaLines(kw);
      if (lines.length < 5) return;
      var chip = el('div', 'fh-chip');
      chip.appendChild(el('span', 'fh-chip-kw', kw));
      chip.appendChild(el('span', 'fh-chip-n',
        lines.length + ' 句' + (best[kw] ? ' · 最佳 ' + best[kw] : '')));
      chip.addEventListener('click', function () { playFeihua(kw, lines); });
      btnify(chip, '令字 ' + kw);
      chips.appendChild(chip);
    });
    wrap.appendChild(chips);
    app.appendChild(wrap);
  }

  function playFeihua(kw, all) {
    var deck = shuffle(all.slice());
    var idx = 0;      /* 已出到第几句 */
    var streak = 0;   /* 连续接上的轮数 */

    function draw() {
      if (!inView('feihua')) return;
      app.innerHTML = '';
      window.scrollTo(0, 0);
    window.scrollTo(0, 0);
      var wrap = el('div', 'wrap');
      wrap.appendChild(backBtn('← 退出', '#/practice'));
      wrap.appendChild(el('div', 'quiz-progress',
        '令字「' + kw + '」 · 已接上 ' + streak + ' 轮'));

      /* 已出过的诗句 */
      var played = el('div', 'fh-lines');
      deck.slice(0, idx).forEach(function (it) {
        var row = el('div', 'fh-line');
        row.appendChild(el('span', 'fh-line-text', it.text));
        row.appendChild(el('span', 'fh-line-src', '《' + it.p.t + '》' + it.p.a));
        played.appendChild(row);
      });
      wrap.appendChild(played);

      if (idx >= deck.length) {
        /* 题库出完：全胜 */
        endFeihua(wrap, kw, streak, all, true);
        app.appendChild(wrap);
        return;
      }

      /* 我出一句 */
      var mine = deck[idx];
      var mineRow = el('div', 'fh-line mine');
      mineRow.appendChild(el('span', 'fh-line-text', mine.text));
      mineRow.appendChild(el('span', 'fh-line-src',
        '我出：《' + mine.p.t + '》' + mine.p.a));
      wrap.appendChild(mineRow);

      wrap.appendChild(el('div', 'dz-tip',
        '轮到你：说出一句含「' + kw + '」的诗句'));
      var ok = el('button', 'sheet-btn primary', '接上了！');
      ok.addEventListener('click', function () {
        streak++;
        idx++;
        draw();
      });
      var giveup = el('button', 'sheet-btn', '接不上');
      giveup.addEventListener('click', function () {
        app.innerHTML = '';
      window.scrollTo(0, 0);
    window.scrollTo(0, 0);
        var w2 = el('div', 'wrap');
        w2.appendChild(backBtn('← 退出', '#/practice'));
        endFeihua(w2, kw, streak, all, false);
        app.appendChild(w2);
      });
      wrap.appendChild(ok);
      wrap.appendChild(giveup);
      app.appendChild(wrap);
    }
    draw();
  }

  function endFeihua(wrap, kw, streak, all, win) {
    var best = feihuaBest();
    if (streak > (best[kw] || 0)) {
      best[kw] = streak;
      store.data._feihuaBest = best;
      store.save();
    }
    /* 全部令字中的最高纪录（练习中心统一展示） */
    var top = 0;
    for (var k in best) if (best[k] > top) top = best[k];
    bestSet('feihua', top);
    resultScreen(wrap, win ? '全胜 ' + streak + ' 轮！' : '接上 ' + streak + ' 轮',
      win ? '令字「' + kw + '」的库存被你掏空了'
        : '最佳纪录 ' + (best[kw] || 0) + ' 轮 · 下面是所有含「' + kw + '」的诗句',
      renderFeihua);

    /* 学习清单：所有含令字的诗句 */
    var listTitle = el('div', 'dz-tip', '含「' + kw + '」的诗句（共 ' + all.length + ' 句）');
    wrap.appendChild(listTitle);
    all.forEach(function (it) {
      var row = el('div', 'fh-line fh-line-all');
      row.appendChild(el('span', 'fh-line-text', it.text));
      row.appendChild(el('span', 'fh-line-src', '《' + it.p.t + '》' + it.p.a));
      row.addEventListener('click', function () {
        location.hash = '#/poem/' + it.p.id;
      });
      btnify(row, it.text);
      wrap.appendChild(row);
    });
  }



  /* [名称, 月, 日(近似), 季节, 检索关键词] */
  var SOLAR_TERMS = [
    ['立春', 2, 4, 'spring', null], ['雨水', 2, 19, 'spring', '雨'],
    ['惊蛰', 3, 6, 'spring', null], ['春分', 3, 21, 'spring', null],
    ['清明', 4, 5, 'spring', '清明'], ['谷雨', 4, 20, 'spring', '雨'],
    ['立夏', 5, 6, 'summer', null], ['小满', 5, 21, 'summer', null],
    ['芒种', 6, 6, 'summer', '田'], ['夏至', 6, 21, 'summer', '荷'],
    ['小暑', 7, 7, 'summer', null], ['大暑', 7, 23, 'summer', null],
    ['立秋', 8, 8, 'autumn', null], ['处暑', 8, 23, 'autumn', null],
    ['白露', 9, 8, 'autumn', '露'], ['秋分', 9, 23, 'autumn', null],
    ['寒露', 10, 8, 'autumn', '露'], ['霜降', 10, 23, 'autumn', '霜'],
    ['立冬', 11, 8, 'winter', null], ['小雪', 11, 22, 'winter', '雪'],
    ['大雪', 12, 7, 'winter', '雪'], ['冬至', 12, 22, 'winter', null],
    ['小寒', 1, 6, 'winter', null], ['大寒', 1, 20, 'winter', '寒']
  ];

  function nearTerm(date) {
    var m = date.getMonth() + 1, d = date.getDate();
    for (var i = 0; i < SOLAR_TERMS.length; i++) {
      var t = SOLAR_TERMS[i];
      if (t[1] === m && Math.abs(t[2] - d) <= 1) return t;
    }
    return null;
  }

  function poemOfDay(date) {
    var term = nearTerm(date);
    if (term) {
      var kw = term[4], season = term[3];
      var i, p;
      if (kw) {
        for (i = 0; i < POEMS.length; i++) {
          p = POEMS[i];
          if (p.t.indexOf(kw) >= 0 || p.l.join('').indexOf(kw) >= 0) {
            return { poem: p, subtitle: '今日' + term[0] };
          }
        }
      }
      var seasonal = POEMS.filter(function (q) {
        return q.mood && q.mood[0] === season;
      });
      if (seasonal.length) {
        return {
          poem: seasonal[date.getDate() % seasonal.length],
          subtitle: '今日' + term[0]
        };
      }
    }
    var dayIdx = Math.floor((date - new Date(date.getFullYear(), 0, 1)) / 86400000);
    return { poem: POEMS[dayIdx % POEMS.length], subtitle: '每日一诗' };
  }

  /* ---------- 诗径地图 ---------- */

  function renderJourney() {
    app.innerHTML = '';
    window.scrollTo(0, 0);
    var wrap = el('div', 'wrap');
    var bar = el('div', 'topbar');
    bar.appendChild(el('div', 'brand', '诗径'));
    bar.appendChild(el('div', 'sub', '背一首，点亮一处 · 从山脚走到山顶'));
    wrap.appendChild(bar);
    wrap.appendChild(navBar('journey'));
    state.view = 'journey';
    var poems = POEMS.slice().sort(function (a, b) {
      var ka = a.g * 2 + (a.s === '下' ? 1 : 0);
      var kb = b.g * 2 + (b.s === '下' ? 1 : 0);
      return ka - kb;
    });
    var n = poems.length;
    var done = recitedCount();
    var next = null;
    for (var ni = 0; ni < poems.length; ni++) {
      if (!store.get(poems[ni].id).recited) { next = poems[ni]; break; }
    }
    var summary = el('div', 'journey-summary');
    summary.appendChild(el('div', 'journey-count', done + ' / ' + n));
    summary.appendChild(el('div', 'journey-copy', done ? '已点亮的诗句，会成为你的路标。' : '从第一首诗开始，点亮自己的诗径。'));
    wrap.appendChild(summary);
    if (next) {
      var nextCard = el('div', 'journey-next');
      nextCard.appendChild(el('div', 'journey-kicker', '下一站'));
      nextCard.appendChild(el('div', 'journey-next-title', '《' + next.t + '》'));
      nextCard.appendChild(el('div', 'journey-next-meta', '【' + next.d + '】' + next.a + ' · ' + next.g + '年级' + (next.s || '')));
      nextCard.addEventListener('click', function () { location.hash = '#/poem/' + next.id; });
      btnify(nextCard, '学习下一首《' + next.t + '》');
      wrap.appendChild(nextCard);
    }
    for (var grade = 1; grade <= 6; grade++) {
      (function (g) {
        var gradePoems = poems.filter(function (p) { return p.g === g; });
        var gradeDone = gradePoems.filter(function (p) { return store.get(p.id).recited; }).length;
        var group = el('div', 'journey-grade' + (next && next.g === g ? ' open' : ''));
        var gradeHead = el('div', 'journey-grade-head');
        gradeHead.appendChild(el('span', 'journey-grade-title', g + '年级'));
        gradeHead.appendChild(el('span', 'journey-grade-count', gradeDone + ' / ' + gradePoems.length + ' 首'));
        gradeHead.appendChild(el('span', 'journey-grade-arrow', '⌄'));
        btnify(gradeHead, g + '年级诗单');
        group.appendChild(gradeHead);
        var list = el('div', 'journey-grade-list');
        gradePoems.forEach(function (p) {
          var prog = store.get(p.id);
          var row = el('div', 'journey-poem');
          row.appendChild(el('span', 'journey-state ' + (prog.recited ? 'done' : (prog.read ? 'read' : '')), prog.recited ? '✓' : ''));
          row.appendChild(el('span', 'journey-poem-title', p.t));
          row.appendChild(el('span', 'journey-poem-meta', '【' + p.d + '】' + p.a));
          row.addEventListener('click', function () { saveScroll(navKey()); location.hash = '#/poem/' + p.id; });
          btnify(row, '学习《' + p.t + '》');
          list.appendChild(row);
        });
        group.appendChild(list);
        gradeHead.addEventListener('click', function () { group.className = group.className.indexOf(' open') >= 0 ? 'journey-grade' : 'journey-grade open'; });
        wrap.appendChild(group);
      })(grade);
    }
    app.appendChild(wrap);
    restoreScroll(navKey());
  }

  /* ---------- 启动 ---------- */

  window.addEventListener('hashchange', route);
  route();
})();
