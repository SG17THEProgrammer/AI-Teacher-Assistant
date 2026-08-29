import { test, expect } from '@playwright/test';
import path from 'path';

const SCENARIO_1 = path.join(__dirname, '..', '..', 'test-data', 'scenario-1-basic');

test.describe('Upload to results flow', () => {
  test('teacher can upload both files and see them staged before mapping', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Upload both files to get started')).toBeVisible();

    const startMappingButton = page.getByRole('button', { name: /start mapping/i });
    await expect(startMappingButton).toBeDisabled();

    const [questionInput, answerInput] = await page.locator('input[type="file"]').all();
    await questionInput.setInputFiles(path.join(SCENARIO_1, 'question-paper.pdf'));
    await answerInput.setInputFiles(path.join(SCENARIO_1, 'answer-sheet.pdf'));

    await expect(page.getByText('question-paper.pdf')).toBeVisible();
    await expect(page.getByText('answer-sheet.pdf')).toBeVisible();
    await expect(startMappingButton).toBeEnabled();
  });

  test('rejects an unsupported file type with a clear error, not a silent failure', async ({ page }) => {
    await page.goto('/');

    // A .txt file dropped into a dropzone that only accepts pdf/png/jpg/jpeg.
    const [questionInput] = await page.locator('input[type="file"]').all();
    const buffer = Buffer.from('not a real document');
    await questionInput.setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer,
    });

    await expect(page.getByText(/PDF, PNG, JPG, or JPEG/i)).toBeVisible();
  });

  test(
    'full pipeline: upload scenario 1, process, and verify all 5 questions map with no unanswered/orphans',
    async ({ page }) => {
      // This test requires a configured GEMINI_API_KEY in the environment
      // running `npm run dev` (or FORCE_OCR_FALLBACK left unset) to exercise
      // the real extraction/mapping/grading path end-to-end. It is skipped
      // automatically if that key isn't present, so `npm run test:e2e`
      // still passes out of the box without API costs, while still running
      // the upload-validation tests above.
      test.skip(!process.env.GEMINI_API_KEY, 'Requires GEMINI_API_KEY for full pipeline run');

      await page.goto('/');
      const [questionInput, answerInput] = await page.locator('input[type="file"]').all();
      await questionInput.setInputFiles(path.join(SCENARIO_1, 'question-paper.pdf'));
      await answerInput.setInputFiles(path.join(SCENARIO_1, 'answer-sheet.pdf'));

      await page.getByRole('button', { name: /start mapping/i }).click();

      // Extracting screen appears...
      await expect(page.getByText(/extracting/i)).toBeVisible({ timeout: 10_000 });

      // ...and results eventually render (generous timeout: full pipeline
      // includes several sequential/parallel Gemini calls).
      await expect(page.getByText(/extracted/i)).toBeVisible({ timeout: 60_000 });

      // All 5 questions should be present, numbered 1-5.
      for (let i = 1; i <= 5; i++) {
        await expect(page.getByText(new RegExp(`^${i}$`)).first()).toBeVisible();
      }

      // No "Not Answered" badges and no "Unmapped Answers" panel for this scenario.
      await expect(page.getByText('Not Answered')).toHaveCount(0);
      await expect(page.getByText(/unmapped answers/i)).toHaveCount(0);

      // Clicking question 3 should reveal a highlighted region in the viewer.
      await page.getByText('Acceleration is the rate of change', { exact: false }).first().click().catch(() => {});
      const highlight = page.locator('.highlight-region').first();
      await expect(highlight).toBeVisible({ timeout: 10_000 });
    }
  );
});
