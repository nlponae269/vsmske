# Сжимает firestore.rules в firestore.min.rules (это его и вставляют в консоль Firebase).
# Вставка с телефона обрезает текст после 20 000 символов, поэтому:
#  - убираем комментарии и отступы;
#  - склеиваем продолжения условий в одну строку;
#  - заменяем имена наших функций на короткие (логика не меняется, тесты гоняются на сжатом файле).
# Запуск: python3 tools/minify-rules.py
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'firestore.rules').read_text(encoding='utf-8')
lines = []
for line in src.splitlines():
    s = line.strip()
    if s.startswith('//'):
        continue
    s = re.sub(r"\s+//[^']*$", '', s)
    if s:
        lines.append(s)
text = '\n'.join(lines) + '\n'
text = re.sub(r'\n(&&|\|\||\?|:(?!\s*if))', r' \1', text)
text = re.sub(r'[ \t]+', ' ', text)
# короткие имена для своих функций: самые частые получают одну заглавную букву (параметры у нас строчные — не пересекутся)
names = sorted(set(re.findall(r'\bfunction (\w+)\(', text)), key=lambda n: -len(re.findall(r'\b' + n + r'\(', text)))
import string
pool = list(string.ascii_uppercase) + ['Z' + c for c in string.ascii_uppercase]
for n, short in zip(names, pool):
    text = re.sub(r'\b' + n + r'\(', short + '(', text)
# параметры функций → однобуквенные (внутри тела функции)
def rename_params(t):
    out, i = [], 0
    for m in re.finditer(r'function (\w+)\(([^)]*)\)\{', t):
        pass
    res, pos = '', 0
    for m in re.finditer(r'function (\w+)\(([^)]*)\)\{', t):
        if m.start() < pos: continue
        params = [x.strip() for x in m.group(2).split(',') if x.strip()]
        # тело до парной закрывающей скобки
        depth, j = 1, m.end()
        while depth:
            depth += {'{': 1, '}': -1}.get(t[j], 0); j += 1
        body = t[m.end():j]
        letters = iter('ijkmnopquwxyz')
        head = 'function ' + m.group(1) + '('
        newp = []
        for prm in params:
            nl = next(letters)
            while re.search(r'(?<![\w.\'])' + nl + r'(?![\w\'])', body): nl = next(letters)
            body = re.sub(r'(?<![\w.\'])' + prm + r'(?![\w\'])', nl, body); newp.append(nl)
        res += t[pos:m.start()] + head + ','.join(newp) + '){' + body; pos = j
    return res + t[pos:]
# resource.data (но не request.resource.data) → функция
text = re.sub(r'(?<!request\.)\bresource\.data\b', 'rd()', text)
text = text.replace('match /databases/{database}/documents {', 'match /databases/{database}/documents {\nfunction rd() { return resource.data; }', 1)
text = re.sub(r' ?([(){}\[\],=!<>&|+\-?:;]) ?', r'\1', text)
text = rename_params(text)
# частые проверки «владелец — я» → функции
text = text.replace('rd().ownerId==B()', 'ro()').replace('A().ownerId==B()', 'no()')
text = text.replace('function rd(){return resource.data;}', 'function rd(){return resource.data;}function ro(){return rd().ownerId==B();}function no(){return A().ownerId==B();}', 1)
text = re.sub(r'\b(allow [a-z, ]+):if', r'\1:if', text)
text = text.replace('match/', 'match /').replace('function', 'function ').replace('function  ', 'function ').replace('return', 'return ').replace('return  ', 'return ')
text = re.sub(r'\b(is|in)\b', r' \1 ', text); text = re.sub(r' {2,}', ' ', text)
text = re.sub(r'\blet\b', 'let ', text).replace('let  ', 'let ')
# строки склеиваем; перенос оставляем только перед каждым match, чтобы файл можно было окинуть взглядом
text = re.sub(r'\n(?!match )', '', text).replace('\nmatch ', '\nmatch ')
# «вошёл ли» (signed) лишний, если следующая проверка сама читает request.auth.uid: без входа она падает с ошибкой, а это тоже отказ
signed = re.search(r'function (\w+)\(\)\{return request\.auth!=null;\}', text).group(1)
me = re.search(r'function (\w+)\(\)\{return request\.auth\.uid;\}', text).group(1)
text = re.sub(r':if ' + signed + r'\(\)&&(?=(ro\(\)|no\(\)|\w[\w.()\']*[!=]=' + me + r'\(\)|' + me + r'\(\) in [\w.()]+)(&&|;))', ':if ', text)
# то же перед notBanned(): она первой строкой читает профиль по request.auth.uid
nb = re.search(r'function (\w+)\(\)\{let b=\w+\(' + me + r'\(\)\)', text)
if nb: text = text.replace(':if ' + signed + '()&&' + nb.group(1) + '()', ':if ' + nb.group(1) + '()')
# и перед скобкой «(я владелец/отправитель || …)» и isAdmin(): первое, что там считается, — request.auth.uid
adm = re.search(r'function (\w+)\(\)\{return \w+\(' + me + r'\(\)\)\.get\(\'admin\'', text)
first = r'(ro\(\)|rd\(\)\.\w+==' + me + r'\(\)|get\([^()]*\([^()]*\)\)\.data\.\w+==' + me + r'\(\))'
text = re.sub(r':if ' + signed + r'\(\)&&(?=\(' + first + r'\|\||' + first + r'(&&|;))', ':if ', text)
if adm: text = re.sub(r':if ' + signed + r'\(\)&&(?=' + adm.group(1) + r'\(\)(&&|;))', ':if ', text)
text = text.rstrip('\n') + '\n'
(root / 'firestore.min.rules').write_text(text, encoding='utf-8')
print(f'{len(src)} → {len(text)} символов, {text.count(chr(10))} строк')
if len(text) > 19600:
    sys.exit('Слишком длинно для вставки с телефона (нужно меньше 19 600 символов; предел вставки с телефона — 20 000)')
