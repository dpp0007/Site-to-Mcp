import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
import pytest

import robots
import tf


@pytest.fixture(autouse=True)
def offline(monkeypatch, tmp_path):
    monkeypatch.setattr(tf, "CACHE", False)
    monkeypatch.setattr(tf, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(robots, "check", lambda url: (True, "test"))
