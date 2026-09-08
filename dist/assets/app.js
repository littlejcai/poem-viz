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
    bridge().saveImageToPhotosAlbum({ filePath: dataUrl }).then(function () {
      toast('已保存到相册');
      done && done();
    }).catch(function (err) {
      toast((err && err.errMsg) || '保存失败');
    });
  }

  function bridgePost(dataUrl, poem, done) {
    bridge().postNote({
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

  /* ---------- 路由 ---------- */

  var app = document.getElementById('app');
  var state = {
    grade: 0,
    query: '',
    imgFilter: null,
    reviewOnly: false,
    showPy: true,
    showTone: true,
    recite: 0,
    revealed: {},
    openLine: -1
  };

  function route() {
    var hash = location.hash.replace(/^#\/?/, '');
    var parts = hash.split('/');
    var v = parts[0];
    if (v === 'poem' && parts[1]) renderDetail(parts[1]);
    else if (v === 'img') renderImagery();
    else if (v === 'authors') renderAuthors();
    else if (v === 'author' && parts[1]) renderAuthor(decodeURIComponent(parts[1]));
    else if (v === 'practice') renderPractice();
    else if (v === 'quiz') renderQuiz();
    else if (v === 'duizhang') renderDuizhang();
    else if (v === 'guess') renderGuess();
    else if (v === 'buhua') renderBuhua();
    else if (v === 'puzzle') renderPuzzle();
    else if (v === 'duizi') renderDuizi();
    else if (v === 'journey') renderJourney();
    else {
      state.imgFilter = v === 'list' && parts[1] ? decodeURIComponent(parts[1]) : null;
      renderList();
    }
  }

  function navBar(active) {
    var nav = el('div', 'nav');
    [['list', '诗集'], ['img', '意象'], ['authors', '诗人'], ['journey', '诗径'], ['practice', '练习']]
      .forEach(function (it) {
        var n = el('span', 'nav-item' + (active === it[0] ? ' active' : ''), it[1]);
        n.addEventListener('click', function () { location.hash = '#/' + it[0]; });
        nav.appendChild(n);
      });
    return nav;
  }

  function backBtn(text) {
    var back = el('span', 'back-btn', text || '← 返回');
    back.addEventListener('click', function () { history.back(); });
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

  function poemCard(p) {
    var card = el('div', 'poem-card');
    var head = el('div', 'pc-head');
    head.appendChild(el('span', 'pc-title', p.t));
    head.appendChild(el('span', 'pc-meta', '【' + p.d + '】' + p.a));
    card.appendChild(head);
    card.appendChild(el('div', 'pc-line', p.l[0].replace(/[，。！？；、：…]$/, '')));
    var foot = el('div', 'pc-foot');
    foot.appendChild(el('span', 'pc-grade', p.g + '年级' + (p.s || '')));
    var prog = store.get(p.id);
    if (prog.recited) foot.appendChild(el('span', 'pc-done', '已背诵 ✓'));
    else if (prog.read) foot.appendChild(el('span', 'pc-done', '已读'));
    if (p.tg.length) foot.appendChild(el('span', 'pc-tags', p.tg.slice(0, 2).join(' · ')));
    card.appendChild(foot);
    card.addEventListener('click', function () {
      location.hash = '#/poem/' + p.id;
    });
    return card;
  }

  function filterPoems() {
    var q = state.query.trim();
    var due = state.reviewOnly ? duePoems() : null;
    return POEMS.filter(function (p) {
      if (due && due.indexOf(p) < 0) return false;
      if (state.imgFilter && p.img.indexOf(state.imgFilter) < 0) return false;
      if (state.grade && p.g !== state.grade) return false;
      if (q) {
        var hay = p.t + p.a + p.d + p.l.join('') + p.tg.join('');
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function renderList() {
    app.innerHTML = '';
    var wrap = el('div', 'wrap');

    var bar = el('div', 'topbar');
    bar.appendChild(el('div', 'brand', '诗画同源'));
    bar.appendChild(el('div', 'sub', '小学必背古诗词 · 一诗一画'));
    /* 每日一诗日签入口（逢节气优先推节气诗） */
    var today = new Date();
    var daySign = el('span', 'nav-item', '今日日签');
    daySign.addEventListener('click', function () {
      var pick = poemOfDay(today);
      showCardSheet(pick.subtitle + ' · ' + pick.poem.t,
        window.PoemCards.composeDateCard(pick.poem, today, pick.subtitle), pick.poem);
    });
    bar.appendChild(daySign);
    /* 本周战报入口 */
    var weekBtn = el('span', 'nav-item', '本周战报');
    weekBtn.addEventListener('click', function () {
      showCardSheet('本周背诗战报', window.PoemCards.composeWeeklyCard(weeklyStats()), null);
    });
    bar.appendChild(weekBtn);
    wrap.appendChild(bar);
    wrap.appendChild(navBar('list'));

    /* 复习提醒 */
    var due = duePoems();
    if (due.length && !state.reviewOnly) {
      var banner = el('div', 'review-banner',
        '有 ' + due.length + ' 首到了复习时间，点我开始复习 →');
      banner.addEventListener('click', function () {
        state.reviewOnly = true;
        renderList();
      });
      wrap.appendChild(banner);
    }

    var searchBox = el('div', 'search-box');
    var input = el('input');
    input.type = 'search';
    input.placeholder = '搜索诗名 / 作者 / 诗句';
    input.value = state.query;
    input.addEventListener('input', function () {
      state.query = input.value;
      refreshCards(listHost);
    });
    searchBox.appendChild(input);
    wrap.appendChild(searchBox);

    var chips = el('div', 'grade-chips');
    if (state.reviewOnly) {
      var rc = el('span', 'chip active', '复习模式 ✕');
      rc.addEventListener('click', function () {
        state.reviewOnly = false;
        renderList();
      });
      chips.appendChild(rc);
    }
    if (state.imgFilter) {
      var tag = el('span', 'chip active',
        '意象：' + (IMG_NAME[state.imgFilter] || state.imgFilter) + ' ✕');
      tag.addEventListener('click', function () { location.hash = '#/list'; });
      chips.appendChild(tag);
    }
    var grades = [['全部', 0], ['一', 1], ['二', 2], ['三', 3], ['四', 4], ['五', 5], ['六', 6]];
    grades.forEach(function (gv) {
      var c = el('span', 'chip' + (state.grade === gv[1] ? ' active' : ''),
        gv[1] ? gv[0] + '年级' : gv[0]);
      c.addEventListener('click', function () {
        state.grade = gv[1];
        renderList();
      });
      chips.appendChild(c);
    });
    wrap.appendChild(chips);

    var listHost = el('div');
    wrap.appendChild(listHost);
    app.appendChild(wrap);
    refreshCards(listHost);
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

  function renderImagery() {
    app.innerHTML = '';
    var wrap = el('div', 'wrap');
    var bar = el('div', 'topbar');
    bar.appendChild(el('div', 'brand', '意象长廊'));
    bar.appendChild(el('div', 'sub', '同一个意象，藏在哪些诗里？'));
    wrap.appendChild(bar);
    wrap.appendChild(navBar('img'));

    var cloud = el('div', 'img-cloud');
    IMG_INDEX.forEach(function (it) {
      var chip = el('span', 'img-chip');
      chip.appendChild(el('span', 'ic-name', IMG_NAME[it.k] || it.k));
      chip.appendChild(el('span', 'ic-count', it.n + ' 首'));
      chip.addEventListener('click', function () {
        location.hash = '#/list/' + encodeURIComponent(it.k);
      });
      cloud.appendChild(chip);
    });
    wrap.appendChild(cloud);
    app.appendChild(wrap);
  }

  /* ---------- 诗人页 ---------- */

  function renderAuthors() {
    app.innerHTML = '';
    var wrap = el('div', 'wrap');
    var bar = el('div', 'topbar');
    bar.appendChild(el('div', 'brand', '诗人名录'));
    bar.appendChild(el('div', 'sub', '认识写诗的人'));
    wrap.appendChild(bar);
    wrap.appendChild(navBar('authors'));

    AUTHORS.forEach(function (a) {
      var row = el('div', 'poem-card');
      var head = el('div', 'pc-head');
      head.appendChild(el('span', 'pc-title', a.n));
      var meta = '【' + a.d + '】';
      if (a.ti) meta += ' ' + a.ti;
      if (a.ly) meta += ' ' + a.ly;
      head.appendChild(el('span', 'pc-meta', meta));
      row.appendChild(head);
      row.appendChild(el('div', 'pc-line', a.br));
      var foot = el('div', 'pc-foot');
      foot.appendChild(el('span', 'pc-grade', '入选 ' + a.ids.length + ' 首'));
      row.appendChild(foot);
      row.addEventListener('click', function () {
        location.hash = '#/author/' + encodeURIComponent(a.n);
      });
      wrap.appendChild(row);
    });
    app.appendChild(wrap);
  }

  function renderAuthor(name) {
    var author = null;
    for (var i = 0; i < AUTHORS.length; i++) {
      if (AUTHORS[i].n === name) { author = AUTHORS[i]; break; }
    }
    if (!author) { location.hash = '#/authors'; return; }

    app.innerHTML = '';
    var wrap = el('div', 'wrap');
    wrap.appendChild(backBtn());

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
  }

  /* ---------- 练习中心 ---------- */

  function renderPractice() {
    app.innerHTML = '';
    var wrap = el('div', 'wrap');
    var bar = el('div', 'topbar');
    bar.appendChild(el('div', 'brand', '练习'));
    bar.appendChild(el('div', 'sub', '背完来测一测'));
    wrap.appendChild(bar);
    wrap.appendChild(navBar('practice'));

    var entries = [
      ['#/quiz', '诗句接龙', '给上句，接下句 · 10 题一组'],
      ['#/guess', '意象猜诗', '只看画，猜是哪首诗'],
      ['#/buhua', '补画', '画里少了什么？补上正确的意象'],
      ['#/puzzle', '诗序拼图', '诗句被打乱了，点两张卡片交换位置复原'],
      ['#/duizhang', '对仗连连看', '律诗对仗字配对 · 感受格律之美'],
      ['#/duizi', '平仄对对子', '按平仄提示，填出对句的字']
    ];
    entries.forEach(function (en) {
      var card = el('div', 'poem-card practice-card');
      card.appendChild(el('div', 'pc-title', en[1]));
      card.appendChild(el('div', 'pc-line', en[2]));
      card.addEventListener('click', function () { location.hash = en[0]; });
      wrap.appendChild(card);
    });

    var best = store.get('_quizBest');
    if (best.score !== undefined) {
      wrap.appendChild(el('div', 'empty-tip',
        '诗句接龙最佳成绩：' + best.score + ' / 10'));
    }
    app.appendChild(wrap);
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
      app.innerHTML = '';
      var wrap = el('div', 'wrap');
      wrap.appendChild(backBtn('← 退出'));

      if (idx >= qs.length) {
        /* 结算 */
        var done = el('div', 'quiz-result');
        done.appendChild(el('div', 'qr-score', score + ' / ' + qs.length));
        done.appendChild(el('div', 'qr-text',
          score >= 8 ? '太厉害了，诗词小达人！' :
          score >= 5 ? '不错，继续加油！' : '多读几遍，再来挑战！'));
        var best = store.get('_quizBest');
        if (best.score === undefined || score > best.score) {
          store.data._quizBest = { score: score };
          store.save();
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
      app.innerHTML = '';
      var wrap = el('div', 'wrap');
      wrap.appendChild(backBtn('← 退出'));

      if (round >= ROUNDS) {
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
    state.revealed = {};
    state.openLine = -1;

    app.innerHTML = '';
    var wrap = el('div', 'wrap');
    wrap.appendChild(backBtn());

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
    meta.appendChild(authorLink);
    meta.appendChild(document.createTextNode('　' + p.g + '年级' + (p.s || '') + '册'));
    head.appendChild(meta);
    wrap.appendChild(head);

    /* 工具条 */
    var bar = el('div', 'toolbar');
    var btnPy = el('span', 'tool' + (state.showPy ? ' on' : ''), '拼音');
    var btnTone = el('span', 'tool' + (state.showTone ? ' on' : ''), '平仄');
    var btnFog = el('span', 'tool', '拂雾看画');
    var btnWrite = el('span', 'tool', '画笔写诗');
    var btnCard = el('span', 'tool', '诗画卡');
    var btnCopy = el('span', 'tool', '字帖');
    var btnSign = el('span', 'tool', '日签');
    var btnPhoto = el('span', 'tool', '合照卡');
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
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
      photoInput.value = '';
    });
    btnPhoto.addEventListener('click', function () { photoInput.click(); });
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
    btnCard.addEventListener('click', function () {
      showCardSheet('诗画卡 · ' + p.t, window.PoemScene.composeCard(p), p);
    });
    btnCopy.addEventListener('click', function () {
      showCardSheet('描红字帖 · ' + p.t, window.PoemCards.composeCopybook(p), null);
    });
    btnSign.addEventListener('click', function () {
      var term = nearTerm(new Date());
      var sub = term ? '今日' + term[0] : '每日一诗';
      showCardSheet(sub + ' · ' + p.t,
        window.PoemCards.composeDateCard(p, new Date(), sub), p);
    });
    bar.appendChild(btnPy);
    bar.appendChild(btnTone);
    bar.appendChild(btnFog);
    bar.appendChild(btnWrite);
    bar.appendChild(btnCard);
    bar.appendChild(btnSign);
    bar.appendChild(btnPhoto);
    bar.appendChild(btnCopy);
    wrap.appendChild(bar);
    wrap.appendChild(photoInput);

    /* 背诵档位（4/5 为亲子对背：我背出句/我背对句） */
    var rcBar = el('div', 'recite-bar');
    [['关闭', 0], ['首字提示', 1], ['半隐', 2], ['全隐挑战', 3],
     ['我背出句', 4], ['我背对句', 5]].forEach(function (it) {
      var b = el('span', 'rc' + (state.recite === it[1] ? ' on' : ''), it[0]);
      b.addEventListener('click', function () {
        state.recite = it[1];
        state.revealed = {};
        var btns = rcBar.querySelectorAll('.rc');
        for (var i = 0; i < btns.length; i++) btns[i].className = 'rc';
        b.className = 'rc on';
        refreshVerse(verseHost, p);
        if (it[1] === 3) toast('点击被遮住的字可以偷看哦');
      });
      rcBar.appendChild(b);
    });
    var rcDone = el('span', 'rc', '我会背了');
    rcDone.addEventListener('click', function () {
      store.recite(p.id);
      toast('太棒了！已标记为「已背诵」');
      checkAward();
    });
    rcBar.appendChild(rcDone);
    wrap.appendChild(rcBar);

    /* 诗句 */
    var verseHost = el('div');
    wrap.appendChild(verseHost);
    refreshVerse(verseHost, p);

    wrap.appendChild(el('div', 'legend'))
      .innerHTML = '<span class="lg-ping">○ 平声</span>　<span class="lg-ze">● 仄声</span>' +
      '　<span style="color:#b03a2e">—</span> 押韵字（按普通话声调标注）';

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
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssW * 4 / 3 * dpr);
    var off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    window.PoemScene.render(off, p, {});
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

  function refreshVerse(host, p) {
    host.innerHTML = '';
    var verse = el('div', 'verse');
    var bounds = segBoundary(p);

    p.l.forEach(function (line, li) {
      var row = el('div', 'line-row' + (isFamous(p, line) ? ' famous' : ''));
      if (bounds[li]) row.appendChild(el('span', 'seg-tag', bounds[li]));
      if (state.recite >= 4) {
        var mine = (state.recite === 4) === (li % 2 === 0);
        row.appendChild(el('span', 'role-tag' + (mine ? ' me' : ''),
          mine ? '我背' : '提示'));
      }

      var tones = p.tones[li];
      var pys = p.py[li];
      var hanziIdx = 0;
      var chars = line.split('');
      var lastHanzi = chars.length - 1;
      while (lastHanzi >= 0 && !HANZI.test(chars[lastHanzi])) lastHanzi--;

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

        if (state.recite > 0) {
          var masked = state.recite === 3 ||
            (state.recite === 2 && hanziIdx % 2 === 1) ||
            (state.recite === 1 && hanziIdx > 0) ||
            (state.recite === 4 && li % 2 === 0) ||
            (state.recite === 5 && li % 2 === 1);
          if (masked && !state.revealed[li + '-' + ci]) {
            cell.className += ' masked';
            (function (key) {
              cell.addEventListener('click', function (ev) {
                ev.stopPropagation();
                state.revealed[key] = true;
                refreshVerse(host, p);
              });
            })(li + '-' + ci);
          }
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
      app.innerHTML = '';
      var wrap = el('div', 'wrap');
      wrap.appendChild(backBtn('← 退出'));
      if (round >= ROUNDS) {
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
      app.innerHTML = '';
      var wrap = el('div', 'wrap');
      wrap.appendChild(backBtn('← 退出'));
      if (round >= ROUNDS) {
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
          host.removeAttribute('data-done');
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
      app.innerHTML = '';
      var wrap = el('div', 'wrap');
      wrap.appendChild(backBtn('← 退出'));
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
      app.innerHTML = '';
      var wrap = el('div', 'wrap');
      wrap.appendChild(backBtn('← 退出'));
      if (round >= ROUNDS) {
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

  /* ---------- 节气日签 ---------- */

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
    var wrap = el('div', 'wrap');
    wrap.appendChild(backBtn());
    var bar = el('div', 'topbar');
    bar.appendChild(el('div', 'brand', '诗径'));
    bar.appendChild(el('div', 'sub', '背一首，点亮一处 · 从山脚走到山顶'));
    wrap.appendChild(bar);
    var box = el('div', 'journey-box');
    var cv = document.createElement('canvas');
    box.appendChild(cv);
    wrap.appendChild(box);
    app.appendChild(wrap);

    var poems = POEMS.slice().sort(function (a, b) {
      var ka = a.g * 2 + (a.s === '下' ? 1 : 0);
      var kb = b.g * 2 + (b.s === '下' ? 1 : 0);
      return ka - kb;
    });
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cssW = wrap.clientWidth || 320;
    var n = poems.length;
    var cssH = Math.max(1200, n * 34 + 220);
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.height = cssH + 'px';
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);

    /* 背景：山脚暖色 → 山顶青黛 */
    var sky = ctx.createLinearGradient(0, 0, 0, cssH);
    sky.addColorStop(0, '#c9d4dc');
    sky.addColorStop(0.25, '#e3e4d8');
    sky.addColorStop(1, '#f6f1e3');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cssW, cssH);
    /* 山顶远峰 */
    ctx.fillStyle = 'rgba(90,110,130,0.25)';
    ctx.beginPath();
    ctx.moveTo(0, 130);
    ctx.lineTo(cssW * 0.3, 40);
    ctx.lineTo(cssW * 0.55, 110);
    ctx.lineTo(cssW * 0.8, 30);
    ctx.lineTo(cssW, 120);
    ctx.lineTo(cssW, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();

    /* 节点位置：之字形山径，自山脚(下)往山顶(上) */
    var nodes = [];
    var i, p, x, y;
    for (i = 0; i < n; i++) {
      p = poems[i];
      x = cssW / 2 + Math.sin(i * 0.42) * cssW * 0.3;
      y = cssH - 90 - i * ((cssH - 240) / (n - 1));
      nodes.push({ p: p, x: x, y: y });
    }

    /* 山径连线 */
    ctx.strokeStyle = 'rgba(138,127,99,0.5)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(nodes[0].x, nodes[0].y);
    for (i = 1; i < n; i++) ctx.lineTo(nodes[i].x, nodes[i].y);
    ctx.stroke();

    /* 年级界标 */
    var lastGrade = 0;
    ctx.font = '12px serif';
    ctx.fillStyle = '#8a7f63';
    ctx.textAlign = 'left';
    for (i = 0; i < n; i++) {
      if (poems[i].g !== lastGrade) {
        lastGrade = poems[i].g;
        ctx.fillText('▼ ' + lastGrade + ' 年级',
          Math.min(nodes[i].x + 22, cssW - 70), nodes[i].y + 4);
      }
    }

    /* 下一站（第一首未背） */
    var nextIdx = -1;
    for (i = 0; i < n; i++) {
      if (!store.get(poems[i].id).recited) { nextIdx = i; break; }
    }

    /* 节点 */
    for (i = 0; i < n; i++) {
      var nd = nodes[i];
      var prog = store.get(nd.p.id);
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, 9, 0, Math.PI * 2);
      if (prog.recited) {
        ctx.fillStyle = '#b03a2e';
        ctx.fill();
        ctx.fillStyle = '#f6f1e3';
        ctx.font = '10px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✓', nd.x, nd.y + 1);
        ctx.textBaseline = 'alphabetic';
      } else if (prog.read) {
        ctx.fillStyle = '#f6f1e3';
        ctx.fill();
        ctx.strokeStyle = '#8a7f63';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(138,127,99,0.35)';
        ctx.fill();
      }
      if (i === nextIdx) {
        ctx.strokeStyle = '#b03a2e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#b03a2e';
        ctx.font = '13px "KaiTi","STKaiti",serif';
        ctx.textAlign = nd.x > cssW * 0.65 ? 'right' : 'left';
        ctx.fillText('下一站 · 《' + nd.p.t + '》',
          nd.x > cssW * 0.65 ? nd.x - 20 : nd.x + 20, nd.y + 4);
      }
    }

    /* 山脚统计 */
    var done = recitedCount();
    ctx.fillStyle = '#7a7568';
    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.fillText('已点亮 ' + done + ' / ' + n + ' 处', cssW / 2, cssH - 30);

    /* 点节点进诗 */
    cv.addEventListener('click', function (ev) {
      var rect = cv.getBoundingClientRect();
      var cx = ev.clientX - rect.left;
      var cy = ev.clientY - rect.top;
      for (var i = 0; i < nodes.length; i++) {
        var dx = cx - nodes[i].x, dy = cy - nodes[i].y;
        if (dx * dx + dy * dy < 400) {
          location.hash = '#/poem/' + nodes[i].p.id;
          return;
        }
      }
    });
  }

  /* ---------- 启动 ---------- */

  window.addEventListener('hashchange', route);
  route();
})();
