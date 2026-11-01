"""The eval's angle wrap (a bone read just across ±180 deg of its truth errs the short way round) and the container's pins."""
import json
import tomllib
from pathlib import Path

from eval import evaluate
from model import wrap

HERE = Path(__file__).resolve().parent.parent


def test_wrap_is_half_open():
    assert wrap(180.0) == -180.0
    assert wrap(-180.0) == -180.0
    assert wrap(190.0) == -170.0
    assert wrap(-190.0) == 170.0
    assert wrap(720.0) == 0.0


def test_angle_error_across_the_wrap(tmp_path):
    # truth: the lean bone (hip -> neckBase) points left and a little down (179 deg); the read a little up (-179 deg)
    truth = {"member": "m", "drawing": "front", "joints": {"hip": [300.0, 300.0], "neckBase": [200.0, 301.745]}, "world": {}}
    (tmp_path / "f000.json").write_text(json.dumps(truth))
    read = {"classes": ["m/front"], "step": 1, "sec_per_frame": 0.1, "frames": [
        {"id": "f000", "drawing": "m/front", "joints": {"hip": [300.0, 300.0], "neckBase": [200.0, 298.255]}}]}
    e = evaluate(read, str(tmp_path))
    assert e["seen"]["accuracy"] == 1.0
    assert abs(e["seen"]["angle_deg"]["median"] - 2.0) < 0.01


def test_container_pins_match_the_project():
    from modal_app import PACKAGES

    deps = tomllib.loads((HERE / "pyproject.toml").read_text())["project"]["dependencies"]
    assert sorted(PACKAGES) == sorted(d for d in deps if not d.startswith("modal=="))
