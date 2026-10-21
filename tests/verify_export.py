"""Independent OOXML/openpyxl check of the real exports made by node --test.

Read-only verification: never saves through openpyxl, which drops some shapes.
Run from the app folder after npm test.
"""
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import json
import re
import warnings
import openpyxl

warnings.filterwarnings('ignore', category=UserWarning)
root = Path(__file__).resolve().parents[1]
survey = json.loads((root / 'data/survey.json').read_text())
template = openpyxl.load_workbook(root / 'private-fixtures/envanter-sablonu.xlsx', data_only=False)
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main', 'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart'}

# Questions must remain faithful to the supplied sheet, including the unusual
# motivation section wording. Whitespace and leading question numbers only.
clean = lambda text: re.sub(r'\s+', ' ', str(text)).strip()
for section in survey['sections']:
    source = template.worksheets[section['sheet'] - 1]
    for q in section['questions']:
        row = section['startRow'] + q['number'] - 1
        # Independently match the destination to the question number printed
        # in the ORIGINAL assessment sheet, not to a shared row-offset guess.
        assessment = template.worksheets[section['evaluationSheet'] - 1]
        destination_row = int(re.search(r'\d+$', q['evaluationCell']).group())
        ordinal = assessment.cell(destination_row, 1).value
        if isinstance(ordinal, str):
            ordinal = int(re.match(r'^(\d+)\.', ordinal).group(1))
        assert ordinal == q['number'], (section['id'], q['number'], q['evaluationCell'], ordinal)
        if section['kind'] == 'choice':
            assert q['options'] == [clean(source.cell(row, col).value) for col in (2, 3)]
        else:
            assert q['text'] == re.sub(r'^\d+\s*[.\-]?\s*', '', clean(source.cell(row, 1).value))

for fixture in ('A', 'B', 'mixed', 'roundtrip'):
    path = root / 'test-output' / f'{fixture}.xlsx'
    state = json.loads(path.with_suffix('.json').read_text())
    values = openpyxl.load_workbook(path, data_only=True)
    formulas = openpyxl.load_workbook(path, data_only=False)
    assert values.sheetnames == template.sheetnames
    checks = 0
    for section in survey['sections']:
        source = values.worksheets[section['sheet'] - 1]
        evaluation = values.worksheets[section['evaluationSheet'] - 1]
        for q in section['questions']:
            answer = state['answers'][section['id']][q['id']]
            assert source[q['cell']].value == answer, (fixture, section['id'], q)
            expected = (1 if answer == 'A' else 2) if section['kind'] == 'choice' else answer
            assert evaluation[q['evaluationCell']].value == expected
            checks += 2
    for si, sheet in enumerate(template):
        target = formulas.worksheets[si]
        assert str(sheet.merged_cells) == str(target.merged_cells)
        for row in sheet:
            for c in row:
                if c.data_type == 'f':
                    assert target[c.coordinate].value == c.value
                    assert isinstance(values.worksheets[si][c.coordinate].value, (int, float))
                    checks += 2
    # Independent, explicit scoring keys (not the application's evaluator).
    comm = [state['answers']['communication'][f'communication-{n}'] for n in range(1, 41)]
    assert [values.worksheets[2][f'E{r}'].value for r in range(3, 7)] == [sum(comm[offset::4]) for offset in range(4)]
    behavior = state['answers']['behavior']
    direct = sum(behavior[f'behavior-{n}'] == 'A' for n in [3, 4, 5, 10, 11, 14, 16, 20, 21, 22, 24, 26, 27, 28])
    people = sum(behavior[f'behavior-{n}'] == 'A' for n in [1, 2, 6, 7, 8, 9, 12, 13, 15, 17, 18, 19, 23, 25])
    assert [values.worksheets[4][r].value for r in ['G17', 'H17', 'J17', 'K17']] == [direct, 14-direct, people, 14-people]
    motiv = state['answers']['motivation']
    groups = [[1, 5, 6, 12, 13, 22, 23, 32, 33, 38], [3, 8, 9, 14, 15, 20, 21, 28, 29, 36], [2, 7, 16, 17, 24, 26, 27, 34, 37, 40], [4, 10, 11, 18, 19, 25, 30, 31, 35, 39]]
    assert [values.worksheets[6][f'K{r}'].value for r in range(4, 8)] == [sum(motiv[f'motivation-{n}'] for n in group) for group in groups]
    keys = {2:'B', 3:'A', 4:'A', 5:'A', 6:'B', 7:'B', 9:'B', 10:'A', 11:'A', 12:'A', 13:'A', 15:'A', 16:'B', 17:'B', 18:'B', 20:'B', 21:'B', 22:'A', 23:'B', 25:'B', 26:'A', 28:'A', 29:'B'}
    score = sum(state['answers']['control'][f'control-{n}'] == key for n, key in keys.items())
    assert values.worksheets[8]['F30'].value == score
    assert values.worksheets[8]['D30'].value is None
    with ZipFile(path) as z:
        for name in z.namelist():
            if name.endswith('.xml') or name.endswith('.rels'): ET.fromstring(z.read(name))
        drawing = ET.fromstring(z.read('xl/drawings/drawing1.xml'))
        texts = [n.text for n in drawing.findall('.//a:t', ns)]
        assert 'Ad- Soyad: ' + state['profile']['name'] in texts
        assert 'Unvan: ' + state['profile']['title'] in texts
        chart = ET.fromstring(z.read('xl/charts/chart1.xml'))
        assert [int(n.text) for n in chart.findall('.//c:numCache/c:pt/c:v', ns)] == [sum(comm[i::4]) for i in range(4)]
    print(f'{fixture}: {checks} cell/formula checks, all scoring keys, identity, chart cache and XML package valid')

