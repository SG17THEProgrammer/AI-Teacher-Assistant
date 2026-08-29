"""
Two extra test-data scenarios beyond the original 4, covering paths those
don't exercise: an image (not PDF) answer-sheet upload, and a case with
extra/duplicate-numbered answers (orphans) alongside a diagram/table block.

Reuses generate_test_data.py's PDF-building helpers so question papers stay
consistent with the existing scenarios.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from generate_test_data import (  # noqa: E402
    OUT_ROOT, make_question_paper, make_answer_sheet, write_json,
)
from PIL import Image, ImageDraw, ImageFont  # noqa: E402


# ---------------------------------------------------------------------------
# Scenario 5: image-upload -- answer sheet is a JPEG photo, not a PDF, so it
# exercises normalizeImageUpload() + Gemini vision with no PDF text layer at
# all (the exact real-world "photo of a handwritten sheet" path).
# ---------------------------------------------------------------------------
def scenario_5():
    d = os.path.join(OUT_ROOT, "scenario-5-image-upload")
    os.makedirs(d, exist_ok=True)

    questions = [
        (1, "What is photosynthesis?", 3),
        (2, "Name the raw materials required for photosynthesis.", 2),
        (3, "Where does photosynthesis mainly take place in a leaf?", 2),
    ]
    make_question_paper(os.path.join(d, "question-paper.pdf"), "Class 7 Biology - Quiz", questions)

    answers_text = [
        ("1", "Photosynthesis is the process by which green plants make their own food using"),
        ("", "sunlight, water, and carbon dioxide, releasing oxygen as a byproduct."),
        ("2", "The raw materials are water, carbon dioxide, and sunlight (plus chlorophyll)."),
        ("3", "Photosynthesis mainly takes place in the chloroplasts of leaf cells."),
    ]

    width, height = 1240, 1754  # ~150dpi A4
    margin_x = 70
    max_text_width = width - 2 * margin_x
    img = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('Helvetica.ttc', 32)
    except Exception:
        font = ImageFont.load_default()

    def wrap(text, indent_px):
        words = text.split()
        lines, current = [], ""
        for word in words:
            trial = f"{current} {word}".strip()
            if draw.textlength(trial, font=font) <= max_text_width - indent_px:
                current = trial
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines

    y = 90
    draw.text((margin_x, y), "Answer Sheet - Roll No. 8", fill='black', font=font)
    y += 70
    draw.line((margin_x, y, width - margin_x, y), fill='black', width=3)
    y += 40
    for label, text in answers_text:
        indent = 0 if label else 90
        prefix = f"Ans {label}. " if label else ""
        lines = wrap(prefix + text, indent)
        for line in lines:
            draw.text((margin_x + indent, y), line, fill='black', font=font)
            y += 46
        y += 8

    img_path = os.path.join(d, "answer-sheet.jpg")
    img.save(img_path, quality=90)

    ground_truth = {
        "questions": [{"questionNumber": str(n), "questionText": t, "totalMarks": m} for n, t, m in questions],
        "answers": [
            {"detectedQuestionNumber": "1", "answerText": "Photosynthesis is the process by which green plants make their own food using sunlight, water, and carbon dioxide, releasing oxygen as a byproduct."},
            {"detectedQuestionNumber": "2", "answerText": "The raw materials are water, carbon dioxide, and sunlight (plus chlorophyll)."},
            {"detectedQuestionNumber": "3", "answerText": "Photosynthesis mainly takes place in the chloroplasts of leaf cells."},
        ],
        "expectedMappings": [{"questionNumber": str(n), "mappedToAnswerNumber": str(n), "expectedMethod": "number-exact"} for n, _, _ in questions],
        "unansweredQuestions": [],
        "orphanAnswers": [],
        "answerSheetPageCount": 1,
        "note": "answer-sheet.jpg is a raster image, not a PDF -- upload it directly to exercise the no-text-layer / image-upload path.",
    }
    write_json(os.path.join(d, "ground-truth.json"), ground_truth)
    write_json(os.path.join(d, "scenario.json"), {
        "id": "scenario-5-image-upload",
        "title": "Image Upload (no PDF text layer)",
        "purpose": "Verify the pipeline when the answer sheet is uploaded as a JPEG photo rather than a PDF -- exercises normalizeImageUpload() and forces Gemini vision-only extraction with no deterministic text-layer bounding boxes available.",
        "questionPaperFile": "question-paper.pdf",
        "answerSheetFile": "answer-sheet.jpg",
    })


# ---------------------------------------------------------------------------
# Scenario 6: orphan answers -- student answers all 4 questions correctly,
# PLUS writes two extra unlabeled/mislabeled blocks that don't match any
# question number, to test orphan-answer detection and semantic matching.
# ---------------------------------------------------------------------------
def scenario_6():
    d = os.path.join(OUT_ROOT, "scenario-6-orphans")
    os.makedirs(d, exist_ok=True)

    questions = [
        (1, "What is the boiling point of water at sea level in Celsius?", 2),
        (2, "What is the freezing point of water in Celsius?", 2),
        (3, "Name the process by which water changes from liquid to gas.", 2),
        (4, "Name the process by which water vapor changes back into liquid.", 2),
    ]
    q_boxes = make_question_paper(os.path.join(d, "question-paper.pdf"), "Class 6 Science - States of Matter", questions)

    answers = [
        {"number": "1", "text": "The boiling point of water at sea level is 100 degrees Celsius."},
        {"number": "2", "text": "The freezing point of water is 0 degrees Celsius."},
        {"number": None, "text": "Water is essential for all living things and covers most of Earth's surface."},
        {"number": "3", "text": "The process is called evaporation, where liquid water turns into water vapor."},
        {"number": "9", "text": "The process is called condensation, where water vapor turns back into liquid water."},
    ]
    a_boxes, page_count = make_answer_sheet(os.path.join(d, "answer-sheet.pdf"), "Answer Sheet - Roll No. 3", answers)

    ground_truth = {
        "questions": [{"questionNumber": str(n), "questionText": t, "totalMarks": m} for n, t, m in questions],
        "answers": [{"detectedQuestionNumber": a["number"], "answerText": a["text"]} for a in answers],
        "expectedMappings": [
            {"questionNumber": "1", "mappedToAnswerNumber": "1", "expectedMethod": "number-exact"},
            {"questionNumber": "2", "mappedToAnswerNumber": "2", "expectedMethod": "number-exact"},
            {"questionNumber": "3", "mappedToAnswerNumber": "3", "expectedMethod": "number-exact"},
            {"questionNumber": "4", "mappedToAnswerNumber": None, "expectedMethod": "unanswered"},
        ],
        "unansweredQuestions": ["4"],
        "orphanAnswers": [
            "the unlabeled 'water is essential...' block (no question number written, off-topic filler)",
            "the '9' labeled condensation answer (no question 9 exists -- likely meant for Q4, a good semantic-match candidate)",
        ],
        "questionBoundingBoxes": q_boxes,
        "answerBoundingBoxes": a_boxes,
        "answerSheetPageCount": page_count,
    }
    write_json(os.path.join(d, "ground-truth.json"), ground_truth)
    write_json(os.path.join(d, "scenario.json"), {
        "id": "scenario-6-orphans",
        "title": "Orphan Answers + Unanswered Question",
        "purpose": "Verify orphan-answer detection (an unlabeled block and a wrongly-numbered 'Ans 9' block with no matching question) alongside one genuinely unanswered question (Q4), and whether semantic matching correctly proposes Ans 9 as a candidate for Q4.",
        "questionPaperFile": "question-paper.pdf",
        "answerSheetFile": "answer-sheet.pdf",
    })


if __name__ == "__main__":
    scenario_5()
    scenario_6()
    print("Generated 2 extra test-data scenarios: scenario-5-image-upload, scenario-6-orphans.")
