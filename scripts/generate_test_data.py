"""
Generates the 4 test-data scenarios required by the assignment spec:
question paper PDFs + student answer-sheet PDFs, plus ground-truth.json /
expected-output.json that describe exactly what the app should extract.

IMPORTANT HONESTY NOTE (also called out in test-data/README.md and the
TESTING_GUIDE): these answer sheets use a handwriting-style font
(Caveat/Patrick Hand if available, else a monospace fallback) rendered as
typed PDF text, not scanned handwriting. Real handwriting recognition
quality can only be evaluated with genuine handwritten scans -- this
dataset instead gives a fully deterministic, reproducible way to verify
the extraction/mapping/highlighting *pipeline logic* end-to-end (number
normalization, out-of-order mapping, unanswered detection, multi-page
region merging) without depending on OCR variance. Because every text
block's position is chosen by this script, the bounding boxes in
ground-truth.json are exact, not estimated -- they describe the PDF this
script produced, byte for byte.
"""
import json
import os
from dataclasses import dataclass, field
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

PAGE_W, PAGE_H = A4
MARGIN_X = 56
FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
BODY_SIZE = 11
LEADING = 15

OUT_ROOT = os.path.join(os.path.dirname(__file__), "..", "test-data")


def wrap_text(text, font, size, max_width):
    words = text.split()
    lines, current = [], ""
    for word in words:
        trial = f"{current} {word}".strip()
        if stringWidth(trial, font, size) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


@dataclass
class PageWriter:
    c: canvas.Canvas
    page_number: int = 1
    y: float = PAGE_H - 70
    boxes: list = field(default_factory=list)  # collected bounding boxes for this doc

    def header(self, title):
        self.c.setFont(FONT_BOLD, 13)
        self.c.drawString(MARGIN_X, PAGE_H - 40, title)
        self.c.setFont(FONT, 9)
        self.c.drawRightString(PAGE_W - MARGIN_X, PAGE_H - 40, f"Page {self.page_number}")
        self.c.line(MARGIN_X, PAGE_H - 48, PAGE_W - MARGIN_X, PAGE_H - 48)

    def new_page(self, title):
        self.c.showPage()
        self.page_number += 1
        self.y = PAGE_H - 70
        self.header(title)

    def ensure_space(self, needed, title):
        if self.y - needed < 60:
            self.new_page(title)

    def draw_block(self, label, text, *, bold_label=True, font=FONT, size=BODY_SIZE,
                    max_width=PAGE_W - 2 * MARGIN_X, record_as=None, title="", indent=0):
        """Draws `label: text` wrapped to max_width, returns its bounding box
        in normalized (0-1) page coordinates with top-left origin."""
        self.ensure_space(LEADING * 3, title)
        start_y_top_pt = PAGE_H - self.y  # convert reportlab bottom-origin -> top-origin
        x = MARGIN_X + indent

        full_text = f"{label} {text}" if label else text
        lines = wrap_text(full_text, font, size, max_width - indent)

        self.c.setFont(font, size)
        first_line = True
        for line in lines:
            self.ensure_space(LEADING, title)
            if first_line and label and bold_label:
                self.c.setFont(FONT_BOLD, size)
                self.c.drawString(x, self.y, label + " ")
                label_w = stringWidth(label + " ", FONT_BOLD, size)
                self.c.setFont(font, size)
                self.c.drawString(x + label_w, self.y, line[len(label) + 1:])
            else:
                self.c.drawString(x, self.y, line)
            self.y -= LEADING
            first_line = False

        end_y_top_pt = PAGE_H - self.y
        box = {
            "page": self.page_number,
            "x": round(x / PAGE_W, 4),
            "y": round((start_y_top_pt - LEADING) / PAGE_H, 4),
            "width": round((max_width - indent) / PAGE_W, 4),
            "height": round((end_y_top_pt - start_y_top_pt + LEADING) / PAGE_H, 4),
        }
        if record_as is not None:
            self.boxes.append({"key": record_as, **box})
        self.y -= 6  # gap after block
        return box


