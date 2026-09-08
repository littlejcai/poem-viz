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
      /* 首次背诵 stage=0；复习会背后 stage 递增 */
      var g = this.data[id] || {};
      g.stage = g.recited ? Math.min((g.stage || 0) + 1, REVIEW_INTERVALS.length) : 0;
      g.recited = Date.now();
      this.data[id] = g;
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
    else {
      state.imgFilter = v === 'list' && parts[1] ? decodeURIComponent(parts[1]) : null;
      renderList();
    }
  }

  function navBar(active) {
    var nav = el('div', 'nav');
    [['list', '诗集'], ['img', '意象'], ['authors', '诗人'], ['practice', '练习']]
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
    /* 每日一诗日签入口 */
    var today = new Date();
    var dayIdx = Math.floor((today - new Date(today.getFullYear(), 0, 1)) / 86400000);
    var daySign = el('span', 'nav-item', '今日日签');
    daySign.addEventListener('click', function () {
      var p = POEMS[dayIdx % POEMS.length];
      showCardSheet('每日一诗 · ' + p.t, window.PoemCards.composeDateCard(p, today), p);
    });
    bar.appendChild(daySign);
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
      ['#/duizhang', '对仗连连看', '律诗对仗字配对 · 感受格律之美']
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
    var btnCard = el('span', 'tool', '诗画卡');
    var btnCopy = el('span', 'tool', '字帖');
    var btnSign = el('span', 'tool', '日签');
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
    btnCard.addEventListener('click', function () {
      showCardSheet('诗画卡 · ' + p.t, window.PoemScene.composeCard(p), p);
    });
    btnCopy.addEventListener('click', function () {
      showCardSheet('描红字帖 · ' + p.t, window.PoemCards.composeCopybook(p), null);
    });
    btnSign.addEventListener('click', function () {
      showCardSheet('每日一诗 · ' + p.t,
        window.PoemCards.composeDateCard(p, new Date()), p);
    });
    bar.appendChild(btnPy);
    bar.appendChild(btnTone);
    bar.appendChild(btnCard);
    bar.appendChild(btnSign);
    bar.appendChild(btnCopy);
    wrap.appendChild(bar);

    /* 背诵档位 */
    var rcBar = el('div', 'recite-bar');
    [['关闭', 0], ['首字提示', 1], ['半隐', 2], ['全隐挑战', 3]].forEach(function (it) {
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
            (state.recite === 1 && hanziIdx > 0);
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

  /* ---------- 启动 ---------- */

  window.addEventListener('hashchange', route);
  route();
})();
