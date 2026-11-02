"""Validate actual JS-generated OOXML and original-byte provenance using fake data only."""
import base64
import csv
import hashlib
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
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
TIME = "2026-11-02T14:00:00+09:00"
RUNNER = r"""
(async () => {
 const api = require(process.argv[1]), q = JSON.parse(require('fs').readFileSync(0, 'utf8'));
 q.input.files.forEach(f => f.bytes = Uint8Array.from(f.bytes));
 try {
   const preview = await api.preview(q.input);
   const confirmation = q.unconfirmed ? {} : {reviewKey:preview.reviewKey, confirmedBy:'SYNTH-TESTER', confirmedAt:q.time};
   if (q.mutate === 'metadata') q.input.metadata.model = 'CHANGED';
   if (q.mutate === 'result') q.input.results.repeatability.zero.percent++;
   if (q.mutate === 'bytes') { const b=q.input.files[0].bytes; b[Array.from(b).indexOf(83)]=88; }
   if (q.save) {
     const actions=[];
     const root={getDirectoryHandle:async (name)=>{actions.push(name);return {getFileHandle:async (name,options)=>{
       if (!options?.create) {if(q.exists)return {};const error=new Error();error.name='NotFoundError';throw error;}
       actions.push(name);return {createWritable:async()=>({write:async bytes=>actions.push(bytes.length),close:async()=>actions.push('closed'),abort:async()=>actions.push('aborted')})};
     }}}};
     const result=await api.saveToDirectory(root,q.input,confirmation,{generatedAt:q.time,overwrite:q.overwrite});
     process.stdout.write(JSON.stringify({result,actions}));return;
   }
   const result = await api.build(q.input, confirmation, {generatedAt:q.time});
   process.stdout.write(JSON.stringify({...result, bytes:Buffer.from(result.bytes).toString('base64'), preview}));
 } catch (error) { process.stdout.write(JSON.stringify({error:error.code, message:error.message})); }
})();
"""


def payload():
    files = []
    for kind in ("repeatability", "linearity", "sensitivity"):
        for role in ("result", "source"):
            source = role == "source"
            width = 10 if source else 11
            rows = [["가짜 항목", "SYNTH-ONLY"] + [""] * (width - 2) for _ in range(11)]
            rows[0][1] = '=1+1'
            rows[11:] = [["시험번호" if source else "저장번호"] + [f"가짜 {i}" for i in range(width - 1)],
                         [""] + ["단위"] * (width - 1)]
            count = (30 if kind == "sensitivity" else 10) * (5 if source else 1)
            rows += [[str(index + 1), ' 0001,"가짜" & <값> '] + ["0"] * (width - 2) for index in range(count)]
            stream = io.StringIO(newline="")
            csv.writer(stream, lineterminator="\r\n").writerows(rows)
            files.append({"name": f"SYNTH-{kind}-{role}&.csv", "kind": kind, "role": role,
                          "manual": kind == "linearity", "bytes": list(stream.getvalue().encode("cp949"))})
    return {"toolVersion": "test-0.1.0", "files": files,
            "metadata": {"receiptNo": "26-000001-01", "detailNo": 2, "company": "SYNTH-ONLY",
                         "model": "SYNTH-MODEL", "serial": "SYNTH-0001", "approvalNo": "SYNTH-APPROVAL",
                         "maximum": 20, "testDate": "2026-11-02", "tester": "SYNTH-TESTER",
                         "environment": {"pressure": {"min": 99, "max": 101, "mean": 100},
                                         "temperature": {"min": 19, "max": 21, "mean": 20},
                                         "humidity": {"min": 49, "max": 51, "mean": 50}}},
            "results": {"repeatability": {"zero": {"percent": 0.123456789}, "span": {"percent": 0.2}},
                        "linearity": {"method": "signed_mean", "low": {"selected": 0.3}, "high": {"selected": -0.4}},
                        "sensitivity": {"percent": 0.9, "groups": [
                            {"angleDeg": angle, "rangePct": level, "meanErrorPct": -0.9, "absoluteMeanPct": 0.9}
                            for angle in (0, -10, -5, 5, 10) for level in (30, 70)]}}}


def export(data=None, **options):
    assert NODE, "Node 20+ is required; set KTL_NODE if needed"
    request = {"input": data or payload(), "time": TIME, **options}
    result = subprocess.run([NODE, "-e", RUNNER, str(ROOT / "src/excel.js")], input=json.dumps(request),
                            encoding="utf-8", text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def sheets(output):
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(output["bytes"])))
    assert archive.testzip() is None
    trees = [ET.fromstring(archive.read(f"xl/worksheets/sheet{i}.xml")) for i in range(1, 7)]
    return archive, trees


def cells(tree):
    return {cell.attrib["r"]: (cell.find("m:is/m:t", NS).text or "" if cell.attrib.get("t") == "inlineStr"
                              else float(cell.find("m:v", NS).text))
            for cell in tree.findall(".//m:c", NS)}