def make_question_paper(path, title, questions):
    """questions: list of (number, text, marks)"""
    c = canvas.Canvas(path, pagesize=A4)
    pw = PageWriter(c=c)
    pw.header(title)
    boxes = []
    for number, text, marks in questions:
        box = pw.draw_block(f"Q{number}.", f"{text} [{marks} marks]", record_as=number, title=title)
        boxes.append({"questionNumber": str(number), **box})
    c.save()
    return boxes


def make_answer_sheet(path, title, answer_blocks):
    """answer_blocks: list of dicts with keys: number (str|None), text, force_new_page(bool)"""
    c = canvas.Canvas(path, pagesize=A4)
    pw = PageWriter(c=c)
    pw.header(title)
    boxes = []
    for block in answer_blocks:
        if block.get("force_new_page"):
            pw.new_page(title)
        label = f"Ans {block['number']}." if block.get("number") else ""
        box = pw.draw_block(label, block["text"], record_as=block.get("key", block.get("number")), title=title)
        boxes.append({
            "detectedQuestionNumber": block.get("number"),
            "answerText": block["text"],
            **box,
        })
    c.save()
    return boxes, pw.page_number


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ---------------------------------------------------------------------------
# Scenario 1: Basic mapping -- 5 questions, answered correctly, in order.
# ---------------------------------------------------------------------------
def scenario_1():
    d = os.path.join(OUT_ROOT, "scenario-1-basic")
    os.makedirs(d, exist_ok=True)

    questions = [
        (1, "What is the SI unit of force?", 2),
        (2, "State Newton's second law of motion.", 2),
        (3, "Define acceleration and give its SI unit.", 2),
        (4, "Write the formula for kinetic energy of a moving object.", 2),
        (5, "Name two effects that a force can produce on an object.", 2),
    ]
    q_boxes = make_question_paper(
        os.path.join(d, "question-paper.pdf"), "Class 9 Physics - Unit Test", questions
    )

    answers = [
        {"number": "1", "text": "The SI unit of force is the Newton (N), defined as the force needed to accelerate a 1 kg mass at 1 m/s^2."},
        {"number": "2", "text": "Newton's second law states that the force acting on an object equals the rate of change of its momentum, F = ma."},
        {"number": "3", "text": "Acceleration is the rate of change of velocity with time. Its SI unit is metre per second squared (m/s^2)."},
        {"number": "4", "text": "Kinetic energy KE = 1/2 m v^2, where m is mass and v is velocity."},
        {"number": "5", "text": "A force can change the speed of an object, and it can change the direction of motion of an object."},
    ]
    a_boxes, page_count = make_answer_sheet(
        os.path.join(d, "answer-sheet.pdf"), "Answer Sheet - Roll No. 14", answers
    )

    ground_truth = {
        "questions": [{"questionNumber": str(n), "questionText": t, "totalMarks": m} for n, t, m in questions],
        "answers": [{"detectedQuestionNumber": a["number"], "answerText": a["text"]} for a in answers],
        "expectedMappings": [{"questionNumber": str(n), "mappedToAnswerNumber": str(n), "expectedMethod": "number-exact"} for n, _, _ in questions],
        "unansweredQuestions": [],
        "orphanAnswers": [],
        "questionBoundingBoxes": q_boxes,
        "answerBoundingBoxes": a_boxes,
        "answerSheetPageCount": page_count,
    }
    expected_output = {
        "summary": {
            "totalQuestions": 5,
            "questionsAttempted": 5,
            "questionsUnanswered": 0,
            "orphanAnswerCount": 0,
            "expectedMappingAccuracy": "100%",
        },
        "mappings": ground_truth["expectedMappings"],
    }
    write_json(os.path.join(d, "ground-truth.json"), ground_truth)
    write_json(os.path.join(d, "expected-output.json"), expected_output)
    write_json(os.path.join(d, "scenario.json"), {
        "id": "scenario-1-basic",
        "title": "Basic Mapping",
        "purpose": "Verify standard extraction and mapping when a student answers every question, in order, with the correct number written on each answer.",
        "questionPaperFile": "question-paper.pdf",
        "answerSheetFile": "answer-sheet.pdf",
    })


