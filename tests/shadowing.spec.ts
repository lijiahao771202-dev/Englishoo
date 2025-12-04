import { test, expect } from '@playwright/test';

test('Shadowing Session Flow', async ({ page }) => {
  // 1. Navigate to home
  await page.goto('/');

  // 2. Find and click the "Shadowing" card
  // Text: "影子跟读法 (AI Shadowing)"
  const shadowingCard = page.locator('text=影子跟读法 (AI Shadowing)');
  await expect(shadowingCard).toBeVisible();
  await shadowingCard.click();

  // 3. Verify we are in the Shadowing Session
  // Check for the header title "Shadowing Practice"
  const headerTitle = page.locator('text=Shadowing Practice');
  await expect(headerTitle).toBeVisible();

  // 4. Check that sentences are loaded
  // The sentences are inside a scrollable container.
  // We can look for the first sentence of the mock story: "In a world full of noise, silence is a rare luxury."
  const firstSentence = page.locator('text=In a world full of noise, silence is a rare luxury.');
  await expect(firstSentence).toBeVisible();

  // 5. Verify the first sentence is active by default
  // The active sentence has a parent with "scale: 1.02" (framer motion style) or the indicator line is cyan.
  // Let's look for the indicator line which has class "bg-cyan-400" when active.
  // We need to find the container of the first sentence and check its indicator.
  const firstSentenceContainer = page.locator('div.cursor-pointer').filter({ hasText: 'In a world full of noise' });
  const firstIndicator = firstSentenceContainer.locator('div.bg-cyan-400');
  await expect(firstIndicator).toBeVisible();

  // 6. Click the second sentence
  const secondSentenceText = "It allows us to hear our own thoughts and find peace within ourselves.";
  const secondSentence = page.locator(`text=${secondSentenceText}`);
  await secondSentence.click();

  // 7. Verify the second sentence becomes active
  // The second indicator should now be cyan
  const secondSentenceContainer = page.locator('div.cursor-pointer').filter({ hasText: secondSentenceText });
  const secondIndicator = secondSentenceContainer.locator('div.bg-cyan-400');
  await expect(secondIndicator).toBeVisible();

  // 8. Verify the first sentence is NO LONGER active (indicator should be bg-white/5 or similar, definitely not bg-cyan-400)
  // Note: Framer motion might animate, so we might need to wait a bit or rely on class changes.
  // The non-active class is "bg-white/5".
  // But standard expect(locator).not.toBeVisible() for the cyan indicator inside the first container should work.
  await expect(firstSentenceContainer.locator('div.bg-cyan-400')).not.toBeVisible();
});
