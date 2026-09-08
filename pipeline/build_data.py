# -*- coding: utf-8 -*-
"""
数据管线：PoeMath 课内必背数据 -> 小工具离线数据 poems.js

输入: pipeline/raw/poems_core.json (130 首, 部编版 1-6 年级课内)
输出: dist/assets/poems.js   window.POEMS = [...]

构建期完成的事（运行时不做任何重型计算）：
1. 字段精简与压缩命名
2. 拼音声调解析 -> 每字平仄 (1/2 声=平, 3/4 声=仄, 轻声=0)
3. 韵脚归组 -> 每行 rhyme group id
4. 意象关键词扫描 -> 场景渲染标签
5. 起承转合分段
6. 意象索引预聚合
"""
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, 'raw', 'poems_core.json')
OUT = os.path.normpath(os.path.join(BASE, '..', 'dist', 'assets', 'poems.js'))

# ---------- 拼音声调 ----------

TONE_MARKS = {}
for _v, _marks in [
    ('a', 'āáǎà'), ('e', 'ēéěè'), ('i', 'īíǐì'),
    ('o', 'ōóǒò'), ('u', 'ūúǔù'), ('v', 'ǖǘǚǜ'),
]:
    for _i, _m in enumerate(_marks):
        TONE_MARKS[_m] = (_v, _i + 1)

INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
            'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w']


def normalize_syllable(token):
    """解析一个拼音 token，返回 (无声调音节, 声调1-4/轻声0, 带调展示形)。
    非拼音返回 None。"""
    plain = []
    display = []
    tone = 0
    for ch in token.lower():
        if ch in TONE_MARKS:
            v, t = TONE_MARKS[ch]
            plain.append(v)
            display.append(ch)
            tone = t
        elif ch.isalpha():
            plain.append(ch)
            display.append(ch)
        # 其余字符（标点/数字）忽略
    s = ''.join(plain)
    if not s:
        return None
    return s, tone, ''.join(display)


def syllable_final(s):
    """取韵母：去声母；再去介音(i/u/v 后随元音或 n/ng 时)以便押韵归组。"""
    for ini in INITIALS:
        if s.startswith(ini) and len(s) > len(ini):
            s = s[len(ini):]
            break
    # 去介音：i/u/v 开头且后面还有元音字母
    if len(s) >= 2 and s[0] in 'iuv' and s[1] in 'aeiouv':
        s = s[1:]
    # 现代读音押韵归并：o/e 同部（鹅/波/歌）
    if s == 'o':
        s = 'e'
    return s


def split_lines(text):
    """content 按 \n 切物理行，去掉空行。"""
    return [ln.strip() for ln in text.split('\n') if ln.strip()]


SENT_END = '，。！？；、：…,.?!:;'
PUNCT_MAP = {',': '，', '.': '。', '?': '？', '!': '！', ':': '：', ';': '；'}


def split_sentences(line):
    """物理行切成展示句：遇标点即断句；展示标点统一为全角。"""
    for k, v in PUNCT_MAP.items():
        line = line.replace(k, v)
    sents, buf = [], ''
    for ch in line:
        buf += ch
        if ch in '，。！？；、：…':
            sents.append(buf)
            buf = ''
    if buf.strip():
        sents.append(buf)
    return [s for s in sents if HANZI_RE.search(s)]


HANZI_RE = re.compile(r'[一-鿿]')


def align_pinyin(content_lines, pinyin_text):
    """
    把 pinyin 字段按行对齐到 content 行的汉字。
    返回 (tones, pys, plains)：每行一个数组，与该行汉字一一对应；
    pys 为带调展示形，plains 为无声调音节（押韵用）。
    对不上时该行返回 None（前端降级为不显示平仄/拼音）。
    """
    py_lines = [ln.strip() for ln in (pinyin_text or '').split('\n') if ln.strip()]
    tones, pys, plains = [], [], []
    for i, line in enumerate(content_lines):
        hanzi = [c for c in line if HANZI_RE.match(c)]
        if i >= len(py_lines):
            tones.append(None); pys.append(None); plains.append(None)
            continue
        tokens = []
        for tok in py_lines[i].split():
            ns = normalize_syllable(tok)
            if ns:
                tokens.append(ns)
        if len(tokens) != len(hanzi):
            tones.append(None); pys.append(None); plains.append(None)
            continue
        tones.append([t for _, t, _ in tokens])
        pys.append([d for _, _, d in tokens])
        plains.append([s for s, _, _ in tokens])
    return tones, pys, plains


