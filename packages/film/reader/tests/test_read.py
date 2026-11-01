"""A read's sources: a clip or a PNG folder that holds no frame is refused, never read as zero frames."""
import pytest

import read
from read import mp4_frames, png_frames


def test_missing_clip_is_refused():
    with pytest.raises(FileNotFoundError, match="loop-probe-x.mp4"):
        next(mp4_frames("/nonexistent/loop-probe-x.mp4"))


def test_folder_without_pngs_is_refused(tmp_path):
    with pytest.raises(FileNotFoundError, match="no PNG"):
        next(png_frames(str(tmp_path)))


class _OpensEmpty:
    """A capture that opens and decodes no frame."""

    def __init__(self, path):
        self.path = path

    def isOpened(self):
        return True

    def read(self):
        return False, None

    def release(self):
        pass


def test_clip_that_opens_and_decodes_no_frame_is_refused(tmp_path, monkeypatch):
    clip = tmp_path / "empty.mp4"
    clip.write_bytes(b"not a video")
    monkeypatch.setattr(read.cv2, "VideoCapture", _OpensEmpty)
    with pytest.raises(FileNotFoundError, match="decodes no frame"):
        list(mp4_frames(str(clip)))
