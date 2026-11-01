"""A read's sources: a clip or a PNG folder that holds no frame is refused, never read as zero frames."""
import pytest

from read import mp4_frames, png_frames


def test_missing_clip_is_refused():
    with pytest.raises(FileNotFoundError, match="loop-probe-x.mp4"):
        next(mp4_frames("/nonexistent/loop-probe-x.mp4"))


def test_folder_without_pngs_is_refused(tmp_path):
    with pytest.raises(FileNotFoundError, match="no PNG"):
        next(png_frames(str(tmp_path)))