def build_rhyme(pys):
    """
    对偶数句(索引1,3,5…)的末字韵母归组；首句入韵也考虑。
    返回每句的韵组 id（相同韵母同组），不押韵句为 None。
    """
    finals = []
    for i, line_py in enumerate(pys):
        if line_py:
            finals.append(syllable_final(line_py[-1]))
        else:
            finals.append(None)
    groups = {}
    next_id = 0
    counts = {}
    for f in finals:
        if f:
            counts[f] = counts.get(f, 0) + 1
    result = []
    for i, f in enumerate(finals):
        # 至少两句同韵才算押上；偶数句优先，首句若同韵也标
        if f and counts.get(f, 0) >= 2 and (i % 2 == 1 or i == 0):
            if f not in groups:
                groups[f] = next_id
                next_id += 1
            result.append(groups[f])
        else:
            result.append(None)
    return result


def flatten_sentences(phys_lines, phys_tones, phys_pys, phys_plains):
    """
    物理行 -> 句。每句从所在物理行的声调/拼音数组中顺序切片，
    物理行对齐失败时其所有句的对应数组为 None。
    返回 (lines, tones, pys, plains)。
    """
    lines, tones, pys, plains = [], [], [], []
    for i, pl in enumerate(phys_lines):
        sents = split_sentences(pl)
        pt = phys_tones[i] if i < len(phys_tones) else None
        pp = phys_pys[i] if i < len(phys_pys) else None
        pln = phys_plains[i] if i < len(phys_plains) else None
        cursor = 0
        for s in sents:
            n = len([c for c in s if HANZI_RE.match(c)])
            lines.append(s)
            if pt is None or pp is None or pln is None or cursor + n > len(pt):
                tones.append(None)
                pys.append(None)
                plains.append(None)
            else:
                tones.append(pt[cursor:cursor + n])
                pys.append(pp[cursor:cursor + n])
                plains.append(pln[cursor:cursor + n])
            cursor += n
    return lines, tones, pys, plains


# ---------- 意象关键词表（顺序即渲染优先级） ----------

IMAGERY = [
    ('moon',     ['明月', '月', '皓月', '月色', '月光']),
    ('sun',      ['旭日', '夕阳', '落日', '白日', '红日', '日']),
    ('star',     ['星', '银河', '牵牛', '织女']),
    ('rain',     ['雨', '霖']),
    ('snow',     ['雪', '霜', '冰']),
    ('wind',     ['风']),
    ('cloud',    ['云', '雾', '霞', '烟']),
    ('mountain', ['山', '峰', '岭', '岳', '岩', '嶂']),
    ('water',    ['江', '河', '湖水', '湖', '海', '溪', '潭', '泉', '波', '水']),
    ('willow',   ['柳']),
    ('flower',   ['花', '梅', '荷', '莲', '菊', '桃花', '杏', '桂花', '芦花', '葵']),
    ('grass',    ['草', '原', '苔']),
    ('tree',     ['松', '竹', '枫', '林', '树', '桑', '榆']),
    ('field',    ['田', '禾', '麦', '稻', '锄', '耕']),
    ('boat',     ['舟', '船', '帆', '橹', '渔火']),
    ('bird',     ['鸟', '雁', '鹅', '鸭', '莺', '燕', '鹤', '鹊', '鸥', '鹭', '鹂', '子规', '杜鹃', '蝉', '萤']),
    ('horse',    ['马', '骑']),
    ('building', ['楼', '亭', '台', '阁', '寺', '桥', '城', '门', '墙', '篱', '村', '舍', '店', '庙', '家', '园', '阶']),
    ('lamp',     ['灯', '烛', '火', '烛光']),
    ('person',   ['人', '童', '儿', '翁', '客', '君', '女', '郎', '夫', '牧', '僧']),
]

MAX_IMAGERY = 6  # 每首诗最多参与渲染的意象数，避免画面过杂


def scan_imagery(text):
    hits = []
    for key, words in IMAGERY:
        for w in words:
            if w in text:
                hits.append(key)
                break
    return hits[:MAX_IMAGERY]


# ---------- 起承转合 ----------