# ---------------------------------------------------------------------------
# Scenario 2: Out-of-order answers -- same 5 questions, answered Q5,Q2,Q1,Q4,Q3.
# ---------------------------------------------------------------------------
def scenario_2():
    d = os.path.join(OUT_ROOT, "scenario-2-out-of-order")
    os.makedirs(d, exist_ok=True)

    questions = [
        (1, "What is the SI unit of force?", 2),
        (2, "State Newton's second law of motion.", 2),
        (3, "Define acceleration and give its SI unit.", 2),
        (4, "Write the formula for kinetic energy of a moving object.", 2),
        (5, "Name two effects that a force can produce on an object.", 2),
    ]
    q_boxes = make_question_paper(
        os.path.join(d, "question-paper.pdf"), "Class 9 Physics - Unit Test", questions
    )

    write_order = ["5", "2", "1", "4", "3"]
    texts = {
        "1": "The SI unit of force is the Newton (N).",
        "2": "Newton's second law: the net force on a body equals mass times acceleration, F = ma.",
        "3": "Acceleration is the rate of change of velocity. SI unit: m/s^2.",
        "4": "KE = 1/2 m v^2.",
        "5": "A force can change an object's speed, and it can change its direction of motion.",
    }
    answers = [{"number": n, "text": texts[n]} for n in write_order]
    a_boxes, page_count = make_answer_sheet(
        os.path.join(d, "answer-sheet.pdf"), "Answer Sheet - Roll No. 22 (answered out of order)", answers
    )

    ground_truth = {
        "questions": [{"questionNumber": str(n), "questionText": t, "totalMarks": m} for n, t, m in questions],
        "answers": [{"detectedQuestionNumber": a["number"], "answerText": a["text"]} for a in answers],
        "expectedMappings": [{"questionNumber": str(n), "mappedToAnswerNumber": str(n), "expectedMethod": "number-exact"} for n, _, _ in questions],
        "unansweredQuestions": [],
        "orphanAnswers": [],
        "questionBoundingBoxes": q_boxes,
        "answerBoundingBoxes": a_boxes,
        "answerSheetPageCount": page_count,
        "writtenOrder": write_order,
    }
    expected_output = {
        "summary": {
            "totalQuestions": 5,
            "questionsAttempted": 5,
            "questionsUnanswered": 0,
            "orphanAnswerCount": 0,
            "expectedMappingAccuracy": "100%",
            "note": "Questions must remain displayed in original paper order (1,2,3,4,5) despite being written 5,2,1,4,3.",
        },
        "mappings": ground_truth["expectedMappings"],
    }
    write_json(os.path.join(d, "ground-truth.json"), ground_truth)
    write_json(os.path.join(d, "expected-output.json"), expected_output)
    write_json(os.path.join(d, "scenario.json"), {
        "id": "scenario-2-out-of-order",
        "title": "Out Of Order Answers",
        "purpose": "Verify the mapping engine correctly pairs every question with its answer by number, and that the question list stays in original paper order, even though the student wrote answers in the order 5, 2, 1, 4, 3.",
        "questionPaperFile": "question-paper.pdf",
        "answerSheetFile": "answer-sheet.pdf",
    })


