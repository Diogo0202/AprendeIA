import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from learning_engine import (
    build_study_recommendations,
    build_topic_mastery,
    classify_mastery,
    infer_subject_category,
    subject_code,
    subject_difficulty,
)


class LearningEngineTests(unittest.TestCase):
    def test_mastery_uses_topic_accuracy_and_minimum_evidence(self):
        self.assertEqual(classify_mastery(90, 2), "developing")
        self.assertEqual(classify_mastery(90, 3), "mastered")
        self.assertEqual(classify_mastery(40, 2), "fragile")

    def test_topic_mastery_keeps_subjects_separate(self):
        mastery = build_topic_mastery(
            [
                {"subject_id": "math", "subject": "Matemática", "topic": "Frações", "correct": False},
                {"subject_id": "math", "subject": "Matemática", "topic": "Frações", "correct": True},
                {"subject_id": "port", "subject": "Português", "topic": "Frações", "correct": True},
            ]
        )

        self.assertEqual(len(mastery), 2)
        self.assertEqual(mastery[0]["status"], "fragile")
        self.assertEqual(mastery[0]["accuracy"], 50.0)

    def test_recommendations_prioritize_matching_incomplete_lesson(self):
        recommendations = build_study_recommendations(
            [
                {
                    "subject_id": "math",
                    "subject": "Matemática",
                    "topic": "Frações",
                    "status": "fragile",
                    "accuracy": 40,
                    "attempts": 5,
                }
            ],
            [
                {"id": "1", "subject_id": "math", "title": "Frações equivalentes", "summary": "", "completed": False},
                {"id": "2", "subject_id": "math", "title": "Porcentagem", "summary": "", "completed": False},
            ],
        )

        self.assertEqual(recommendations[0]["lessons"][0]["id"], "1")

    def test_legacy_subjects_receive_stable_metadata(self):
        self.assertEqual(infer_subject_category("Matemática"), "Ciências Exatas")
        self.assertEqual(subject_code("Língua Portuguesa"), "LP")
        self.assertEqual(subject_difficulty([]), {"label": "A mapear", "tone": "neutral"})


if __name__ == "__main__":
    unittest.main()