def segment(n_lines):
    """返回 4 段 ('起承转合') 各自覆盖的行数。"""
    if n_lines <= 4:
        base = [1] * n_lines + [0] * (4 - n_lines)
        return base
    if n_lines % 4 == 0:
        return [n_lines // 4] * 4
    q, r = divmod(n_lines, 4)
    return [q + (1 if i < r else 0) for i in range(4)]


# ---------- 氛围（季节 / 时辰） ----------

SEASON_WORDS = [
    ('spring', ['春', '柳绿', '莺', '燕']),
    ('summer', ['夏', '荷', '莲', '蝉', '暑']),
    ('autumn', ['秋', '霜', '枫', '菊', '雁']),
    ('winter', ['冬', '雪', '冰', '寒梅', '腊月']),
]
TOD_WORDS = [
    ('dawn', ['晓', '早', '朝', '晨曦', '日出']),
    ('dusk', ['夕', '暮', '落日', '夕阳', '黄昏', '晚霞']),
    ('night', ['夜', '晚', '月', '星', '灯', '烛']),
]


def detect_mood(text):
    """[season|None, tod|None]，按词表顺序先中先得。"""
    season = None
    for key, words in SEASON_WORDS:
        if any(w in text for w in words):
            season = key
            break
    tod = None
    for key, words in TOD_WORDS:
        if any(w in text for w in words):
            tod = key
            break
    return [season, tod]


# ---------- 对仗联 ----------

def find_couplets(lines):
    """
    律诗/排律取颔联颈联（句3-4、句5-6）做对仗练习素材。
    仅当两联各自字数相等且为 5/7 言时采用。返回句索引对列表。
    """
    if len(lines) < 8 or len(lines) % 2 != 0:
        return []
    pairs = [(2, 3), (4, 5)]
    out = []
    for a, b in pairs:
        la = len([c for c in lines[a] if HANZI_RE.match(c)])
        lb = len([c for c in lines[b] if HANZI_RE.match(c)])
        if la == lb and la in (5, 7):
            out.append([a, b])
    return out


# ---------- 主流程 ----------

def main():
    with open(RAW, encoding='utf-8') as f:
        src = json.load(f)

    poems = []
    align_fail = 0
    for p in src:
        phys = split_lines(p['content'])
        pt, pp, pln = align_pinyin(phys, p.get('pinyin'))
        if any(t is None for t in pt):
            align_fail += 1
        lines, tones, pys, plains = flatten_sentences(phys, pt, pp, pln)
        rhyme = build_rhyme(plains)
        full_text = p['content']
        item = {
            'id': p['id'],
            't': p['title'],
            'a': p['author'],
            'd': p['dynasty'],
            'g': p.get('grade'),
            's': p.get('semester'),
            'l': lines,
            'tones': tones,
            'py': pys,
            'rhyme': rhyme,
            'img': scan_imagery(full_text),
            'tr': p.get('translation') or '',
            'an': [{'w': x['word'], 'm': x['meaning']}
                   for x in (p.get('annotations') or [])],
            'ap': p.get('appreciation') or '',
            'bg': p.get('background') or '',
            'fl': p.get('famous_lines') or [],
            'tg': p.get('tags') or [],
            'seg': segment(len(lines)),
            'mood': detect_mood(full_text),
            'cpl': find_couplets(lines),
        }
        poems.append(item)

    # 意象索引预聚合
    index = {}
    for p in poems:
        for key in p['img']:
            index.setdefault(key, []).append(p['id'])
    img_index = [{'k': k, 'n': len(v)} for k, v in
                 sorted(index.items(), key=lambda kv: -len(kv[1]))]

    # 作者索引：仅保留有课内诗入选的作者
    authors = []
    try:
        with open(os.path.join(BASE, 'raw', 'authors.json'), encoding='utf-8') as f:
            authors_raw = json.load(f)
        core_ids = set(p['id'] for p in poems)
        for a in authors_raw:
            ids = [pid for pid in (a.get('representative_works') or [])
                   if pid in core_ids]
            # representative_works 不全，按姓名再扫一遍
            by_name = [p['id'] for p in poems if p['a'] == a['name']]
            for pid in by_name:
                if pid not in ids:
                    ids.append(pid)
            if not ids:
                continue
            authors.append({
                'n': a['name'],
                'd': a.get('dynasty') or '',
                'ly': a.get('life_years') or '',
                'ti': a.get('title') or '',
                'br': a.get('brief') or '',
                'ids': ids,
            })
        authors.sort(key=lambda x: -len(x['ids']))
    except FileNotFoundError:
        print('WARN: authors.json 缺失，跳过作者索引')

    payload = 'window.POEMS=' + json.dumps(poems, ensure_ascii=False, separators=(',', ':')) + \
        ';window.IMG_INDEX=' + json.dumps(img_index, ensure_ascii=False, separators=(',', ':')) + \
        ';window.AUTHORS=' + json.dumps(authors, ensure_ascii=False, separators=(',', ':')) + ';'

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(payload)

    print('poems:', len(poems))
    print('pinyin align failed lines in poems:', align_fail)
    print('imagery kinds:', len(img_index))
    print('authors:', len(authors))
    print('poems with couplets:', sum(1 for p in poems if p['cpl']))
    print('moods:', sum(1 for p in poems if p['mood'][0]), 'seasoned')
    print('output:', OUT, '%.1f KB' % (os.path.getsize(OUT) / 1024))

    # 抽查几首
    for probe in ['静夜思', '咏鹅', '春晓']:
        for p in poems:
            if p['t'] == probe:
                print('---', p['t'], p['a'], '| img:', p['img'], '| rhyme:', p['rhyme'], '| seg:', p['seg'])
                print('    tones:', p['tones'])


if __name__ == '__main__':
    main()