print('All 137 questions match the original template. No source workbook was edited.')

# Participant export: no hidden evaluation sheets, formulas, shapes or charts.
answers = openpyxl.load_workbook(root / 'test-output/answers.xlsx', data_only=False)
assert answers.sheetnames == ['Katılımcı'] + [s['sheetName'] for s in survey['sections']]
state = json.loads((root / 'test-output/roundtrip.json').read_text())
for section in survey['sections']:
    sheet = answers[section['sheetName']]
    for q in section['questions']:
        assert sheet[f'D{q["number"]+1}'].value == state['answers'][section['id']][q['id']]
for sheet in answers:
    assert sheet.sheet_state == 'visible'
    for row in sheet:
        assert all(c.data_type != 'f' for c in row)
with ZipFile(root / 'test-output/answers.xlsx') as z:
    assert not any('drawing' in n or 'chart' in n for n in z.namelist())
print('Answer-only export: 5 visible sheets, all 137 answers, no formulas or evaluations.')

def independent_row(state):
    a = state['answers']
    direct = sum(a['behavior'][f'behavior-{n}'] == 'A' for n in [3,4,5,10,11,14,16,20,21,22,24,26,27,28])
    people = sum(a['behavior'][f'behavior-{n}'] == 'A' for n in [1,2,6,7,8,9,12,13,15,17,18,19,23,25])
    comm = [sum(a['communication'][f'communication-{n}'] for n in range(offset,41,4)) for offset in range(1,5)]
    motivation = [sum(a['motivation'][f'motivation-{n}'] for n in group) for group in groups]
    control = sum(a['control'][f'control-{n}'] == key for n,key in keys.items())
    return [direct,14-direct,people,14-people,comm[0],comm[2],comm[3],comm[1],sum(comm),motivation[2],motivation[1],motivation[3],motivation[0],sum(motivation),control]

for count in [1,10,11,25]:
    path = root / f'test-output/team-{count}.xlsx'
    fixture = json.loads(path.with_suffix('.json').read_text())
    values = openpyxl.load_workbook(path, data_only=True).active
    formulas = openpyxl.load_workbook(path, data_only=False).active
    extra = max(0,count-10)
    expected = [independent_row(p['state']) for p in fixture['people']]
    for i, row in enumerate(expected):
        assert values.cell(i+4,1).value == fixture['people'][i]['state']['profile']['name']
        assert [values.cell(i+4,c).value for c in range(4,19)] == row
    for i, col in enumerate(range(4,19)):
        assert abs(values.cell(14+extra,col).value - sum(row[i] for row in expected)/count) < 1e-9
        letter = openpyxl.utils.get_column_letter(col)
        assert formulas.cell(14+extra,col).value == f'=AVERAGE({letter}4:{letter}{3+count})'
    assert [values.cell(16+extra,c).value for c in range(4,19)] == independent_row(fixture['leader']['state'])
    assert f'A{16+extra}:B{16+extra}' in str(formulas.merged_cells)
    assert values['C4'].value == 'Özel renk'
    assert values.column_dimensions['C'].width == 22
    with ZipFile(path) as z:
        for name in z.namelist():
            if name.endswith('.xml') or name.endswith('.rels'): ET.fromstring(z.read(name))
    print(f'Team {count}: all 15 numeric columns, independent means, shifted profile and XML valid.')
