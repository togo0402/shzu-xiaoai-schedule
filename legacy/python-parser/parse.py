from bs4 import BeautifulSoup
import re, json, time
from urllib.parse import quote

with open('kebiao.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')
SKIP_NAMES = {'wkxx', 'jxbz', 'tzdbh', 'ktmcstr', 'bzstr', 'xsks', 'jxlmc'}

def parse_weeks(s):
    out = []
    for part in s.split(','):
        part = part.strip()
        if '-' in part:
            a, b = part.split('-')
            out.extend(range(int(a), int(b)+1))
        elif part:
            out.append(int(part))
    return out

def parse_sections(s):
    return [int(x) for x in s.split('-') if x.strip()]

courses = []
table = soup.find('table', id='timetable')
for row in table.find_all('tr'):
    if not row.find('th'): continue
    tds = row.find_all('td')
    if not tds: continue
    for day_idx, td in enumerate(tds, start=1):
        for kb in td.find_all('div', class_='kbcontent'):
            valid = []
            for f in kb.find_all('font'):
                if f.get('name') in SKIP_NAMES: continue
                text = f.get_text(strip=True).replace('\n', '')
                if not text: continue
                valid.append((f.get('title'), text))
            for idx, (t, text) in enumerate(valid):
                if t != '周次(节次)': continue
                m = re.search(r'([\d\-,]+)\(周\)\[([\d\-]+)节\]', text)
                if not m: continue
                weeks = parse_weeks(m.group(1))
                secs = parse_sections(m.group(2))
                name = None
                for j in range(idx-1, -1, -1):
                    if not valid[j][0]: name = valid[j][1]; break
                teacher = ''
                for j in range(idx-1, max(idx-5, -1), -1):
                    if valid[j][0] == '教师': teacher = valid[j][1]; break
                position = ''
                for j in range(idx+1, min(idx+4, len(valid))):
                    if valid[j][0] == '教室': position = valid[j][1]; break
                if name:
                    courses.append({
                        'name': name, 'teacher': teacher, 'position': position,
                        'day': day_idx, 'sections': secs, 'weeks': weeks,
                    })

seen = set(); unique = []
for c in courses:
    k = (c['name'], c['day'], tuple(c['sections']), tuple(c['weeks']))
    if k not in seen:
        seen.add(k); unique.append(c)

print(f'解析出 {len(unique)} 门课程')

# 石河子大学节次时间（从你之前 dump 出来的数据抄的）
SHZU_SECTIONS = [
    {"section": 1, "startTime": "10:00", "endTime": "10:45"},
    {"section": 2, "startTime": "10:55", "endTime": "11:40"},
    {"section": 3, "startTime": "12:10", "endTime": "12:55"},
    {"section": 4, "startTime": "13:05", "endTime": "13:50"},
    {"section": 5, "startTime": "16:00", "endTime": "16:45"},
    {"section": 6, "startTime": "16:55", "endTime": "17:40"},
    {"section": 7, "startTime": "18:00", "endTime": "18:45"},
    {"section": 8, "startTime": "18:55", "endTime": "19:40"},
    {"section": 9, "startTime": "20:30", "endTime": "21:15"},
    {"section": 10, "startTime": "21:25", "endTime": "22:10"},
]

# 从你之前 dump 的 localStorage 数据里拿到的学期开始时间戳
# 2026-08-31 00:00:00 +0800
START_SEMESTER = "1788105600000"

timer = {
    "totalWeek": 20,
    "startSemester": START_SEMESTER,
    "startWithSunday": False,
    "showWeekend": True,
    "forenoon": 4,
    "afternoon": 4,
    "night": 2,
    "sections": SHZU_SECTIONS,
}

now_ms = int(time.time() * 1000)
now_str = str(now_ms)

import_data = {
    "isV2": True,
    "t": now_str,
    "parserRes": {"courseInfos": unique},
    "timerRes": timer,
    "schoolName": "石河子大学",
    "feedbackId": f"shzu_{now_str}",
    "id": f"shzu_{now_str}",
}

preset_data = json.dumps(
    {"importData": json.dumps(import_data, ensure_ascii=False)},
    ensure_ascii=False
)

deeplink = (
    "voiceassist://aiweb/?source=widget"
    "&flag=268468224"
    "&url=" + quote("https://i.ai.mi.com/h5/precache/ai-schedule/", safe='')
    + "&presetData=" + quote(preset_data, safe='')
)

print(f'Deep Link 长度: {len(deeplink)} 字符')

with open('deeplink.txt', 'w', encoding='utf-8') as f:
    f.write(deeplink)

# 生成一个 HTML 文件，方便手机上点击
html_out = f'''<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>导入小爱课程表</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{{font-family:sans-serif;padding:20px;text-align:center}}
a{{display:inline-block;padding:16px 32px;background:#ff6b00;color:#fff;
   text-decoration:none;border-radius:8px;font-size:18px;margin-top:20px}}</style>
</head><body>
<h2>石河子大学课表导入</h2>
<p>共 {len(unique)} 门课程</p>
<a href="{deeplink.replace('&', '&amp;')}">点击导入到小爱课程表</a>
</body></html>'''

with open('import.html', 'w', encoding='utf-8') as f:
    f.write(html_out)

print('已生成 deeplink.txt 和 import.html')
print('把 import.html 传到手机，用浏览器打开，点击按钮即可导入')