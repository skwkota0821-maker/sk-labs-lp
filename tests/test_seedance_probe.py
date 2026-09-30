import importlib.util
from pathlib import Path
import unittest

MODULE_PATH = Path(__file__).resolve().parents[1] / "tools" / "seedance_probe.py"
spec = importlib.util.spec_from_file_location("seedance_probe", MODULE_PATH)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class SeedanceRightsGateTest(unittest.TestCase):
    def valid_pack(self):
        return {
            "reference_images": ["https://example.invalid/reference.png"],
            "reference_audio": [],
            "rights_status": "self_owned",
            "consent_status": "not_applicable",
            "contains_personal_data": False,
            "contains_real_human_face": False,
            "las_asset_library_authorized": False,
            "provider_export_allowed": True,
            "portrait_rights_status": "self_owned",
            "voice_rights_status": "self_owned",
        }

    def test_valid_pack_passes(self):
        self.assertEqual(probe.validate_reference_pack(self.valid_pack()), [])

    def test_external_export_denied(self):
        pack = self.valid_pack()
        pack["provider_export_allowed"] = False
        self.assertTrue(probe.validate_reference_pack(pack))

    def test_personal_data_denied(self):
        pack = self.valid_pack()
        pack["contains_personal_data"] = True
        self.assertTrue(probe.validate_reference_pack(pack))

    def test_unlicensed_rights_denied(self):
        pack = self.valid_pack()
        pack["rights_status"] = "prohibited"
        self.assertTrue(probe.validate_reference_pack(pack))

    def test_real_face_requires_asset_library_authorization(self):
        pack = self.valid_pack()
        pack["contains_real_human_face"] = True
        self.assertTrue(probe.validate_reference_pack(pack))
        pack["las_asset_library_authorized"] = True
        self.assertEqual(probe.validate_reference_pack(pack), [])

    def test_payload_is_seedance_25_initial_probe(self):
        payload = probe.build_payload(self.valid_pack(), "test")
        self.assertEqual(payload["model"], "dreamina-seedance-2-5-260628")
        self.assertEqual(payload["duration"], 5)
        self.assertEqual(payload["ratio"], "16:9")
        self.assertEqual(payload["resolution"], "720p")
        self.assertTrue(payload["generate_audio"])
        self.assertEqual(payload["seed"], 42)
        self.assertTrue(payload["return_last_frame"])
        self.assertEqual(payload["content"][1]["role"], "reference_image")

    def test_duration_range_is_enforced(self):
        with self.assertRaises(ValueError):
            probe.build_payload(self.valid_pack(), "test", duration=3)
        with self.assertRaises(ValueError):
            probe.build_payload(self.valid_pack(), "test", duration=31)

    def test_resolution_is_enforced(self):
        with self.assertRaises(ValueError):
            probe.build_payload(self.valid_pack(), "test", resolution="1080p")


if __name__ == "__main__":
    unittest.main()
