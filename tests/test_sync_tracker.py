import csv
import io
import unittest

from scripts.sync_tracker import parse_tab, validate_change


def export(rows):
    stream = io.StringIO()
    csv.writer(stream).writerows(rows)
    return stream.getvalue()


class TrackerImportTests(unittest.TestCase):
    def test_unreleased_preserves_first_song_and_skips_era_intro(self):
        text = export([
            ["Era", "Name\n(Join The Discord!)", "Notes", "Track Length", "", "", "Available Length", "Quality", "Link(s)"],
            ["2 Full\n1 Unavailable", "An Era", "", "", "", "", "", "", ""],
            ["An Era", "✨ Song\n(feat. Guest)", "", "3:14", "", "", "Full", "Lossless", "https://example.com/first\nhttps://example.com/second"],
            ["An Era", "🤖 Another Song", "", "", "", "", "Confirmed", "", ""],
        ])
        self.assertEqual(parse_tab(text, "u"), {"An Era": [
            ["Song (feat. Guest)", "Lossless", "3:14", "https://example.com/first"],
            ["Another Song", "Not Available", "", ""],
        ]})

    def test_released_and_album_column_mapping(self):
        for key, heading, tail, quality in [
            ("r", "Length", ["Type", "Streaming", "Link(s)"], "Feature"),
            ("a", "Copy Length", ["Available Length", "Quality", "Link(s)"], "CD Quality"),
        ]:
            row = ["Era Name", "Title", "", "1:23", "", "", "", "https://example.com"]
            row[5 if key == "r" else 6] = quality
            result = parse_tab(export([["Era", "Name", "Notes", heading, ""] + tail, row]), key)
            self.assertEqual(result["Era Name"][0], ["Title", quality, "1:23", "https://example.com"])

    def test_rejects_login_page_or_changed_columns(self):
        for text in ["<html>Sign in</html>", "Era,Name,Notes,Wrong heading"]:
            with self.assertRaises(ValueError):
                parse_tab(text, "u")

    def test_rejects_truncated_data_and_disappearing_eras(self):
        old = {key: {"Era": [["song"]] * 20, "Other": [["song"]]} for key in "ura"}
        for new in [
            {key: {"Era": [["song"]], "Other": [["song"]]} for key in "ura"},
            {key: {"Era": [["song"]] * 21} for key in "ura"},
        ]:
            with self.assertRaises(ValueError):
                validate_change(old, new)


if __name__ == "__main__":
    unittest.main()
