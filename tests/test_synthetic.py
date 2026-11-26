"""Verify generated CSV bytes and independently recompute contract answers."""
import csv
from datetime import datetime, timedelta
from decimal import Decimal as D
import hashlib
import io
import json
from pathlib import Path
import random
import statistics
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "synthetic"


def read_csv(path):
    return list(csv.reader(io.StringIO(path.read_bytes().decode("cp949"))))


@pytest.fixture(params=["set_a", "set_b"])
def fixture_set(request):
    directory = DATA / request.param
    manifest = json.loads((directory / "expected.json").read_text(encoding="utf-8"))
    rows = {(entry["kind"], entry["role"]): read_csv(directory / entry["name"])
            for entry in manifest["files"]}
    return directory, manifest, rows


def test_encoding_shape_spaces_dates_and_hashes(fixture_set):
    directory, manifest, files = fixture_set
    assert manifest["synthetic"] is True
    assert len(list(directory.glob("*.csv"))) == 6
    for entry in manifest["files"]:
        raw = (directory / entry["name"]).read_bytes()
        with pytest.raises(UnicodeDecodeError):
            raw.decode("utf-8")
        assert not raw.startswith(b"\xef\xbb\xbf")
        assert hashlib.sha256(raw).hexdigest() == entry["sha256"]
        rows = files[entry["kind"], entry["role"]]
        source = entry["role"] == "source"
        width = 10 if source else 11
        assert all(len(row) == width for row in rows)
        assert rows[0][1] == "SYNTHETIC-ONLY" and rows[4][1] == "SYNTH-0001"
        assert D(rows[5][1]) == manifest["maximum_m_s"]
        assert [row[0].replace(" ", "") for row in rows[:11]] == [
            "의뢰기관", "주소", "기기의종류", "모델명", "기기번호", "최대유속", "피토관직경",
            "정압구멍의거리", "피토관종류", "교정일", "교정시간"]
        assert any(" " in column for column in rows[11]) == manifest["column_spaces"]
        assert rows[11][0] == ("시험번호" if source else "저장번호")
        assert rows[12][3 if source else 1] == "m/sec"
        expected = (30 if entry["kind"] == "sensitivity" else 10) * (5 if source else 1)
        assert len(rows) == 13 + expected == 13 + entry["data_rows"]
        assert raw.count(b"\r\n") == raw.count(b"\n") == len(rows)
        date = datetime.strptime(rows[9][1], manifest["date_format"])
        if source:
            times = []
            for row in rows[13:]:
                assert datetime.strptime(row[1], manifest["date_format"]) == date
                times.append(datetime.strptime(row[2], "%H:%M:%S"))
            assert all(b - a == timedelta(seconds=1) for a, b in zip(times, times[1:]))


