"""Test editable charts and preserve all original workbook parts using synthetic XML."""
import base64
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile

import pytest

ROOT = Path(__file__).resolve().parents[1]
NODE = os.environ.get("KTL_NODE") or shutil.which("node")
NS = {"m":"http://schemas.openxmlformats.org/spreadsheetml/2006/main", "c":"http://schemas.openxmlformats.org/drawingml/2006/chart", "x":"http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"}
RUNNER = "const api=require(process.argv[1]);const q=JSON.parse(require('fs').readFileSync(0,'utf8'));try{const input={fileName:'synthetic.xlsx',bytes:Uint8Array.from(Buffer.from(q.bytes,'base64'))};let r=api.add(input);if(q.twice)r=api.add(r);process.stdout.write(JSON.stringify({bytes:Buffer.from(r.bytes).toString('base64'),name:r.fileName}));}catch(e){process.stdout.write(JSON.stringify({error:e.code,message:e.message}));}"


def baseline():
    rows = ['<row r="1"><c r="A1" t="inlineStr"><is><t>가짜 각도</t></is></c></row>']
    for i in range(10):
        values = [(0,-10,-5,5,10)[i//2],(30,70)[i%2],i/10-0.5,abs(i/10-0.5)]
        rows.append(f'<row r="{i+2}">' + ''.join(f'<c r="{col}{i+2}" s="2"><v>{value}</v></c>' for col,value in zip('ABCD',values)) + '</row>')
    rows.append('<row r="20"><c r="A20" t="inlineStr"><is><t>원본 문자열 0001</t></is></c></row>')
    sheet = '<worksheet xmlns="'+NS['m']+'"><dimension ref="A1:K20"/><cols><col min="1" max="11" width="26"/></cols><sheetData>'+''.join(rows)+'</sheetData></worksheet>'
    parts = {'xl/workbook.xml':'<workbook xmlns="'+NS['m']+'"><sheets><sheet name="민감도" sheetId="3"/></sheets></workbook>',
             'xl/worksheets/sheet3.xml':sheet,'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
             'xl/worksheets/sheet1.xml':'<original>fixed cells</original>', 'xl/worksheets/sheet5.xml':'<original>raw</original>',
             'xl/worksheets/sheet6.xml':'<original>hashes</original>', 'xl/media/test.bin':b'\x00\xfffake'}
    return parts


def encode(parts):
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_STORED) as z:
        for name,data in parts.items(): z.writestr(name,data)
    return base64.b64encode(stream.getvalue()).decode()


def run(parts=None, **options):
    assert NODE, 'Node 20+ required; set KTL_NODE if needed'
    data={'bytes':encode(parts if parts is not None else baseline()),**options}
    result=subprocess.run([NODE,'-e',RUNNER,str(ROOT/'src/sensitivity-charts.js')],input=json.dumps(data),text=True,encoding='utf-8',capture_output=True,check=True)
    return json.loads(result.stdout)


def test_two_xy_charts_angles_signed_values_formulas_and_same_scale():
    output=run(); assert output['name']=='synthetic.xlsx'
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(output['bytes']))) as z:
        assert z.testzip() is None
        bounds=[]
        for i,column,expected in [(1,'AB',[-0.3,-0.1,-0.5,0.1,0.3]),(2,'AC',[-0.2,0,-0.4,0.2,0.4])]:
            chart=ET.fromstring(z.read(f'xl/charts/chart{i}.xml'))
            assert len(chart.findall('.//c:scatterChart',NS))==1
            assert [float(e.text) for e in chart.findall('.//c:xVal//c:pt/c:v',NS)]==[-10,-5,0,5,10]
            assert [float(e.text) for e in chart.findall('.//c:yVal//c:pt/c:v',NS)]==pytest.approx(expected)
            assert chart.find('.//c:yVal//c:f',NS).text==f"'민감도'!${column}$2:${column}$6"
            bounds.append([e.attrib['val'] for e in chart.findall('.//c:scaling/c:max',NS)])
        assert bounds[0]==bounds[1]
        sheet=ET.fromstring(z.read('xl/worksheets/sheet3.xml'))
        assert sheet.find('.//m:c[@r="AB2"]/m:f',NS).text=='C4'
        drawing=ET.fromstring(z.read('xl/drawings/drawing1.xml'))
        assert len(drawing.findall('x:oneCellAnchor',NS))==2
        assert [e.text for e in drawing.findall('.//x:from/x:row',NS)]==['50','50']
        assert len(ET.fromstring(z.read('[Content_Types].xml')))==3


