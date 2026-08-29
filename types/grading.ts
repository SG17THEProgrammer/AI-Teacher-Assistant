export interface QuestionGrade {
  questionId: string;
  marksAwarded: number;
  totalMarks: number;
  confidence: number;
  strengths: string[];
  mistakes: string[];
  feedback: string;
  /** true if the grade is a placeholder for an unanswered / orphaned item */
  isUngraded: boolean;
}

export interface OverallSummary {
  totalMarksAwarded: number;
  totalMarksPossible: number;
  percentage: number;
  questionsAttempted: number;
  questionsUnanswered: number;
  totalQuestions: number;
  strongAreas: string[];
  weakAreas: string[];
  orphanAnswerCount: number;
  averageMappingConfidence: number;
}

export type GradingResult = {
  grades: QuestionGrade[];
  summary: OverallSummary;
};
