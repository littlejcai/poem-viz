/* 分享卡片作曲家 —— 全部离屏 Canvas 合成，产物给 JSBridge 或预览。
 * window.PoemCards.composeDateCard(poem, date)   每日一诗日签
 * window.PoemCards.composeAwardCard(count, date) 背诵成就奖状
 * window.PoemCards.composeCopybook(poem)         田字格描红字帖
 */
(function () {
  'use strict';

  var INK = '#33383f';
  var PAPER = '#f6f1e3';
  var RED = '#b03a2e';
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  function seal(ctx, x, y, size, text) {
    ctx.save();
    ctx.fillStyle = 'rgba(176,58,46,0.88)';
    var r = size * 0.12;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + size, y, x + size, y + size, r);
    ctx.arcTo(x + size, y + size, x, y + size, r);
    ctx.arcTo(x, y + size, x, y, r);
    ctx.arcTo(x, y, x + size, y, r);
    ctx.fill();
    ctx.fillStyle = '#f6f1e3';
    ctx.font = size * 0.62 + 'px "KaiTi","STKaiti",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + size / 2, y + size / 2 + size * 0.03);
    ctx.restore();
  }

  function fmtDate(d) {
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  /* ---------- 每日一诗日签 ---------- */

  function composeDateCard(poem, date, subtitle) {
    var W = 750, H = 1100;
    var card = document.createElement('canvas');
    card.width = W;
    card.height = H;
    var ctx = card.getContext('2d');
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    /* 顶部日期 */
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7a7568';
    ctx.font = '26px serif';
    ctx.fillText(fmtDate(date) + '　星期' + WEEK[date.getDay()], W / 2, 62);
    ctx.fillStyle = INK;
    ctx.font = '20px serif';
    var sub = subtitle || '每日一诗';
    ctx.fillText(sub.split('').join(' '), W / 2, 100);
    ctx.strokeStyle = '#c9bfa4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, 122);
    ctx.lineTo(W - 60, 122);
    ctx.stroke();

    /* 诗意图 */
    var scene = document.createElement('canvas');
    scene.width = W - 96;
    scene.height = 430;
    window.PoemScene.render(scene, poem, {});
    ctx.drawImage(scene, 48, 146);

    /* 诗文 */
    ctx.fillStyle = INK;
    ctx.font = '44px "KaiTi","STKaiti",serif';
    ctx.fillText(poem.t, W / 2, 660);
    ctx.font = '23px serif';
    ctx.fillStyle = '#7a7568';
    ctx.fillText('【' + poem.d + '】' + poem.a, W / 2, 700);
    ctx.font = '29px "KaiTi","STKaiti",serif';
    ctx.fillStyle = INK;
    var lines = poem.l.slice(0, 7);
    var y = 762;
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], W / 2, y);
      y += 44;
    }
    if (poem.l.length > 7) {
      ctx.font = '22px serif';
      ctx.fillStyle = '#7a7568';
      ctx.fillText('……', W / 2, y);
    }

    seal(ctx, W - 100, H - 96, 54, poem.t.charAt(0));
    ctx.font = '19px serif';
    ctx.fillStyle = '#9a9484';
    ctx.textAlign = 'left';
    ctx.fillText('诗画同源 · 小学必背古诗词', 30, H - 34);
    return card;
  }

  /* ---------- 背诵成就奖状 ---------- */

  var TIERS = [
    [10, '诗童'], [30, '秀才'], [60, '举人'], [100, '状元'], [130, '诗仙']
  ];

  function tierOf(count) {
    var name = '诗童';
    for (var i = 0; i < TIERS.length; i++) {
      if (count >= TIERS[i][0]) name = TIERS[i][1];
    }
    return name;
  }

  function composeAwardCard(count, date) {
    var W = 750, H = 1000;
    var card = document.createElement('canvas');
    card.width = W;
    card.height = H;
    var ctx = card.getContext('2d');

    /* 洒金红底 */
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#8e2f24');
    bg.addColorStop(1, '#a83a2c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(230,190,110,0.25)';
    var rngSeed = 42;
    for (var i = 0; i < 90; i++) {
      rngSeed = (rngSeed * 9301 + 49297) % 233280;
      var rx = (rngSeed / 233280) * W;
      rngSeed = (rngSeed * 9301 + 49297) % 233280;
      var ry = (rngSeed / 233280) * H;
      ctx.fillRect(rx, ry, 2, 2);
    }

    /* 内框 */
    ctx.strokeStyle = '#e6be6e';
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 36, W - 72, H - 72);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(48, 48, W - 96, H - 96);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e6be6e';
    ctx.font = '30px "KaiTi","STKaiti",serif';
    ctx.fillText('奖　　状', W / 2, 150);

    ctx.fillStyle = '#f6e8c8';
    ctx.font = '30px serif';
    ctx.fillText('恭喜小朋友完成背诵', W / 2, 260);

    ctx.font = '110px "KaiTi","STKaiti",serif';
    ctx.fillText(count + '', W / 2, 420);
    ctx.font = '34px serif';
    ctx.fillText('首小学必背古诗词', W / 2, 480);

    ctx.font = '36px "KaiTi","STKaiti",serif';
    ctx.fillText('特授予', W / 2, 580);
    ctx.font = '72px "KaiTi","STKaiti",serif';
    ctx.fillStyle = '#e6be6e';
    ctx.fillText('「' + tierOf(count) + '」', W / 2, 680);
    ctx.fillStyle = '#f6e8c8';
    ctx.font = '30px serif';
    ctx.fillText('称号', W / 2, 740);

    ctx.font = '24px serif';
    ctx.fillText(fmtDate(date), W / 2, 800);

    seal(ctx, W / 2 - 40, H - 150, 80, '诗');
    ctx.textAlign = 'left';
    ctx.font = '19px serif';
    ctx.fillStyle = 'rgba(246,232,200,0.7)';
    ctx.fillText('诗画同源 · 小学必背古诗词', 60, H - 64);
    return card;
  }

  /* ---------- 田字格描红字帖 ---------- */

  function composeCopybook(poem) {
    var W = 750, H = 1060;
    var card = document.createElement('canvas');
    card.width = W;
    card.height = H;
    var ctx = card.getContext('2d');
    ctx.fillStyle = '#fdfbf5';
    ctx.fillRect(0, 0, W, H);

    /* 标题 */
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = '40px "KaiTi","STKaiti",serif';
    ctx.fillText(poem.t + ' · 描红字帖', W / 2, 72);
    ctx.font = '22px serif';
    ctx.fillStyle = '#7a7568';
    ctx.fillText('【' + poem.d + '】' + poem.a, W / 2, 110);

    /* 收集全部汉字 */
    var chars = [];
    for (var i = 0; i < poem.l.length; i++) {
      var line = poem.l[i];
      for (var j = 0; j < line.length; j++) {
        if (/[一-鿿]/.test(line.charAt(j))) chars.push(line.charAt(j));
      }
    }

    var cols = 6;
    var cell = (W - 100) / cols;
    var rows = Math.floor((H - 200) / cell);
    var maxChars = cols * rows;
    if (chars.length > maxChars) chars = chars.slice(0, maxChars);

    var x0 = 50, y0 = 150;
    for (var k = 0; k < chars.length; k++) {
      var col = k % cols;
      var row = Math.floor(k / cols);
      var x = x0 + col * cell;
      var y = y0 + row * cell;

      /* 田字格 */
      ctx.strokeStyle = '#c9bfa4';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, cell, cell);
      ctx.strokeStyle = '#ddd2b8';
      ctx.lineWidth = 1;
      if (ctx.setLineDash) ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x + cell / 2, y);
      ctx.lineTo(x + cell / 2, y + cell);
      ctx.moveTo(x, y + cell / 2);
      ctx.lineTo(x + cell, y + cell / 2);
      ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);

      /* 每行首字黑色示范，其余浅灰描红 */
      var demo = col === 0;
      ctx.fillStyle = demo ? INK : 'rgba(51,56,63,0.18)';
      ctx.font = cell * 0.62 + 'px "KaiTi","STKaiti",serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(chars[k], x + cell / 2, y + cell / 2 + cell * 0.04);
      ctx.textBaseline = 'alphabetic';
    }

    ctx.font = '19px serif';
    ctx.fillStyle = '#9a9484';
    ctx.textAlign = 'left';
    ctx.fillText('诗画同源 · 小学必背古诗词　每行首字为示范，其余请描红', 30, H - 30);
    return card;
  }

  /* ---------- 合照卡：孩子照片 + 诗意图 ---------- */

  function composePhotoCard(poem, photo, date) {
    var W = 750, H = 1000;
    var card = document.createElement('canvas');
    card.width = W;
    card.height = H;
    var ctx = card.getContext('2d');
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    var halfW = 327, phH = 480, top = 24;
    /* 左：照片 cover 裁剪 */
    if (photo && photo.width) {
      var scale = Math.max(halfW / photo.width, phH / photo.height);
      var dw = photo.width * scale, dh = photo.height * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(24, top, halfW, phH);
      ctx.clip();
      ctx.drawImage(photo, 24 + (halfW - dw) / 2, top + (phH - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = '#e9e2cd';
      ctx.fillRect(24, top, halfW, phH);
    }
    /* 右：诗意图 */
    var scene = document.createElement('canvas');
    scene.width = halfW;
    scene.height = phH;
    window.PoemScene.render(scene, poem, {});
    ctx.drawImage(scene, 24 + halfW + 22, top);

    /* 文字区 */
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = '44px "KaiTi","STKaiti",serif';
    ctx.fillText(poem.t, W / 2, 600);
    ctx.font = '23px serif';
    ctx.fillStyle = '#7a7568';
    ctx.fillText('【' + poem.d + '】' + poem.a, W / 2, 640);
    ctx.font = '28px "KaiTi","STKaiti",serif';
    ctx.fillStyle = INK;
    var lines = poem.l.slice(0, 5);
    var y = 706;
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], W / 2, y);
      y += 44;
    }
    ctx.font = '24px serif';
    ctx.fillStyle = '#8a7f63';
    ctx.fillText('我背会了这首诗 · ' + fmtDate(date || new Date()), W / 2, H - 96);

    seal(ctx, W - 100, H - 92, 52, poem.t.charAt(0));
    ctx.font = '19px serif';
    ctx.fillStyle = '#9a9484';
    ctx.textAlign = 'left';
    ctx.fillText('诗画同源 · 小学必背古诗词', 28, H - 32);
    return card;
  }

  /* ---------- 每周战报卡 ---------- */

  function composeWeeklyCard(stats) {
    var W = 750, H = 1000;
    var card = document.createElement('canvas');
    card.width = W;
    card.height = H;
    var ctx = card.getContext('2d');
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    /* 顶部淡墨山影 */
    ctx.fillStyle = 'rgba(90,110,130,0.14)';
    ctx.beginPath();
    ctx.moveTo(0, 210);
    ctx.lineTo(W * 0.25, 110);
    ctx.lineTo(W * 0.5, 190);
    ctx.lineTo(W * 0.75, 90);
    ctx.lineTo(W, 180);
    ctx.lineTo(W, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = '44px "KaiTi","STKaiti",serif';
    ctx.fillText('本周背诗战报', W / 2, 300);
    ctx.font = '22px serif';
    ctx.fillStyle = '#7a7568';
    ctx.fillText(fmtDate(stats.from) + ' — ' + fmtDate(stats.to), W / 2, 344);

    var items = [
      [stats.weekCount + ' 首', '本周背诵'],
      [stats.streak + ' 天', '连续打卡'],
      [stats.total + ' 首', '累计背诵']
    ];
    var colW = W / 3;
    for (var i = 0; i < 3; i++) {
      var cx = colW * i + colW / 2;
      ctx.fillStyle = '#6d5f4b';
      ctx.font = '44px "KaiTi","STKaiti",serif';
      ctx.fillText(items[i][0], cx, 480);
      ctx.fillStyle = '#9a9484';
      ctx.font = '22px serif';
      ctx.fillText(items[i][1], cx, 522);
    }

    ctx.strokeStyle = '#d8d0bc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(80, 570);
    ctx.lineTo(W - 80, 570);
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = '30px "KaiTi","STKaiti",serif';
    var msg = stats.weekCount >= 7 ? '日拱一卒，功不唐捐' :
      stats.weekCount >= 3 ? '积跬步，至千里' : '万事开头难，已出发';
    ctx.fillText(msg, W / 2, 650);
    ctx.font = '26px serif';
    ctx.fillStyle = '#7a7568';
    ctx.fillText('当前称号：' + tierOf(stats.total), W / 2, 706);

    seal(ctx, W / 2 - 40, H - 220, 80, '诗');
    ctx.textAlign = 'left';
    ctx.font = '19px serif';
    ctx.fillStyle = '#9a9484';
    ctx.fillText('诗画同源 · 小学必背古诗词', 28, H - 32);
    return card;
  }

  window.PoemCards = {
    composeDateCard: composeDateCard,
    composeAwardCard: composeAwardCard,
    composeCopybook: composeCopybook,
    composePhotoCard: composePhotoCard,
    composeWeeklyCard: composeWeeklyCard,
    tierOf: tierOf,
    TIERS: TIERS
  };
})();
