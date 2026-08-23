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

    def test_payload_is_seedance_25(self):
        payload = probe.build_payload(self.valid_pack(), "test")
        self.assertEqual(payload["model"], "dreamina-seedance-2-5-260628")
        self.assertEqual(payload["duration"], 5)
        self.assertEqual(payload["ratio"], "16:9")
        self.assertEqual(payload["content"][1]["role"], "reference_image")


if __name__ == "__main__":
    unittest.main()