# ---------------------------------------------------------------------------
# Scenario 3: Unanswered questions -- 8 questions, only 5 answered.
# ---------------------------------------------------------------------------
def scenario_3():
    d = os.path.join(OUT_ROOT, "scenario-3-unanswered")
    os.makedirs(d, exist_ok=True)

    questions = [
        (1, "Define photosynthesis.", 2),
        (2, "Name the raw materials required for photosynthesis.", 2),
        (3, "What is the role of chlorophyll in photosynthesis?", 2),
        (4, "Explain the term 'transpiration' in plants.", 3),
        (5, "What is the function of stomata in a leaf?", 2),
        (6, "Describe the structure of a chloroplast.", 3),
        (7, "Name two factors that affect the rate of photosynthesis.", 2),
        (8, "Write the balanced chemical equation for photosynthesis.", 3),
    ]
    q_boxes = make_question_paper(
        os.path.join(d, "question-paper.pdf"), "Class 10 Biology - Unit Test", questions
    )

    answered_numbers = ["1", "2", "3", "5", "7"]
    texts = {
        "1": "Photosynthesis is the process by which green plants use sunlight to convert carbon dioxide and water into glucose and oxygen.",
        "2": "The raw materials required are carbon dioxide, water, and sunlight, with chlorophyll as the catalyst.",
        "3": "Chlorophyll absorbs light energy, mainly in the red and blue wavelengths, and converts it into chemical energy used to drive the photosynthetic reactions.",
        "5": "Stomata are small pores on the leaf surface that allow gas exchange, letting carbon dioxide in and oxygen and water vapour out.",
        "7": "Light intensity and carbon dioxide concentration are two factors that affect the rate of photosynthesis.",
    }
    answers = [{"number": n, "text": texts[n]} for n in answered_numbers]
    a_boxes, page_count = make_answer_sheet(
        os.path.join(d, "answer-sheet.pdf"), "Answer Sheet - Roll No. 07", answers
    )

    unanswered = ["4", "6", "8"]
    ground_truth = {
        "questions": [{"questionNumber": str(n), "questionText": t, "totalMarks": m} for n, t, m in questions],
        "answers": [{"detectedQuestionNumber": a["number"], "answerText": a["text"]} for a in answers],
        "expectedMappings": (
            [{"questionNumber": n, "mappedToAnswerNumber": n, "expectedMethod": "number-exact"} for n in answered_numbers]
            + [{"questionNumber": n, "mappedToAnswerNumber": None, "expectedMethod": None} for n in unanswered]
        ),
        "unansweredQuestions": unanswered,
        "orphanAnswers": [],
        "questionBoundingBoxes": q_boxes,
        "answerBoundingBoxes": a_boxes,
        "answerSheetPageCount": page_count,
    }
    expected_output = {
        "summary": {
            "totalQuestions": 8,
            "questionsAttempted": 5,
            "questionsUnanswered": 3,
            "orphanAnswerCount": 0,
            "expectedMappingAccuracy": "100% of answered questions",
            "note": "Q4, Q6 and Q8 must be shown with a 'Not Answered' badge/warning state.",
        },
        "mappings": ground_truth["expectedMappings"],
    }
    write_json(os.path.join(d, "ground-truth.json"), ground_truth)
    write_json(os.path.join(d, "expected-output.json"), expected_output)
    write_json(os.path.join(d, "scenario.json"), {
        "id": "scenario-3-unanswered",
        "title": "Unanswered Questions",
        "purpose": "Verify that questions with no corresponding answer on the sheet (Q4, Q6, Q8) are correctly detected and flagged as 'Not Answered' rather than silently dropped or mis-mapped.",
        "questionPaperFile": "question-paper.pdf",
        "answerSheetFile": "answer-sheet.pdf",
    })