def test_existing_cells_parts_binary_and_input_remain_unchanged():
    original=baseline(); output=run(original)
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(output['bytes']))) as z:
        for name,data in original.items():
            if name not in ('xl/worksheets/sheet3.xml','[Content_Types].xml'):
                assert z.read(name)==(data.encode() if isinstance(data,str) else data)
        before=ET.fromstring(original['xl/worksheets/sheet3.xml']); after=ET.fromstring(z.read('xl/worksheets/sheet3.xml'))
        for cell in before.findall('.//m:c',NS):
            match=after.find(f'.//m:c[@r="{cell.attrib["r"]}"]',NS)
            assert ET.tostring(match)==ET.tostring(cell)
    assert run(original)['bytes']==output['bytes']


@pytest.mark.parametrize('replacement', ['<v>NaN</v>','<v></v>','<v>Infinity</v>'])
def test_invalid_numbers_rejected(replacement):
    parts=baseline(); parts['xl/worksheets/sheet3.xml']=parts['xl/worksheets/sheet3.xml'].replace('<v>0</v>',replacement,1)
    assert run(parts)['error']=='INVALID_DATA'


def test_duplicate_angle_and_duplicate_charts_rejected():
    parts=baseline(); parts['xl/worksheets/sheet3.xml']=parts['xl/worksheets/sheet3.xml'].replace('<c r="A4" s="2"><v>-10</v>','<c r="A4" s="2"><v>0</v>')
    assert run(parts)['error']=='INVALID_DATA'
    assert run(twice=True)['error']=='ALREADY_CHARTED'


def test_wrong_sheet_and_corrupt_zip_rejected():
    parts=baseline(); parts['xl/workbook.xml']=parts['xl/workbook.xml'].replace('민감도','wrong')
    assert run(parts)['error']=='INVALID_WORKBOOK'
    parts=baseline(); del parts['xl/worksheets/sheet3.xml']
    assert run(parts)['error']=='INVALID_WORKBOOK'


def test_zip_crc_validation():
    blob=bytearray(base64.b64decode(encode(baseline())))
    name_length=int.from_bytes(blob[26:28],'little'); extra_length=int.from_bytes(blob[28:30],'little')
    blob[30+name_length+extra_length]^=1
    result=subprocess.run([NODE,'-e',RUNNER,str(ROOT/'src/sensitivity-charts.js')],input=json.dumps({'bytes':base64.b64encode(blob).decode()}),text=True,encoding='utf-8',capture_output=True,check=True)
    assert json.loads(result.stdout)['error']=='INVALID_WORKBOOK'


def test_zero_series_has_nonzero_axis_range():
    parts=baseline(); tree=ET.fromstring(parts['xl/worksheets/sheet3.xml'])
    for row in range(2,12): tree.find(f'.//m:c[@r="C{row}"]/m:v',NS).text='0'
    parts['xl/worksheets/sheet3.xml']=ET.tostring(tree,encoding='unicode').replace('ns0:','').replace(':ns0','')
    result=run(parts)
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(result['bytes']))) as z:
        chart=ET.fromstring(z.read('xl/charts/chart1.xml'))
        assert chart.findall('.//c:scaling/c:max',NS)[1].attrib['val']=='1'


def test_overflow_and_existing_relationships_are_rejected():
    parts=baseline(); parts['xl/worksheets/sheet3.xml']=parts['xl/worksheets/sheet3.xml'].replace('<v>-0.5</v>','<v>1.7e308</v>')
    assert run(parts)['error']=='INVALID_DATA'
    parts=baseline(); parts['xl/worksheets/_rels/sheet3.xml.rels']='<Relationships/>'
    assert run(parts)['error']=='ALREADY_CHARTED'
