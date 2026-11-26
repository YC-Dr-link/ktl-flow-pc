"""Generate deterministic fake wind-tunnel fixtures; never reads real input files."""
import argparse
import csv
from datetime import datetime, timedelta
from decimal import Decimal as D
import hashlib
import io
import json
from pathlib import Path

SETS = {
    "set_a": {"maximum": 20, "date_format": "%m-%d-%Y", "spaced": True,
              "repeat_steps": ("0.001", "0.002"),
              "line_errors": ((1, -1, 2, -2, 0), (-1, 1, -2, 2, 0)),
              "sensitivity": ("0.2", "0.4", "-0.6", "0.8", "-1", "1.2", "-1.4", "1.6", "-1.8", "2")},
    "set_b": {"maximum": 30, "date_format": "%Y-%m-%d", "spaced": False,
              "repeat_steps": ("0.01", "0.02"),
              "line_errors": ((5, 6, 7, 8, 9), (-4, -5, -6, -7, -8)),
              "sensitivity": ("0.5", "-0.8", "1", "-1.2", "2", "-2.4", "3.2", "-3.6", "4.4", "-4.8")},
}
FILES = (("sensitivity", "source"), ("repeatability", "result"), ("linearity", "source"),
         ("sensitivity", "result"), ("repeatability", "source"), ("linearity", "result"))
LABELS = ("의뢰 기관", "주  소", "기기의 종류", "모델명", "기기 번호", "최대 유속",
          "피토관 직경", "정압 구멍의 거리", "피토관 종류", "교 정 일", "교정 시간")
RESULT_COLUMNS = ("저장번호", "기준유속", "측정 유속", "대기압", "피토관 차압", "압 력",
                  "온 도", "상대습도", "오 차", "밀 도", "측정갯수")
SOURCE_COLUMNS = ("시험번호", "시험일", "시험시간", "기준유속", "측정유속", "대기압",
                  "피토관 차압", "압 력", "시스템온도", "습 도")


def number(value):
    return format(value, ".6f")


def measurements(spec, kind):
    maximum = D(spec["maximum"])
    if kind == "repeatability":
        for repeat in range(5):
            for span, fraction in enumerate((D("0.09"), D("0.8"))):
                reference = maximum * fraction
                measured = reference + D(repeat - 2) * maximum * D(spec["repeat_steps"][span])
                yield reference, measured
    elif kind == "linearity":
        for fraction, errors in zip((D("0.3"), D("0.7")), spec["line_errors"]):
            reference = maximum * fraction
            for error in errors:
                yield reference, reference * (1 + D(error) / 100)
    else:
        for group, center in enumerate(spec["sensitivity"]):
            reference = maximum * (D("0.3") if group % 2 == 0 else D("0.7"))
            for delta in (D("-0.1"), D(0), D("0.1")):
                yield reference, reference * (1 + (D(center) + delta) / 100)


def csv_bytes(set_name, spec, kind, role):
    source = role == "source"
    width = 10 if source else 11
    day = datetime(2026, 11, 2 if set_name == "set_a" else 3, 9, 0, 0)
    date = day.strftime(spec["date_format"])
    values = ("SYNTHETIC-ONLY", "가상주소-테스트전용", "유속계", "SYNTH-MODEL", "SYNTH-0001",
              str(spec["maximum"]), "6", "20", "합성 피토관", date, "09:00:00")
    rows = []
    for index, (label, value) in enumerate(zip(LABELS, values)):
        row = [label, value] + [""] * (width - 2)
        if index in (5, 6, 7):
            row[2] = "m/sec" if index == 5 else "mm"
        rows.append(row)
    columns = SOURCE_COLUMNS if source else RESULT_COLUMNS
    rows.append(list(columns) if spec["spaced"] else [c.replace(" ", "") for c in columns])
    date_unit = "월-일-년" if spec["date_format"] == "%m-%d-%Y" else "년-월-일"
    rows.append(["", date_unit, "시:분:초", "m/sec", "m/sec", "kPa", "Pa", "kPa gage", "℃", "%"]
                if source else ["", "m/sec", "m/sec", "kPa", "Pa", "kPa gage", "℃", "%", "%", "kg/㎥", ""])
    for index, (reference, measured) in enumerate(measurements(spec, kind), 1):
        if source:
            for sample in range(5):
                time = day + timedelta(seconds=(index - 1) * 5 + sample)
                value = measured + D(sample - 2) * D(spec["maximum"]) / 10000
                rows.append([str(index), date, time.strftime("%H:%M:%S"), number(reference), number(value),
                             "100.000000", "10.000000", "0.000000", "20.000000", "50.000000"])
        else:
            error = (measured - reference) / reference * 100
            rows.append([str(index), number(reference), number(measured), "100.000000", "10.000000",
                         "0.000000", "20.000000", "50.000000", number(error), "1.200000", "5"])
    output = io.StringIO(newline="")
    csv.writer(output, lineterminator="\r\n").writerows(rows)
    return output.getvalue().encode("cp949")


def truth(spec):
    """Analytic oracle from chosen parameters, independent of CSV reading and production code."""
    root_variance = (D(5) / 2).sqrt()
    line = {}
    for label, errors in zip(("30", "70"), spec["line_errors"]):
        line[label] = {"max_abs_relative_pct": max(map(abs, errors)),
                       "signed_mean_relative_pct": sum(errors) / len(errors)}
    return {"repeatability_pct": {label: float(root_variance * D(step) * 100)
                                  for label, step in zip(("zero", "span"), spec["repeat_steps"])},
            "linearity_pct": line,
            "sensitivity_pct": float(max(abs(D(value)) for value in spec["sensitivity"])),
            "sensitivity_groups": [{"angle_deg": angle, "range_pct": level, "mean_error_pct": float(center)}
                                   for (angle, level), center in zip(((a, v) for a in (0, -10, -5, 5, 10)
                                                                      for v in (30, 70)), spec["sensitivity"])]}


def artifacts():
    output = {}
    for name, spec in SETS.items():
        manifest = {"synthetic": True, "schema_version": 1, "encoding": "cp949", "line_ending": "CRLF",
                    "maximum_m_s": spec["maximum"], "date_format": spec["date_format"],
                    "column_spaces": spec["spaced"], "source_samples_per_result": 5,
                    "calculation_rows": "result CSV only", "stdev": "sample (n-1)",
                    "linearity_method_2": "signed; no absolute value", "files": [], "expected": truth(spec)}
        for index, (kind, role) in enumerate(FILES, 1):
            filename = f"sample_{index:02}.csv"
            data = csv_bytes(name, spec, kind, role)
            output[f"{name}/{filename}"] = data
            count = (30 if kind == "sensitivity" else 10) * (5 if role == "source" else 1)
            manifest["files"].append({"name": filename, "kind": kind, "role": role, "data_rows": count,
                                      "sha256": hashlib.sha256(data).hexdigest()})
        output[f"{name}/expected.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent,
                        help="Output directory for the generated set_a/ and set_b/ fixtures")
    parser.add_argument("--check", action="store_true", help="Check committed bytes without overwriting")
    args = parser.parse_args()
    expected = artifacts()
    stale = []
    for relative, data in expected.items():
        path = args.output / relative
        if args.check:
            if not path.is_file() or path.read_bytes() != data:
                stale.append(relative)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    if stale:
        parser.exit(1, "synthetic: stale or missing: " + ", ".join(stale) + "\n")
    print(f"synthetic: {'checked' if args.check else 'generated'} {len(SETS)} sets, 12 CSV + 2 JSON")
