"""Regression tests for run_discover_plan_score.py threshold parsing + verdict banding.

RED until the `_parse_thresholds` bug is fixed: the parser split each line on `|`, but the
project thresholds file (`.claude/rules/discover-plan-thresholds.txt`) uses the documented
`KEY = VALUE` format (`band.shippable = 90`). The mismatch left `bands = {}`, so `_verdict_for`
fell through to `return "INVALID"` for ANY score — every discovery plan scored INVALID regardless
of quality (a false negative). See ADR 0001-discover-plan-threshold-parse.
"""
from __future__ import annotations

from pathlib import Path

from run_discover_plan_score import _parse_thresholds, _verdict_for


def _write(tmp_path: Path, body: str) -> Path:
    p = tmp_path / "discover-plan-thresholds.txt"
    p.write_text(body, encoding="utf-8")
    return p


_BANDS_KEY_EQUALS_VALUE = (
    "# Verdict bands\n"
    "soft_cap.question_count_low = 3\n"
    "hard_cap.fabricated_citation = 49\n"
    "band.shippable = 90\n"
    "band.shippable_with_caveats = 70\n"
    "band.needs_revision = 50\n"
    "band.invalid = 0\n"
)


def test_parse_thresholds_reads_key_equals_value_band_lines(tmp_path: Path) -> None:
    bands = _parse_thresholds(_write(tmp_path, _BANDS_KEY_EQUALS_VALUE))
    assert bands.get("SHIPPABLE") == 90
    assert bands.get("SHIPPABLE_WITH_CAVEATS") == 70
    assert bands.get("NEEDS_REVISION") == 50


def test_parse_thresholds_ignores_non_band_keys(tmp_path: Path) -> None:
    bands = _parse_thresholds(_write(tmp_path, _BANDS_KEY_EQUALS_VALUE))
    assert "QUESTION_COUNT_LOW" not in bands
    assert "FABRICATED_CITATION" not in bands


def test_high_score_no_hardcaps_is_shippable_not_invalid(tmp_path: Path) -> None:
    """The exact bug: a 99.7 plan with no hard caps must be SHIPPABLE, not INVALID."""
    bands = _parse_thresholds(_write(tmp_path, _BANDS_KEY_EQUALS_VALUE))
    assert _verdict_for(99.7, bands) == "SHIPPABLE"


def test_midband_score_is_needs_revision(tmp_path: Path) -> None:
    bands = _parse_thresholds(_write(tmp_path, _BANDS_KEY_EQUALS_VALUE))
    assert _verdict_for(60.0, bands) == "NEEDS_REVISION"


def test_low_score_is_invalid(tmp_path: Path) -> None:
    bands = _parse_thresholds(_write(tmp_path, _BANDS_KEY_EQUALS_VALUE))
    assert _verdict_for(30.0, bands) == "INVALID"


def test_legacy_pipe_format_still_parses(tmp_path: Path) -> None:
    """Backward-compat: the original `NAME | VALUE` format must keep working."""
    bands = _parse_thresholds(_write(tmp_path, "SHIPPABLE | 90\nNEEDS_REVISION | 50\n"))
    assert bands.get("SHIPPABLE") == 90
    assert _verdict_for(95.0, bands) == "SHIPPABLE"


def test_real_project_thresholds_file_yields_bands() -> None:
    """The checked-in project thresholds file must parse to real bands (not empty)."""
    repo = Path(__file__).resolve()
    while repo != repo.parent and not (repo / ".claude").is_dir():
        repo = repo.parent
    thresholds = repo / ".claude" / "rules" / "discover-plan-thresholds.txt"
    bands = _parse_thresholds(thresholds)
    assert bands, "project thresholds file parsed to EMPTY bands — the bug is back"
    assert _verdict_for(99.7, bands) == "SHIPPABLE"