def test_independent_result_calculations(fixture_set):
    _, manifest, files = fixture_set
    oracle = manifest["expected"]
    maximum = D(manifest["maximum_m_s"])
    repeat = files["repeatability", "result"][13:]
    for offset, key in enumerate(("zero", "span")):
        values = [D(row[2]) for row in repeat[offset::2]]
        sample_sd = statistics.stdev(values)
        assert float(sample_sd / maximum * 100) == pytest.approx(oracle["repeatability_pct"][key], abs=0.0005)
    linearity = files["linearity", "result"][13:]
    for start, label in ((0, "30"), (5, "70")):
        group = linearity[start:start + 5]
        reference = [D(row[1]) for row in group]
        measured = [D(row[2]) for row in group]
        first = max(abs((a - b) / a) * 100 for a, b in zip(reference, measured))
        second = (statistics.mean(measured) - statistics.mean(reference)) / statistics.mean(reference) * 100
        assert float(first) == pytest.approx(oracle["linearity_pct"][label]["max_abs_relative_pct"], abs=0.0005)
        assert float(second) == pytest.approx(oracle["linearity_pct"][label]["signed_mean_relative_pct"], abs=0.0005)
    sensitivity = files["sensitivity", "result"][13:]
    errors = [D(row[8]) for row in sensitivity]
    groups = [statistics.mean(errors[start:start + 3]) for start in range(0, 30, 3)]
    assert float(max(map(abs, groups))) == pytest.approx(oracle["sensitivity_pct"], abs=0.0005)
    assert max(map(abs, errors)) > D(str(oracle["sensitivity_pct"]))
    for row in sensitivity + linearity:
        reference, measured = D(row[1]), D(row[2])
        assert float((measured - reference) / reference * 100) == pytest.approx(float(row[8]), abs=0.0005)
    for index, group in enumerate(oracle["sensitivity_groups"]):
        assert group["angle_deg"] == (0, -10, -5, 5, 10)[index // 2]
        assert group["range_pct"] == (30, 70)[index % 2]
        assert float(groups[index]) == pytest.approx(group["mean_error_pct"], abs=0.0005)


def test_source_samples_average_to_result_rows(fixture_set):
    _, _, files = fixture_set
    for kind in ("repeatability", "linearity", "sensitivity"):
        source = files[kind, "source"][13:]
        result = files[kind, "result"][13:]
        for index, row in enumerate(result):
            group = source[index * 5:index * 5 + 5]
            assert [record[0] for record in group] == [str(index + 1)] * 5
            assert all(D(record[3]) == D(row[1]) for record in group)
            assert statistics.mean(D(record[4]) for record in group) == D(row[2])


def test_content_identification_survives_names_and_order(fixture_set):
    directory, manifest, _ = fixture_set
    samples = list(manifest["files"])
    random.Random(42).shuffle(samples)
    for index, entry in enumerate(samples):
        renamed = f"unrelated-{index}.csv"
        rows = read_csv(directory / entry["name"])
        first = rows[11][0].replace(" ", "")
        role = "source" if first == "시험번호" else "result"
        data = rows[13:]
        reference_column = 3 if role == "source" else 1
        stride = 5 if role == "source" else 1
        references = [D(row[reference_column]) for row in data[::stride]]
        kind = "sensitivity" if len(references) == 30 else (
            "repeatability" if references[0] != references[1] else "linearity")
        assert (kind, role) == (entry["kind"], entry["role"]), renamed


def test_cli_is_deterministic_and_detects_stale_bytes(tmp_path):
    command = [sys.executable, str(DATA / "generate.py"), "--output", str(tmp_path)]
    subprocess.run(command, check=True, capture_output=True)
    committed = {path.relative_to(DATA).as_posix(): path.read_bytes()
                 for directory in (DATA / "set_a", DATA / "set_b") for path in directory.iterdir()}
    assert {path.relative_to(tmp_path).as_posix(): path.read_bytes()
            for path in tmp_path.rglob("*") if path.is_file()} == committed
    subprocess.run(command + ["--check"], check=True, capture_output=True)
    target = tmp_path / "set_a/sample_01.csv"
    target.write_bytes(target.read_bytes() + b"corrupted")
    assert subprocess.run(command + ["--check"], capture_output=True).returncode == 1
    subprocess.run(command, check=True, capture_output=True)
    assert target.read_bytes() == committed["set_a/sample_01.csv"]


def test_oracles_cover_zero_mean_and_negative_signed_bias():
    a = json.loads((DATA / "set_a/expected.json").read_text(encoding="utf-8"))["expected"]
    b = json.loads((DATA / "set_b/expected.json").read_text(encoding="utf-8"))["expected"]
    assert a["linearity_pct"]["30"] == {"max_abs_relative_pct": 2, "signed_mean_relative_pct": 0}
    assert b["linearity_pct"]["70"] == {"max_abs_relative_pct": 8, "signed_mean_relative_pct": -6}
    assert a["sensitivity_pct"] == 2 and b["sensitivity_pct"] == 4.8


def test_reference_speed_patterns_match_contract(fixture_set):
    _, manifest, files = fixture_set
    maximum = D(manifest["maximum_m_s"])
    patterns = {
        "repeatability": [D("0.09"), D("0.8")] * 5,
        "linearity": [D("0.3")] * 5 + [D("0.7")] * 5,
        "sensitivity": ([D("0.3")] * 3 + [D("0.7")] * 3) * 5,
    }
    for kind, fractions in patterns.items():
        assert [D(row[1]) / maximum for row in files[kind, "result"][13:]] == fractions
