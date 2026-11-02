"""Exercise the same JavaScript used by the offline HTML; no Python product copy."""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]
NODE = os.environ.get("KTL_NODE") or shutil.which("node")
RUNNER = r"""
const api = require(process.argv[1]);
const requests = JSON.parse(require('fs').readFileSync(0, 'utf8'), (_, value) =>
  value === '__NaN__' ? NaN : value === '__Infinity__' ? Infinity : value);
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const results = requests.map(request => {
  const args = freeze(request.args), before = JSON.stringify(args);
  try {
    const value = api[request.operation](...args);
    if (JSON.stringify(args) !== before) throw new Error('Input mutated');
    return { value };
  } catch (error) { return { error: error.code, name: error.name, message: error.message }; }
});
process.stdout.write(JSON.stringify(results));
"""


def invoke(requests):
    assert NODE, "Node 20+ is required; set KTL_NODE if it is not on PATH"
    result = subprocess.run([NODE, "-e", RUNNER, str(ROOT / "src/calc.js")],
                            input=json.dumps(requests), text=True, encoding="utf-8",
                            capture_output=True, check=True)
    return json.loads(result.stdout)


def expanded(case):
    return {"maximum": case["maximum"],
            "repeatability": [{"measured": value} for value in case["repeatability_measured"]],
            "linearity": [{"reference": reference, "measured": reference * (1 + error / 100)}
                          for reference, errors in zip(case["linearity_reference"], case["linearity_error_pct"])
                          for error in errors],
            "sensitivity": [{"errorPct": value + delta} for value in case["sensitivity_mean_pct"]
                            for delta in (-0.1, 0, 0.1)]}


CASES = json.loads((ROOT / "synthetic/calc-cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
@pytest.mark.parametrize("method", ["max_absolute", "signed_mean"])
def test_both_methods_match_synthetic_oracles_without_mutating_input(case, method):
    result = invoke([{"operation": "calculate", "args": [expanded(case), {"linearityMethod": method}]}])[0]
    assert "error" not in result, result
    value, expected = result["value"], case["expected"]
    assert [value["repeatability"][key]["percent"] for key in ("zero", "span")] == pytest.approx(expected["repeatability"], abs=0.0005)
    assert value["linearity"]["method"] == method
    for index, key in enumerate(("low", "high")):
        group = value["linearity"][key]
        for definition in ("max_absolute", "signed_mean"):
            assert group[definition] == pytest.approx(expected[definition][index], abs=0.0005)
        assert group["selected"] == pytest.approx(expected[method][index], abs=0.0005)
    assert value["linearity"]["percent"] == pytest.approx(max(map(abs, expected[method])), abs=0.0005)
    assert value["sensitivity"]["percent"] == pytest.approx(expected["sensitivity"], abs=0.0005)
    assert [group["meanErrorPct"] for group in value["sensitivity"]["groups"]] == pytest.approx(case["sensitivity_mean_pct"], abs=0.0005)


def test_selection_changes_values_and_default_is_conservative():
    data = expanded(CASES[1])
    results = invoke([{"operation": "calculate", "args": [data, options]}
                      for options in ({}, {"linearityMethod": "signed_mean"})])
    assert results[0]["value"]["linearity"]["percent"] == pytest.approx(9)
    assert results[1]["value"]["linearity"]["percent"] == pytest.approx(7)
    assert results[1]["value"]["linearity"]["high"]["selected"] == pytest.approx(-6)


def test_signed_ratio_of_means_and_sensitivity_average_before_absolute():
    rows = [{"reference": value, "measured": value + (1 if value == 1 else 0)} for value in range(1, 6)]
    rows += [{"reference": 10, "measured": 10}] * 5
    results = invoke([{"operation": "linearity", "args": [rows, {"linearityMethod": "signed_mean"}]},
                      {"operation": "sensitivity", "args": [[{"errorPct": value} for value in (-2, 0, 2)] * 10]},
                      {"operation": "repeatability", "args": [[{"measured": 0}] * 10, 20]}])
    assert results[0]["value"]["low"]["signed_mean"] == pytest.approx(100 / 15)
    assert results[1]["value"]["percent"] == pytest.approx(0)
    assert results[2]["value"]["percent"] == 0


@pytest.mark.parametrize("operation,args,code", [
    ("repeatability", [[], 20], "ROW_COUNT"),
    ("repeatability", [[{"measured": 1}] * 9, 20], "ROW_COUNT"),
    ("repeatability", [[{"measured": 1}] * 11, 20], "ROW_COUNT"),
    ("repeatability", [[{"measured": 1}] * 10, 0], "INVALID_MAXIMUM"),
    ("repeatability", [[{"measured": 1}] * 10, -1], "INVALID_MAXIMUM"),
    ("repeatability", [[{"measured": 1}] * 10, "20"], "INVALID_NUMBER"),
    ("repeatability", [[{"measured": None}] * 10, 20], "INVALID_NUMBER"),
    ("repeatability", [[{"measured": ""}] * 10, 20], "INVALID_NUMBER"),
    ("repeatability", [[{"measured": "__NaN__"}] * 10, 20], "INVALID_NUMBER"),
    ("repeatability", [[{"measured": "__Infinity__"}] * 10, 20], "INVALID_NUMBER"),
    ("repeatability", [[None] * 10, 20], "INVALID_NUMBER"),
    ("repeatability", [[{"measured": 1e308}, {"measured": 0}, {"measured": -1e308}, {"measured": 0}] * 2 + [{"measured": 1e308}, {"measured": 0}], 1e-308], "NON_FINITE_RESULT"),
    ("linearity", [[{"reference": 0, "measured": 1}] * 10], "INVALID_REFERENCE"),
    ("linearity", [[{"reference": -1, "measured": 1}] * 10], "INVALID_REFERENCE"),
    ("linearity", [[{"reference": 1}] * 10], "INVALID_NUMBER"),
    ("linearity", [[], {"linearityMethod": "unknown"}], "INVALID_METHOD"),
    ("linearity", [[], None], "INVALID_METHOD"),
    ("sensitivity", [[{"errorPct": 1}] * 29], "ROW_COUNT"),
    ("sensitivity", [[{"errorPct": 1}] * 31], "ROW_COUNT"),
    ("sensitivity", [[{"errorPct": ""}] * 30], "INVALID_NUMBER"),
    ("calculate", [None], "INVALID_INPUT"),
])
def test_invalid_inputs_fail_with_korean_error(operation, args, code):
    result = invoke([{"operation": operation, "args": copy.deepcopy(args)}])[0]
    assert result["error"] == code, result
    assert result["name"] == "CalculationError"
    assert any("가" <= char <= "힣" for char in result["message"])
