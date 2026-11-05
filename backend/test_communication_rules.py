import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from communication_rules import can_start_direct_conversation, direct_conversation_key, validate_message_body


class CommunicationRulesTests(unittest.TestCase):
    def test_student_can_only_start_a_direct_conversation_with_teacher(self):
        self.assertTrue(can_start_direct_conversation("student", "teacher"))
        self.assertFalse(can_start_direct_conversation("student", "student"))
        self.assertFalse(can_start_direct_conversation("student", "admin"))

    def test_teacher_can_message_students_teachers_and_administration(self):
        self.assertTrue(can_start_direct_conversation("teacher", "student"))
        self.assertTrue(can_start_direct_conversation("teacher", "teacher"))
        self.assertTrue(can_start_direct_conversation("teacher", "admin"))

    def test_administration_only_talks_to_teachers(self):
        self.assertTrue(can_start_direct_conversation("admin", "teacher"))
        self.assertFalse(can_start_direct_conversation("admin", "student"))
        self.assertFalse(can_start_direct_conversation("admin", "admin"))

    def test_direct_key_is_stable_for_both_directions(self):
        self.assertEqual(
            direct_conversation_key("b", "a"),
            direct_conversation_key("a", "b"),
        )

    def test_message_keeps_paragraphs_but_rejects_control_characters(self):
        self.assertEqual(validate_message_body("Olá!\nPode me ajudar?"), "Olá!\nPode me ajudar?")
        with self.assertRaises(ValueError):
            validate_message_body("texto\x00oculto")


if __name__ == "__main__":
    unittest.main()
