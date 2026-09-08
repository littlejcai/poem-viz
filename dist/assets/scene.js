/* 水墨诗意图渲染器 —— 纯 Canvas 2D，无 WebGL、无外部资源。
 * window.PoemScene.render(canvas, poem, opts)  详情页诗意图
 * window.PoemScene.composeCard(poem)           分享卡片（返回离屏 canvas）
 * 同一首诗用标题+作者做种子，画面确定性可复现。
 */
(function () {
  'use strict';

  /* ---------- 确定性随机 ---------- */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var INK = '#33383f';
  var PAPER = '#f6f1e3';

  function has(poem, key) {
    return poem.img && poem.img.indexOf(key) >= 0;
  }

  /* ---------- 基础笔触 ---------- */

  function ridge(ctx, w, y0, amp, rng, color, alpha) {
    /* 一条山脉轮廓：随机游走的折线 + 二次曲线平滑，向下填充 */
    var pts = [];
    var n = 6 + Math.floor(rng() * 4);
    var x = -w * 0.1;
    var step = (w * 1.2) / n;
    for (var i = 0; i <= n; i++) {
      pts.push([x + i * step, y0 - rng() * amp]);
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, y0 + amp * 0.2);
    for (var j = 0; j < pts.length; j++) {
      var p = pts[j];
      if (j === 0) ctx.lineTo(p[0], p[1]);
      else {
        var prev = pts[j - 1];
        var mx = (prev[0] + p[0]) / 2;
        ctx.quadraticCurveTo(prev[0], prev[1], mx, (prev[1] + p[1]) / 2);
      }
    }
    ctx.lineTo(w * 1.1, y0 + amp * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function mist(ctx, w, y, h, alpha) {
    var g = ctx.createLinearGradient(0, y - h, 0, y + h);
    g.addColorStop(0, 'rgba(246,241,227,0)');
    g.addColorStop(0.5, 'rgba(246,241,227,' + alpha + ')');
    g.addColorStop(1, 'rgba(246,241,227,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - h, w, h * 2);
  }

  /* ---------- 天体 ---------- */

  function moon(ctx, w, h, rng) {
    var r = w * (0.09 + rng() * 0.03);
    var x = w * (0.62 + rng() * 0.2);
    var y = h * (0.16 + rng() * 0.1);
    var glow = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 3.2);
    glow.addColorStop(0, 'rgba(244,232,193,0.55)');
    glow.addColorStop(1, 'rgba(244,232,193,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f4e8c1';
    ctx.fill();
    return { x: x, y: y, r: r };
  }

  function sun(ctx, w, h, rng) {
    var r = w * (0.08 + rng() * 0.03);
    var x = w * (0.2 + rng() * 0.6);
    var y = h * (0.18 + rng() * 0.12);
    var glow = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.6);
    glow.addColorStop(0, 'rgba(214,120,74,0.5)');
    glow.addColorStop(1, 'rgba(214,120,74,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#c96f4a';
    ctx.fill();
  }

  function stars(ctx, w, h, rng) {
    ctx.fillStyle = 'rgba(240,236,220,0.85)';
    for (var i = 0; i < 40; i++) {
      var x = rng() * w, y = rng() * h * 0.4;
      var r = rng() * 1.4 + 0.4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---------- 山水 ---------- */

  function mountains(ctx, w, h, rng) {
    var base = h * 0.52;
    ridge(ctx, w, base, h * 0.16, rng, '#5a7290', 0.22);
    ridge(ctx, w, base + h * 0.05, h * 0.12, rng, '#4a5f78', 0.32);
    ridge(ctx, w, base + h * 0.1, h * 0.08, rng, '#3a4a5e', 0.42);
    mist(ctx, w, base + h * 0.02, h * 0.05, 0.5);
  }

  function water(ctx, w, h, rng, moonPos) {
    var top = h * 0.62;
    var g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, 'rgba(110,138,160,0.28)');
    g.addColorStop(1, 'rgba(110,138,160,0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, w, h - top);
    /* 波纹：长短不一的横向拖笔 */
    ctx.strokeStyle = 'rgba(70,95,125,0.35)';
    ctx.lineCap = 'round';
    for (var i = 0; i < 26; i++) {
      var y = top + (h - top) * (0.08 + rng() * 0.86);
      var len = w * (0.04 + rng() * 0.16);
      var x = rng() * (w - len);
      ctx.lineWidth = 1 + rng() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len / 2, y + (rng() - 0.5) * 3, x + len, y);
      ctx.stroke();
    }
    if (moonPos) {
      /* 月影：水面上一小段竖向碎光 */
      ctx.strokeStyle = 'rgba(244,232,193,0.5)';
      for (var j = 0; j < 8; j++) {
        var ry = top + (h - top) * (0.1 + j * 0.1);
        var rl = moonPos.r * (0.5 + rng());
        var rx = moonPos.x + (rng() - 0.5) * moonPos.r * 1.5;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(rx - rl / 2, ry);
        ctx.lineTo(rx + rl / 2, ry);
        ctx.stroke();
      }
    }
  }

  /* ---------- 天气 ---------- */

  function rain(ctx, w, h, rng) {
    ctx.strokeStyle = 'rgba(90,110,130,0.35)';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    for (var i = 0; i < 60; i++) {
      var x = rng() * w, y = rng() * h * 0.8;
      var len = 10 + rng() * 22;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * 0.18, y + len);
      ctx.stroke();
    }
  }

  function snow(ctx, w, h, rng) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (var i = 0; i < 70; i++) {
      var x = rng() * w, y = rng() * h;
      var r = 0.8 + rng() * 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function wind(ctx, w, h, rng) {
    ctx.strokeStyle = 'rgba(100,110,120,0.28)';
    ctx.lineCap = 'round';
    for (var i = 0; i < 6; i++) {
      var y = h * (0.2 + rng() * 0.5);
      var x0 = w * (0.05 + rng() * 0.2);
      var len = w * (0.3 + rng() * 0.4);
      ctx.lineWidth = 1 + rng() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.bezierCurveTo(x0 + len * 0.3, y - 14 - rng() * 10,
        x0 + len * 0.7, y + 10 + rng() * 8, x0 + len, y - 6);
      ctx.stroke();
    }
  }

  function clouds(ctx, w, h, rng, night) {
    var color = night ? 'rgba(200,200,205,0.12)' : 'rgba(180,190,200,0.22)';
    ctx.fillStyle = color;
    for (var i = 0; i < 4; i++) {
      var cx = w * (0.1 + rng() * 0.8);
      var cy = h * (0.1 + rng() * 0.25);
      var cw = w * (0.16 + rng() * 0.2);
      var ch = cw * 0.28;
      for (var j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.ellipse(cx + (rng() - 0.5) * cw * 0.5, cy + (rng() - 0.5) * ch,
          cw * (0.4 + rng() * 0.3), ch * (0.5 + rng() * 0.3), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* ---------- 植物 ---------- */

  function willow(ctx, x, y, s, rng) {
    ctx.strokeStyle = '#4a4238';
    ctx.lineWidth = s * 0.06;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + s * 0.08, y - s * 0.5, x + s * 0.02, y - s);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(109,139,94,0.75)';
    for (var i = 0; i < 14; i++) {
      var a = (i / 14) * Math.PI - Math.PI * 0.05;
      var sx = x + s * 0.02 + Math.cos(a) * s * 0.25;
      var sy = y - s + Math.sin(a) * s * 0.12;
      ctx.lineWidth = s * 0.016;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + (rng() - 0.5) * s * 0.1,
        sy + s * 0.45, sx + (rng() - 0.5) * s * 0.2, sy + s * (0.55 + rng() * 0.2));
      ctx.stroke();
    }
  }

  function pine(ctx, x, y, s, rng) {
    ctx.strokeStyle = '#3d362e';
    ctx.lineWidth = s * 0.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + s * 0.1, y - s * 0.5, x + s * 0.04, y - s * 0.95);
    ctx.stroke();
    ctx.fillStyle = 'rgba(70,90,80,0.6)';
    for (var i = 0; i < 5; i++) {
      var cy = y - s * (0.4 + i * 0.13);
      var cw = s * (0.3 - i * 0.03);
      ctx.beginPath();
      ctx.ellipse(x + s * 0.05 + (rng() - 0.5) * s * 0.1, cy, cw, cw * 0.32,
        0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function bamboo(ctx, x, y, s, rng) {
    ctx.strokeStyle = 'rgba(90,115,85,0.8)';
    ctx.lineCap = 'round';
    for (var b = 0; b < 4; b++) {
      var bx = x + b * s * 0.12 + (rng() - 0.5) * s * 0.05;
      var bh = s * (0.7 + rng() * 0.3);
      ctx.lineWidth = s * 0.02;
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.quadraticCurveTo(bx + s * 0.03, y - bh * 0.5, bx + s * 0.06, y - bh);
      ctx.stroke();
      for (var seg = 1; seg <= 3; seg++) {
        var sy = y - (bh / 4) * seg;
        ctx.lineWidth = s * 0.008;
        ctx.beginPath();
        ctx.moveTo(bx - s * 0.02, sy);
        ctx.lineTo(bx + s * 0.05, sy - s * 0.01);
        ctx.stroke();
      }
      /* 叶：小撇 */
      ctx.lineWidth = s * 0.014;
      for (var l = 0; l < 4; l++) {
        var ly = y - bh * (0.5 + rng() * 0.45);
        var lx = bx + s * 0.05;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.quadraticCurveTo(lx + s * 0.06, ly - s * 0.02,
          lx + s * (0.1 + rng() * 0.06), ly + s * 0.02);
        ctx.stroke();
      }
    }
  }

  function blossoms(ctx, x, y, s, rng, color) {
    /* 梅式五瓣花簇 */
    ctx.strokeStyle = '#4a4238';
    ctx.lineWidth = s * 0.03;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + s * 0.15, y - s * 0.4, x + s * 0.4, y - s * 0.55);
    ctx.stroke();
    ctx.fillStyle = color;
    for (var i = 0; i < 9; i++) {
      var fx = x + rng() * s * 0.5 - s * 0.02;
      var fy = y - s * (0.2 + rng() * 0.45);
      var fr = s * (0.03 + rng() * 0.02);
      for (var p = 0; p < 5; p++) {
        var a = (p / 5) * Math.PI * 2 + rng() * 0.3;
        ctx.beginPath();
        ctx.arc(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr, fr * 0.7,
          0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#8a4436';
      ctx.beginPath();
      ctx.arc(fx, fy, fr * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
    }
  }

  function grass(ctx, w, h, rng) {
    ctx.strokeStyle = 'rgba(110,130,90,0.55)';
    ctx.lineCap = 'round';
    for (var i = 0; i < 40; i++) {
      var x = rng() * w, y = h * (0.82 + rng() * 0.15);
      var len = 6 + rng() * 14;
      ctx.lineWidth = 1 + rng() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + (rng() - 0.5) * 6, y - len * 0.6,
        x + (rng() - 0.5) * 12, y - len);
      ctx.stroke();
    }
  }

  function field(ctx, w, h, rng) {
    var top = h * 0.66;
    ctx.fillStyle = 'rgba(150,140,95,0.16)';
    ctx.fillRect(0, top, w, h - top);
    ctx.strokeStyle = 'rgba(120,110,70,0.35)';
    ctx.lineWidth = 1;
    for (var i = 0; i < 7; i++) {
      var y = top + (h - top) * (i + 1) / 8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(w * 0.5, y + (rng() - 0.5) * 8, w, y);
      ctx.stroke();
    }
    /* 禾苗 */
    ctx.strokeStyle = 'rgba(100,125,70,0.5)';
    for (var j = 0; j < 30; j++) {
      var x = rng() * w, y2 = top + rng() * (h - top);
      ctx.beginPath();
      ctx.moveTo(x, y2);
      ctx.lineTo(x + (rng() - 0.5) * 3, y2 - 5 - rng() * 6);
      ctx.stroke();
    }
  }

  /* ---------- 点景 ---------- */

  function boat(ctx, x, y, s, rng) {
    ctx.strokeStyle = INK;
    ctx.fillStyle = 'rgba(51,56,63,0.85)';
    ctx.lineCap = 'round';
    /* 船体：弯月形 */
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5, y);
    ctx.quadraticCurveTo(x, y + s * 0.22, x + s * 0.5, y);
    ctx.quadraticCurveTo(x, y + s * 0.08, x - s * 0.5, y);
    ctx.fill();
    /* 帆或篷 */
    if (rng() > 0.4) {
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.02);
      ctx.lineTo(x, y - s * 0.42);
      ctx.lineWidth = s * 0.02;
      ctx.stroke();
      ctx.fillStyle = 'rgba(240,235,220,0.85)';
      ctx.beginPath();
      ctx.moveTo(x + s * 0.02, y - s * 0.4);
      ctx.quadraticCurveTo(x + s * 0.24, y - s * 0.26, x + s * 0.02, y - s * 0.06);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x, y - s * 0.04, s * 0.14, Math.PI, 0);
      ctx.fillStyle = 'rgba(80,70,55,0.8)';
      ctx.fill();
    }
  }

  function person(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(51,56,63,0.9)';
    ctx.beginPath();
    ctx.arc(x, y - s * 0.86, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.2, y);
    ctx.quadraticCurveTo(x - s * 0.16, y - s * 0.6, x, y - s * 0.72);
    ctx.quadraticCurveTo(x + s * 0.16, y - s * 0.6, x + s * 0.2, y);
    ctx.closePath();
    ctx.fill();
  }

  function horse(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(51,56,63,0.85)';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.45, s * 0.34, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.22, y - s * 0.5);
    ctx.quadraticCurveTo(x + s * 0.42, y - s * 0.78, x + s * 0.48, y - s * 0.6);
    ctx.lineTo(x + s * 0.4, y - s * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = s * 0.05;
    ctx.strokeStyle = 'rgba(51,56,63,0.85)';
    ctx.lineCap = 'round';
    var legs = [-0.24, -0.1, 0.1, 0.24];
    for (var i = 0; i < legs.length; i++) {
      ctx.beginPath();
      ctx.moveTo(x + s * legs[i], y - s * 0.32);
      ctx.lineTo(x + s * legs[i] * 1.1, y);
      ctx.stroke();
    }
  }

  function birdsFlying(ctx, w, h, rng, count) {
    ctx.strokeStyle = 'rgba(51,56,63,0.8)';
    ctx.lineCap = 'round';
    var cx = w * (0.25 + rng() * 0.5);
    var cy = h * (0.14 + rng() * 0.16);
    for (var i = 0; i < count; i++) {
      var x = cx + (i - count / 2) * w * 0.055;
      var y = cy + Math.abs(i - count / 2) * h * 0.02 + (rng() - 0.5) * 6;
      var s = w * 0.02;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x - s, y);
      ctx.quadraticCurveTo(x - s * 0.3, y - s * 0.9, x, y);
      ctx.quadraticCurveTo(x + s * 0.3, y - s * 0.9, x + s, y);
      ctx.stroke();
    }
  }

  function goose(ctx, x, y, s) {
    /* 水面白鹅 */
    ctx.fillStyle = 'rgba(250,248,240,0.95)';
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.3, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(250,248,240,0.95)';
    ctx.lineWidth = s * 0.07;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + s * 0.22, y - s * 0.06);
    ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.3, x + s * 0.34, y - s * 0.44);
    ctx.stroke();
    ctx.fillStyle = '#d08030';
    ctx.beginPath();
    ctx.arc(x + s * 0.36, y - s * 0.44, s * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }

  function building(ctx, x, y, s, rng) {
    /* 带挑檐的小屋/楼阁 */
    ctx.fillStyle = 'rgba(51,56,63,0.8)';
    ctx.strokeStyle = 'rgba(51,56,63,0.8)';
    var floors = rng() > 0.6 ? 2 : 1;
    for (var f = 0; f < floors; f++) {
      var fy = y - f * s * 0.42;
      var fw = s * (0.6 - f * 0.1);
      /* 檐 */
      ctx.beginPath();
      ctx.moveTo(x - fw * 0.75, fy - s * 0.32);
      ctx.quadraticCurveTo(x, fy - s * 0.46, x + fw * 0.75, fy - s * 0.32);
      ctx.lineTo(x + fw * 0.6, fy - s * 0.28);
      ctx.lineTo(x - fw * 0.6, fy - s * 0.28);
      ctx.closePath();
      ctx.fill();
      /* 身 */
      ctx.fillRect(x - fw * 0.5, fy - s * 0.28, fw, s * 0.28);
    }
  }

  function bridge(ctx, x, y, s) {
    ctx.strokeStyle = 'rgba(51,56,63,0.75)';
    ctx.lineWidth = s * 0.035;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5, y);
    ctx.quadraticCurveTo(x, y - s * 0.4, x + s * 0.5, y);
    ctx.stroke();
    for (var i = -2; i <= 2; i++) {
      var px = x + i * s * 0.2;
      var py = y - s * 0.4 * (1 - Math.abs(i) * 0.36);
      ctx.lineWidth = s * 0.018;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - s * 0.12);
      ctx.stroke();
    }
  }

  function lampGlow(ctx, x, y, s) {
    var g = ctx.createRadialGradient(x, y, s * 0.1, x, y, s * 1.6);
    g.addColorStop(0, 'rgba(224,150,70,0.65)');
    g.addColorStop(1, 'rgba(224,150,70,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - s * 1.6, y - s * 1.6, s * 3.2, s * 3.2);
    ctx.fillStyle = '#e09646';
    ctx.beginPath();
    ctx.arc(x, y, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------- 专绘：荷花 / 瀑布 / 窗棂 ---------- */

  function lotus(ctx, w, h, rng) {
    /* 荷叶：缺一角扁圆；荷花：层叠花瓣。画在水面区域 */
    var top = h * 0.62;
    for (var i = 0; i < 4; i++) {
      var lx = w * (0.15 + rng() * 0.7);
      var ly = top + (h - top) * (0.25 + rng() * 0.55);
      var lr = w * (0.07 + rng() * 0.05);
      ctx.fillStyle = 'rgba(80,110,80,0.6)';
      ctx.beginPath();
      ctx.ellipse(lx, ly, lr, lr * 0.38, 0, 0.3, Math.PI * 1.9);
      ctx.lineTo(lx, ly);
      ctx.closePath();
      ctx.fill();
      /* 叶脉 */
      ctx.strokeStyle = 'rgba(60,85,60,0.4)';
      ctx.lineWidth = 1;
      for (var v = 0; v < 5; v++) {
        var a = 0.4 + v * 0.5;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + Math.cos(a) * lr * 0.9, ly + Math.sin(a) * lr * 0.34);
        ctx.stroke();
      }
    }
    /* 荷花 1-2 朵 */
    var n = 1 + Math.floor(rng() * 2);
    for (var f = 0; f < n; f++) {
      var fx = w * (0.25 + rng() * 0.5);
      var fy = top + (h - top) * (0.15 + rng() * 0.2);
      var fs = w * (0.05 + rng() * 0.02);
      /* 茎 */
      ctx.strokeStyle = 'rgba(80,110,80,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx, fy + fs * 1.2);
      ctx.quadraticCurveTo(fx + fs * 0.2, fy + fs * 2.2, fx, fy + fs * 3.4);
      ctx.stroke();
      /* 花瓣：两层 */
      for (var layer = 0; layer < 2; layer++) {
        var petals = 6 - layer * 2;
        ctx.fillStyle = layer === 0 ? 'rgba(226,144,152,0.9)' : 'rgba(240,180,190,0.95)';
        for (var p = 0; p < petals; p++) {
          var pa = (p / petals) * Math.PI - Math.PI / 2 + layer * 0.3;
          var px = fx + Math.cos(pa) * fs * (0.5 - layer * 0.18);
          var py = fy + Math.sin(pa) * fs * (0.5 - layer * 0.18) * 0.9;
          ctx.beginPath();
          ctx.ellipse(px, py, fs * 0.22, fs * 0.5, pa + Math.PI / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = '#e8c860';
      ctx.beginPath();
      ctx.arc(fx, fy, fs * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function waterfall(ctx, w, h, rng) {
    /* 两崖夹一瀑：深色崖壁 + 白色坠笔 + 底部雾气 */
    var cx = w * (0.4 + rng() * 0.2);
    var topY = h * 0.18;
    var botY = h * 0.72;
    ctx.fillStyle = 'rgba(58,74,94,0.5)';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.3, botY);
    ctx.quadraticCurveTo(cx - w * 0.26, (topY + botY) / 2, cx - w * 0.14, topY);
    ctx.lineTo(cx - w * 0.02, topY + h * 0.04);
    ctx.quadraticCurveTo(cx - w * 0.1, (topY + botY) / 2, cx - w * 0.06, botY);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.3, botY);
    ctx.quadraticCurveTo(cx + w * 0.26, (topY + botY) / 2, cx + w * 0.14, topY + h * 0.02);
    ctx.lineTo(cx + w * 0.04, topY + h * 0.05);
    ctx.quadraticCurveTo(cx + w * 0.1, (topY + botY) / 2, cx + w * 0.08, botY);
    ctx.closePath();
    ctx.fill();
    /* 水幕 */
    ctx.lineCap = 'round';
    for (var i = 0; i < 12; i++) {
      var wx = cx + (rng() - 0.5) * w * 0.06;
      ctx.strokeStyle = 'rgba(245,245,240,' + (0.35 + rng() * 0.35) + ')';
      ctx.lineWidth = 1.5 + rng() * 2.5;
      ctx.beginPath();
      ctx.moveTo(wx, topY + h * 0.04);
      ctx.quadraticCurveTo(wx + (rng() - 0.5) * 8, (topY + botY) / 2, wx + (rng() - 0.5) * 12, botY);
      ctx.stroke();
    }
    mist(ctx, w, botY, h * 0.07, 0.7);
  }

  function windowFrame(ctx, w, h) {
    /* 窗棂：四角木质框架 + 竖棂，压在画面最上层 */
    ctx.save();
    ctx.fillStyle = 'rgba(74,58,44,0.55)';
    var bw = w * 0.045;
    ctx.fillRect(0, 0, w, bw);            /* 上槛 */
    ctx.fillRect(0, h - bw, w, bw);       /* 下槛 */
    ctx.fillRect(0, 0, bw, h);            /* 左框 */
    ctx.fillRect(w - bw, 0, bw, h);       /* 右框 */
    for (var i = 1; i <= 2; i++) {        /* 竖棂 */
      var x = (w / 3) * i;
      ctx.fillRect(x - bw * 0.3, bw, bw * 0.6, h - bw * 2);
    }
    ctx.fillRect(bw, h * 0.48, w - bw * 2, bw * 0.6); /* 横棂 */
    ctx.restore();
  }

  /* ---------- 印章 ---------- */

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

  /* ---------- 纸纹 ---------- */

  function paperTexture(ctx, w, h, rng, night) {
    ctx.fillStyle = night ? 'rgba(20,24,34,0.06)' : 'rgba(120,100,60,0.05)';
    for (var i = 0; i < 160; i++) {
      ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1);
    }
  }

  /* ---------- 主渲染 ---------- */

  function render(canvas, poem, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var rng = mulberry32(hash(poem.t + '·' + poem.a + (opts.variant || '')));
    var text = poem.t + poem.l.join('');
    var mood = poem.mood || [null, null];
    var season = mood[0], tod = mood[1];
    var night = has(poem, 'moon') || has(poem, 'star') || tod === 'night' ||
      (has(poem, 'lamp') && !has(poem, 'sun'));

    /* 天空：按时辰与季节调色 */
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    if (night) {
      sky.addColorStop(0, '#232c3d');
      sky.addColorStop(0.55, '#3d4a63');
      sky.addColorStop(1, '#5a6b85');
    } else if (tod === 'dusk') {
      sky.addColorStop(0, '#e5c194');
      sky.addColorStop(0.55, '#f0dcc0');
      sky.addColorStop(1, PAPER);
    } else if (tod === 'dawn') {
      sky.addColorStop(0, '#d9e6e2');
      sky.addColorStop(0.6, '#eef0e4');
      sky.addColorStop(1, PAPER);
    } else if (season === 'winter') {
      sky.addColorStop(0, '#d8dfe6');
      sky.addColorStop(0.6, '#e9eae2');
      sky.addColorStop(1, PAPER);
    } else if (season === 'autumn') {
      sky.addColorStop(0, '#e9dcc0');
      sky.addColorStop(0.6, '#f2ead6');
      sky.addColorStop(1, PAPER);
    } else {
      sky.addColorStop(0, '#ece4cf');
      sky.addColorStop(0.6, '#f2ecdb');
      sky.addColorStop(1, PAPER);
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    /* 天体 */
    var moonPos = null;
    if (has(poem, 'star')) stars(ctx, w, h, rng);
    if (has(poem, 'moon')) moonPos = moon(ctx, w, h, rng);
    else if (has(poem, 'sun')) sun(ctx, w, h, rng);
    if (has(poem, 'cloud')) clouds(ctx, w, h, rng, night);

    /* 远景 */
    if (has(poem, 'mountain')) mountains(ctx, w, h, rng);
    if (has(poem, 'field')) field(ctx, w, h, rng);
    if (has(poem, 'water')) water(ctx, w, h, rng, moonPos);

    /* 中景建筑 */
    if (has(poem, 'building')) {
      var bx = rng() > 0.5 ? w * 0.24 : w * 0.76;
      building(ctx, bx, h * 0.62, w * 0.16, rng);
    }

    /* 瀑布专绘：覆盖默认山体 */
    if (/瀑布|飞流/.test(text)) waterfall(ctx, w, h, rng);

    /* 前景植物 */
    var plantX = rng() > 0.5 ? w * 0.16 : w * 0.84;
    var groundY = h * 0.94;
    if (has(poem, 'willow')) willow(ctx, plantX, groundY, h * 0.3, rng);
    else if (has(poem, 'tree')) {
      if (rng() > 0.5) pine(ctx, plantX, groundY, h * 0.26, rng);
      else bamboo(ctx, plantX - w * 0.05, groundY, h * 0.24, rng);
    }
    var isLotus = /[荷莲]/.test(text) && has(poem, 'water');
    if (has(poem, 'flower') && !isLotus) {
      var fx = w - plantX;
      var fColor = night ? 'rgba(200,140,150,0.85)'
        : season === 'autumn' ? 'rgba(181,101,74,0.92)'
        : 'rgba(192,91,107,0.9)';
      blossoms(ctx, fx, groundY, h * 0.24, rng, fColor);
    }
    if (isLotus) lotus(ctx, w, h, rng);
    if (has(poem, 'grass')) grass(ctx, w, h, rng);

    /* 点景 */
    if (has(poem, 'boat')) {
      var by = has(poem, 'water') ? h * (0.72 + rng() * 0.12) : h * 0.8;
      boat(ctx, w * (0.35 + rng() * 0.3), by, w * 0.16, rng);
    }
    if (has(poem, 'bridge') || (has(poem, 'building') && rng() > 0.7)) {
      bridge(ctx, w * 0.5, h * 0.78, w * 0.3);
    }
    if (has(poem, 'person')) {
      person(ctx, w * (0.3 + rng() * 0.4), h * 0.9, h * 0.16);
    }
    if (has(poem, 'horse')) horse(ctx, w * (0.3 + rng() * 0.4), h * 0.9, w * 0.12);
    if (has(poem, 'bird')) {
      var waterFowl = /[鹅鸭鸳]/.test(poem.t + poem.l.join(''));
      if (has(poem, 'water') && (waterFowl || rng() > 0.4)) {
        goose(ctx, w * (0.3 + rng() * 0.3), h * (0.74 + rng() * 0.1), w * 0.14);
      } else {
        birdsFlying(ctx, w, h, rng, 3 + Math.floor(rng() * 4));
      }
    }
    if (has(poem, 'lamp')) {
      lampGlow(ctx, w * (0.35 + rng() * 0.3), h * 0.58, w * 0.05);
    }

    /* 天气覆盖 */
    if (has(poem, 'rain')) rain(ctx, w, h, rng);
    if (has(poem, 'snow')) snow(ctx, w, h, rng);
    if (has(poem, 'wind')) wind(ctx, w, h, rng);

    /* 雾气 + 纸纹 + 边缘墨色 */
    mist(ctx, w, h * 0.58, h * 0.06, night ? 0.25 : 0.4);
    paperTexture(ctx, w, h, rng, night);
    var vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
    vg.addColorStop(0, 'rgba(40,45,55,0)');
    vg.addColorStop(1, night ? 'rgba(10,14,22,0.28)' : 'rgba(80,70,50,0.16)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    /* 窗棂专绘：压在画面最上层（如「床前明月光」） */
    if (/床前|窗/.test(text)) windowFrame(ctx, w, h);

    if (opts.sealText) {
      seal(ctx, w - w * 0.09, h - w * 0.09 - h * 0.02, w * 0.065, opts.sealText);
    }
    return canvas;
  }

  /* ---------- 分享卡片：诗意图 + 诗文 ---------- */

  function composeCard(poem) {
    var W = 750, H = 1000;
    var card = document.createElement('canvas');
    card.width = W;
    card.height = H;
    var ctx = card.getContext('2d');
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    /* 上半：诗意图 */
    var scene = document.createElement('canvas');
    scene.width = W - 48;
    scene.height = 480;
    render(scene, poem, {});
    ctx.drawImage(scene, 24, 24);

    /* 下半：文字 */
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '46px "KaiTi","STKaiti",serif';
    ctx.fillText(poem.t, W / 2, 580);
    ctx.font = '24px serif';
    ctx.fillStyle = '#7a7568';
    ctx.fillText('【' + poem.d + '】' + poem.a, W / 2, 622);

    ctx.font = '30px "KaiTi","STKaiti",serif';
    ctx.fillStyle = INK;
    var lines = poem.l.slice(0, 8);
    var y = 690;
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], W / 2, y);
      y += 46;
    }
    if (poem.l.length > 8) {
      ctx.font = '24px serif';
      ctx.fillStyle = '#7a7568';
      ctx.fillText('……', W / 2, y);
    }

    seal(ctx, W - 96, H - 92, 52, poem.t.charAt(0));
    ctx.font = '20px serif';
    ctx.fillStyle = '#9a9484';
    ctx.textAlign = 'left';
    ctx.fillText('诗画同源 · 小学必背古诗词', 28, H - 32);
    return card;
  }

  window.PoemScene = { render: render, composeCard: composeCard };
})();
