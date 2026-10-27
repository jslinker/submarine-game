"""Pure naming validation; run with python3 -m unittest discover -s tests -p '*_test.py'."""

import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location(
    "render_panoramas", Path(__file__).resolve().parents[1] / "scripts/render_panoramas.py"
)
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


class NamingTests(unittest.TestCase):
    def test_camera_names_are_stable_ids(self):
        self.assertEqual(exporter.plan_cameras(["hall_01", "hall_00"]), [
            ("hall_00", "hall_00", "hall_00.jpg"),
            ("hall_01", "hall_01", "hall_01.jpg"),
        ])

    def test_mapping_selects_cameras_and_names_variants(self):
        self.assertEqual(exporter.plan_cameras(
            ["Camera", "Camera.001", "Reference"],
            {"Camera": "mess_crew", "Camera.001": "hall_03"}, "no_book"
        ), [
            ("Camera", "mess_crew", "mess_crew__no_book.jpg"),
            ("Camera.001", "hall_03", "hall_03__no_book.jpg"),
        ])

    def test_unsafe_or_ambiguous_ids_are_rejected(self):
        for value in ["../hall", "Hall", "hall.001", "hall__00", "hall/00", "", 4]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                exporter.identifier(value)

    def test_duplicate_and_missing_mapping_targets_fail_before_render(self):
        for cameras, mapping in [
            (["a", "b"], {"a": "hall_00", "b": "hall_00"}),
            (["a"], {"absent": "hall_00"}),
            (["a"], {}),
            (["a"], []),
            ([], None),
        ]:
            with self.subTest(mapping=mapping), self.assertRaises(ValueError):
                exporter.plan_cameras(cameras, mapping)

    def test_state_cannot_change_directory_or_collide_with_default(self):
        for state in ["../other", "no__book", "default"]:
            with self.subTest(state=state), self.assertRaises(ValueError):
                exporter.plan_cameras(["hall_00"], state=state)


if __name__ == "__main__":
    unittest.main()