def test_six_sheets_fixed_cells_filename_and_no_formulas():
    output = export(); archive, trees = sheets(output)
    assert output["fileName"] == "26-000001-01-2_유속계.xlsx"
    assert output["suggestedDirectory"] == "26-000001-01"
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    assert [s.attrib["name"] for s in workbook.findall("m:sheets/m:sheet", NS)] == ["일반사항", "반복직선성", "민감도", "구조확인", "raw data", "출처"]
    assert [cells(trees[0])[f"B{i}"] for i in range(2, 10)] == ["26-000001-01", "SYNTH-ONLY", "SYNTH-MODEL", "SYNTH-0001", "SYNTH-APPROVAL", 20, "2026-11-02", "SYNTH-TESTER"]
    assert [cells(trees[0])[f"B{i}"] for i in range(11, 20)] == [99,101,100,19,21,20,49,51,50]
    assert cells(trees[1])["B2"] == 0.123456789 and cells(trees[1])["B5"] == -0.4
    assert cells(trees[2])["B13"] == 0.9
    assert not trees[3].findall(".//m:c", NS)
    assert all(not tree.findall(".//m:f", NS) for tree in trees)
    assert all(info.compress_type == 0 for info in archive.infolist())
    for name in archive.namelist():
        ET.fromstring(archive.read(name))


def col_index(name):
    value = 0
    for char in name:
        value = value * 26 + ord(char) - 64
    return value


def col_name(index):
    value = ""
    while index:
        index, remainder = divmod(index - 1, 26); value = chr(65 + remainder) + value
    return value


def test_raw_rows_original_strings_hashes_and_confirmation_trace():
    data = payload(); output = export(data); _, trees = sheets(output)
    raw, provenance = cells(trees[4]), cells(trees[5])
    for index, file in enumerate(data["files"], 2):
        assert provenance[f"A{index}"] == file["name"]
        assert provenance[f"B{index}"] == hashlib.sha256(bytes(file["bytes"])).hexdigest()
        assert provenance[f"E{index}"] == data["toolVersion"] and provenance[f"F{index}"] == TIME
        assert provenance[f"G{index}"] == ("수동 지정" if file["manual"] else "내용 판별")
        assert provenance[f"I{index}"] == "SYNTH-TESTER" and provenance[f"J{index}"] == TIME
        start = col_index(provenance[f"H{index}"])
        rows = list(csv.reader(io.StringIO(bytes(file["bytes"]).decode("cp949"))))
        for row_index, row in enumerate(rows, 1):
            for offset, expected in enumerate(row):
                assert raw.get(f"{col_name(start + offset)}{row_index}", "") == expected


def test_reproducible_bytes_and_order_independence():
    data = payload(); first = export(data)
    data["files"].reverse()
    assert export(data)["bytes"] == first["bytes"]


@pytest.mark.parametrize("mutation", ["metadata", "result", "bytes"])
def test_changed_input_invalidates_confirmation(mutation):
    assert export(mutate=mutation)["error"] == "UNCONFIRMED"


def test_unconfirmed_export_is_rejected():
    assert export(unconfirmed=True)["error"] == "UNCONFIRMED"


@pytest.mark.parametrize("change,code", [
    (lambda p: p["files"].pop(), "FILE_COUNT"),
    (lambda p: p["files"][0].update(role="source"), "CSV_SHAPE"),
    (lambda p: p["metadata"].update(receiptNo="invalid"), "INVALID_RECEIPT"),
    (lambda p: p["metadata"].update(detailNo=0), "INVALID_RECEIPT"),
    (lambda p: p["metadata"].update(maximum=0), "INVALID_NUMBER"),
    (lambda p: p["metadata"].update(model="bad\u0001text"), "INVALID_TEXT"),
    (lambda p: p["results"]["repeatability"]["zero"].update(percent=None), "INVALID_NUMBER"),
    (lambda p: p.update(toolVersion=""), "INVALID_VERSION"),
])
def test_invalid_inputs_fail_in_korean(change, code):
    data = payload(); change(data); result = export(data)
    assert result["error"] == code, result
    assert any("가" <= char <= "힣" for char in result["message"])


def test_bad_time_rejected():
    assert export(time="2026-11-02")["error"] == "INVALID_TIME"


def test_quoted_multiline_cell_preserves_carriage_return():
    data = payload(); file = data["files"][0]
    rows = list(csv.reader(io.StringIO(bytes(file["bytes"]).decode("cp949"))))
    rows[13][1] = '가짜\r\n두 줄'
    stream = io.StringIO(newline="")
    csv.writer(stream, lineterminator="\r\n").writerows(rows)
    file["bytes"] = list(stream.getvalue().encode("cp949"))
    _, trees = sheets(export(data))
    assert cells(trees[4])["B14"] == '가짜\r\n두 줄'


def test_duplicate_assignment_rejected():
    data = payload(); data["files"][0] = data["files"][1]
    assert export(data)["error"] == "FILE_ASSIGNMENT"


def test_missing_original_filename_rejected():
    data = payload(); data["files"][0]["name"] = ""
    assert export(data)["error"] == "INVALID_FILE"


def test_save_uses_receipt_folder_and_expected_filename():
    output = export(save=True)
    assert output["actions"][:2] == ["26-000001-01", "26-000001-01-2_유속계.xlsx"]
    assert output["actions"][2] > 0 and output["actions"][3] == "closed"


def test_existing_file_requires_explicit_overwrite():
    assert export(save=True, exists=True)["error"] == "FILE_EXISTS"
    assert export(save=True, exists=True, overwrite=True)["actions"][-1] == "closed"