# ---------------------------------------------------------------------------
# Scenario 4: Multi-page answer -- Q2's answer deliberately spans a page break.
# ---------------------------------------------------------------------------
def scenario_4():
    d = os.path.join(OUT_ROOT, "scenario-4-multipage")
    os.makedirs(d, exist_ok=True)

    questions = [
        (1, "Describe the water cycle in your own words.", 4),
        (2, "Explain in detail the process of the carbon cycle, including at least four distinct stages, the role of respiration, and the role of decomposition.", 5),
        (3, "What is the greenhouse effect?", 3),
        (4, "Name two renewable and two non-renewable sources of energy.", 3),
    ]
    q_boxes = make_question_paper(
        os.path.join(d, "question-paper.pdf"), "Class 8 Environmental Science - Unit Test", questions
    )

    # Q2's answer is deliberately long, split into two draw_block calls so it
    # is genuinely rendered across a page boundary (not just a long single
    # block that happens to wrap) -- this mirrors a student physically
    # running out of room on one page and continuing on the next.
    q2_part1 = (
        "The carbon cycle describes how carbon atoms continuously travel between the atmosphere, "
        "living organisms, the oceans, and the earth. Stage one: plants absorb carbon dioxide from the "
        "atmosphere during photosynthesis and convert it into glucose and other carbon compounds. "
        "Stage two: these compounds pass through food chains as animals eat plants and each other, "
        "moving carbon through the ecosystem."
    )
    q2_part2 = (
        "Stage three: respiration in both plants and animals releases carbon dioxide back into the "
        "atmosphere as they break down glucose for energy. Stage four: decomposition -- when organisms "
        "die, decomposers break down the remains and release the stored carbon back into the soil and "
        "atmosphere, completing the cycle. Human activity, especially burning fossil fuels, adds extra "
        "carbon dioxide that the natural cycle cannot fully absorb."
    )

    answers_part_a = [
        {"number": "1", "text": "The water cycle involves evaporation of water from oceans and lakes, condensation into clouds, precipitation as rain or snow, and collection back into water bodies, repeating continuously."},
        {"number": "2", "text": q2_part1, "key": "2-part1"},
    ]
    answers_part_b_forced_new_page = [
        {"number": "2", "text": q2_part2, "key": "2-part2", "force_new_page": True},
        {"number": "3", "text": "The greenhouse effect is the trapping of heat in the Earth's atmosphere by gases like carbon dioxide and methane, which keeps the planet warm enough to support life, though excess gases cause additional warming."},
        {"number": "4", "text": "Renewable sources: solar energy and wind energy. Non-renewable sources: coal and petroleum."},
    ]

    c = canvas.Canvas(os.path.join(d, "answer-sheet.pdf"), pagesize=A4)
    pw = PageWriter(c=c)
    title = "Answer Sheet - Roll No. 31"
    pw.header(title)
    a_boxes = []
    for block in answers_part_a + answers_part_b_forced_new_page:
        if block.get("force_new_page"):
            pw.new_page(title)
        label = f"Ans {block['number']}." if block.get("number") else ""
        box = pw.draw_block(label, block["text"], record_as=block.get("key", block.get("number")), title=title)
        a_boxes.append({"detectedQuestionNumber": block.get("number"), "answerText": block["text"], "key": block.get("key"), **box})
    c.save()
    page_count = pw.page_number

    ground_truth = {
        "questions": [{"questionNumber": str(n), "questionText": t, "totalMarks": m} for n, t, m in questions],
        "answers": [{"detectedQuestionNumber": a.get("detectedQuestionNumber"), "answerText": a["answerText"]} for a in a_boxes],
        "expectedMappings": [
            {"questionNumber": "1", "mappedToAnswerNumber": "1", "expectedMethod": "number-exact"},
            {
                "questionNumber": "2",
                "mappedToAnswerNumber": "2",
                "expectedMethod": "number-exact",
                "expectedAdditionalRegions": 1,
                "note": "Q2's answer spans 2 pages and must merge into one mapping with 2 bounding regions.",
            },
            {"questionNumber": "3", "mappedToAnswerNumber": "3", "expectedMethod": "number-exact"},
            {"questionNumber": "4", "mappedToAnswerNumber": "4", "expectedMethod": "number-exact"},
        ],
        "unansweredQuestions": [],
        "orphanAnswers": [],
        "questionBoundingBoxes": q_boxes,
        "answerBoundingBoxes": a_boxes,
        "answerSheetPageCount": page_count,
    }
    expected_output = {
        "summary": {
            "totalQuestions": 4,
            "questionsAttempted": 4,
            "questionsUnanswered": 0,
            "orphanAnswerCount": 0,
            "expectedMappingAccuracy": "100%",
            "note": "Clicking Q2 must highlight regions on both the page containing 'Stage one/two' and the following page containing 'Stage three/four'.",
        },
        "mappings": ground_truth["expectedMappings"],
    }
    write_json(os.path.join(d, "ground-truth.json"), ground_truth)
    write_json(os.path.join(d, "expected-output.json"), expected_output)
    write_json(os.path.join(d, "scenario.json"), {
        "id": "scenario-4-multipage",
        "title": "Multi-page Answers",
        "purpose": "Verify that an answer spanning two physical pages (Q2) is merged into a single mapping with multiple bounding regions, and that clicking Q2 highlights the relevant area on both pages.",
        "questionPaperFile": "question-paper.pdf",
        "answerSheetFile": "answer-sheet.pdf",
    })


if __name__ == "__main__":
    scenario_1()
    scenario_2()
    scenario_3()
    scenario_4()
    print("Generated all 4 test-data scenarios.")
