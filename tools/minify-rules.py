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
# короткие имена для своих функций
names = re.findall(r'\bfunction (\w+)\(', text)
for i, n in enumerate(sorted(set(names), key=len, reverse=True)):
    short = 'q' + chr(ord('a') + i // 26) + chr(ord('a') + i % 26)
    text = re.sub(r'\b' + n + r'\(', short + '(', text)
# resource.data (но не request.resource.data) → функция
text = text.replace('function qaa(', 'function qaa(', 1)
text = re.sub(r'(?<!request\.)\bresource\.data\b', 'rd()', text)
text = text.replace('match /databases/{database}/documents {', 'match /databases/{database}/documents {\nfunction rd() { return resource.data; }', 1)
text = re.sub(r' ?([(){}\[\],=!<>&|+\-?:;]) ?', r'\1', text)
text = re.sub(r'\b(allow [a-z, ]+):if', r'\1: if', text)
text = text.replace('match/', 'match /').replace('function', 'function ').replace('function  ', 'function ').replace('return', 'return ').replace('return  ', 'return ')
text = re.sub(r'\b(is|in)\b', r' \1 ', text); text = re.sub(r' {2,}', ' ', text)
text = re.sub(r'\blet\b', 'let ', text).replace('let  ', 'let ')
(root / 'firestore.min.rules').write_text(text, encoding='utf-8')
print(f'{len(src)} → {len(text)} символов, {text.count(chr(10))} строк')
if len(text) > 19000:
    sys.exit('Слишком длинно для вставки с телефона (нужно меньше 19 000 символов)')
