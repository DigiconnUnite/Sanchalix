import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { DEMO_TOTP_SECRET } from '../../scripts/demoSecret';
import { totpCode } from '../../src/lib/totp';

const PASSWORD = process.env.SEED_PASSWORD ?? 'Vidyawan#Demo2026';
const ADMISSION_NO = /^[A-Z]{3}-2026-\d{5}$/;

let browserErrors: string[];

test.beforeEach(({ page }) => {
  browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
});

// Cloudscape's AppLayout assumes desktop when server-rendering, so a phone's first load fails hydration of the
// shell and React re-renders it on the client. The page works; the cost is a slower first paint on phones.
const KNOWN_MOBILE_HYDRATION = /Hydration failed|React error #418/;

test.afterEach(({ isMobile }) => {
  expect(browserErrors.filter((message) => !(isMobile && KNOWN_MOBILE_HYDRATION.test(message)))).toEqual([]);
});

// Two-step verification is switched off by default (ADR-019); its journeys run when the app has it on.
const TWO_FACTOR = process.env.TWO_FACTOR_ENABLED === 'true';
const HAS_TOTP = /^(admin|principal|accountant)@/;

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Password').press('Enter');
  if (password !== PASSWORD || email.startsWith('new')) return;
  if (TWO_FACTOR && HAS_TOTP.test(email)) await enterCode(page, totpCode(DEMO_TOTP_SECRET));
  await page.waitForURL((url) => !url.pathname.includes('/signin'));
}

async function enterCode(page: Page, code: string) {
  await page.getByLabel('Verification code').fill(code);
  await page.getByLabel('Verification code').press('Enter');
}

async function expectAccessible(page: Page) {
  // Cloudscape puts aria-orientation on its own mobile toolbar <nav>, which axe rejects and we can't change.
  const { violations } = await new AxeBuilder({ page }).exclude('[class*="awsui_mobile-toolbar-nav"]').analyze();
  const blocking = violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
  expect(blocking.map(({ id, nodes }) => `${id}: ${nodes[0]?.html}`)).toEqual([]);
}

test('a school admin signs in, opens the student list, pages and filters it', async ({ page }) => {
  await page.goto('/students');
  await expect(page).toHaveURL(/\/signin\?next=%2Fstudents$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in to Vidyawan' })).toBeVisible();
  await expectAccessible(page);

  await signIn(page, 'admin@greenvalley.example');
  await expect(page).toHaveURL(/\/students$/);
  await expect(page.getByRole('heading', { level: 1, name: /Students/ })).toContainText(/\(29\d\)/);
  await expect(page.getByText(ADMISSION_NO)).toHaveCount(25);
  await expect(page.getByText(/^RPS-/)).toHaveCount(0);
  await expectAccessible(page);

  const scrollsSideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(scrollsSideways).toBe(false);

  const firstOnPageOne = await page.getByText(ADMISSION_NO).first().textContent();
  await page.getByRole('button', { name: 'Next page' }).first().click();
  await expect(page).toHaveURL(/cursor=/);
  await expect(page.getByText(ADMISSION_NO).first()).not.toHaveText(firstOnPageOne ?? '');
  await page.getByRole('button', { name: 'Previous page' }).first().click();
  await expect(page.getByText(ADMISSION_NO).first()).toHaveText(firstOnPageOne ?? '');

  await page.getByRole('button', { name: /Status/ }).click();
  await page.getByRole('option', { name: 'Transferred' }).click();
  await expect(page).toHaveURL(/status=transferred/);
  await expect(page.getByText(ADMISSION_NO)).toHaveCount(10);
  await expect(page.getByText('Transferred', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: /Status/ }).click();
  await page.getByRole('option', { name: 'Alumni' }).click();
  await expect(page.getByText('No matches')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByText(ADMISSION_NO)).toHaveCount(25);
});

test('a school admin adds a student and lands on the new profile', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Admission numbers are sequential, so one project asserts the exact number');
  await page.goto('/signin');
  await signIn(page, 'admin@greenvalley.example');
  await page.goto('/students');
  await page.getByRole('link', { name: 'Add student' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add student' })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Add student' }).click();
  await expect(page.getByText("Enter the student's first name")).toBeVisible();
  await expect(page.getByText('Enter a 10-digit mobile number')).toBeVisible();
  await expect(page.getByLabel('First name')).toBeFocused();

  await page.getByLabel('First name').fill('Tara');
  await page.getByLabel('Last name').fill('Kulkarni');
  await page.getByLabel('Date of birth').fill('2014/08/20');
  await page.getByRole('button', { name: 'Gender' }).click();
  await page.getByRole('option', { name: 'Female' }).click();
  await page.getByRole('button', { name: 'Class and section' }).click();
  await page.getByRole('option', { name: '7-B' }).click();
  await page.getByLabel('Guardian name').fill('Asha Kulkarni');
  await page.getByRole('button', { name: 'Relation' }).click();
  await page.getByRole('option', { name: 'Mother' }).click();
  await page.getByLabel('Mobile number').fill('9811122233');
  await page.getByLabel('House, street and area').fill('4 Lake View');
  await page.getByLabel('City').fill('Bhopal');
  await page.getByLabel('State').fill('Madhya Pradesh');
  await page.getByLabel('Pincode').fill('462001');
  await page.getByRole('button', { name: 'Add student' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Tara Kulkarni' })).toBeVisible();
  await expect(page.getByText('Tara Kulkarni added. Admission number VWN-2026-00301.')).toBeVisible();
  await expect(page.getByText('7-B · Roll no. 31')).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('tab', { name: 'Parents' }).click();
  await expect(page).toHaveURL(/tab=guardians/);
  await expect(page.getByText('Asha Kulkarni')).toBeVisible();
  await expect(page.getByRole('link', { name: '+91 98111 22233' })).toBeVisible();
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText('Added the student')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Meena Joshi' })).toBeVisible();
});

test('a teacher can open a profile in their section but not add students or read others', async ({ page }) => {
  await page.goto('/signin');
  await signIn(page, 'teacher@greenvalley.example');
  await page.goto('/students');
  await expect(page.getByText(ADMISSION_NO).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add student' })).toHaveCount(0);
  await page.getByRole('link', { name: /^[A-Z][a-z]+ [A-Z][a-z]+$/ }).first().click();
  await expect(page).toHaveURL(/\/students\/[0-9a-f]{24}$/);
  await expect(page.getByText(/6-A · Roll no\./)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'History' })).toHaveCount(0);

  const denied = await page.goto('/students/new');
  expect(denied?.status()).toBe(403);
  const missing = await page.goto('/students/0123456789abcdef01234567');
  expect(missing?.status()).toBe(404);
  await expect(page.getByText("We couldn't find that student.")).toBeVisible();
  browserErrors = browserErrors.filter((message) => !/40[34]/.test(message));
});

test('a school admin adds a class and a section; a principal can only view them', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Class order is unique per school, so one project creates the class');
  await page.goto('/signin');
  await signIn(page, 'admin@greenvalley.example');
  await page.getByRole('link', { name: 'Academics' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Classes and sections/ })).toContainText('(10)');
  await expect(page.getByRole('row', { name: /6-A/ })).toContainText('29 of 40');
  await expectAccessible(page);

  await page.getByRole('link', { name: 'Add class' }).click();
  await page.getByRole('button', { name: 'Add class' }).click();
  await expect(page.getByText('Enter a class name of up to 40 characters')).toBeVisible();
  await page.getByLabel('Class name').fill('Class 10 again');
  await page.getByLabel('Order').fill('10');
  await page.getByRole('button', { name: 'Add class' }).click();
  await expect(page.getByText('Another class already uses order 10.').first()).toBeVisible();
  await page.getByLabel('Class name').fill('Class 11');
  await page.getByLabel('Order').fill('11');
  await page.getByRole('button', { name: 'Add class' }).click();
  await expect(page.getByText('Class 11 added.')).toBeVisible();

  await page.getByRole('link', { name: 'Add section' }).click();
  const sideNav = page.getByRole('navigation', { name: 'Side navigation' });
  await expect(sideNav.getByRole('link', { name: 'Academics' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: /^Class/ }).click();
  await page.getByRole('option', { name: 'Class 11' }).click();
  await page.getByLabel('Section').fill('a');
  await page.getByLabel(/^Room/).fill('301');
  await page.getByRole('button', { name: 'Add section' }).click();
  await expect(page.getByText('11-A added.')).toBeVisible();
  await expect(page.getByRole('row', { name: /11-A/ })).toContainText('0 of 40');
  await expectAccessible(page);

  await page.getByRole('button', { name: /Meena Joshi/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/signin$/);
  await signIn(page, 'principal@greenvalley.example');
  await page.goto('/academics/classes');
  await expect(page.getByRole('row', { name: /11-A/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add section' })).toHaveCount(0);
  const denied = await page.goto('/academics/classes/new');
  expect(denied?.status()).toBe(403);
  browserErrors = browserErrors.filter((message) => !message.includes('403'));
});

test('the header stays in view while the page scrolls', async ({ page }) => {
  await page.goto('/signin');
  await signIn(page, 'admin@greenvalley.example');
  await page.goto('/students?pageSize=100');
  await expect(page.getByText(ADMISSION_NO).first()).toBeVisible();
  await page.mouse.wheel(0, 4000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByRole('link', { name: 'Green Valley School' })).toBeInViewport();
});

test('a wrong password shows the error, keeps the email and creates no session', async ({ page }) => {
  await page.goto('/signin');
  await signIn(page, 'admin@greenvalley.example', 'not-the-password');
  await expect(page.getByText("That email or password isn't right.").first()).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue('admin@greenvalley.example');
  await expect(page.getByLabel('Password')).toBeFocused();
  await page.goto('/');
  await expect(page).toHaveURL(/\/signin$/);
});

test('a privileged role can’t get in with a wrong verification code', async ({ page }) => {
  test.skip(!TWO_FACTOR, 'Two-step verification is switched off');
  await page.goto('/signin');
  await signIn(page, 'accountant@greenvalley.example', PASSWORD + ' ');
  await expect(page.getByText("That email or password isn't right.").first()).toBeVisible();

  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Enter your verification code' })).toBeVisible();
  await expectAccessible(page);
  await enterCode(page, '000000');
  await expect(page.getByText("That code isn't right.").first()).toBeVisible();
  await page.goto('/students');
  await expect(page).toHaveURL(/\/signin\/2fa$/);

  await page.getByRole('button', { name: 'Cancel sign-in' }).click();
  await expect(page).toHaveURL(/\/signin(\?|$)/);
});

test('first sign-in sets up two-step verification, and a recovery code works once', async ({ page, isMobile }) => {
  test.skip(!TWO_FACTOR, 'Two-step verification is switched off');
  test.skip(isMobile, 'The account can only be enrolled once per seed, so one project runs this');
  await page.goto('/signin');
  await signIn(page, 'newaccountant@greenvalley.example');
  await expect(page.getByRole('heading', { level: 1, name: 'Set up two-step verification' })).toBeVisible();
  await expectAccessible(page);
  const secret = (await page.getByText(/^[A-Z2-7]{32}$/).textContent()) ?? '';

  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Verification code').fill('000000');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText("That code isn't right.").first()).toBeVisible();

  await page.getByLabel('Verification code').fill(totpCode(secret));
  await page.getByRole('button', { name: 'Next' }).click();
  const codes = page.getByText(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
  await expect(codes).toHaveCount(10);
  const recoveryCode = (await codes.first().textContent()) ?? '';
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Finish and continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  for (const works of [true, false]) {
    await page.getByRole('button', { name: /Kavita Rao/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/signin$/);
    await signIn(page, 'newaccountant@greenvalley.example');
    await enterCode(page, recoveryCode);
    if (works) await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    else {
      await expect(page.getByText("That code isn't right.").first()).toBeVisible();
      return;
    }
  }
});

test('the dashboard count opens the student list, and sign out ends the session', async ({ page }) => {
  await page.goto('/signin');
  await signIn(page, 'principal@greenvalley.example');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('link', { name: /^29\d students$/ }).click();
  await expect(page).toHaveURL(/\/students$/);

  await page.getByRole('button', { name: /Dr\. Suresh Rao/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/signin$/);
  await page.goto('/students');
  await expect(page).toHaveURL(/\/signin/);
});

test('the header toggle switches to dark mode and the choice survives a reload', async ({ page }) => {
  const toggleTheme = (name: string) => page.getByRole('button', { name }).click();
  await page.goto('/signin');
  await signIn(page, 'principal@greenvalley.example');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  if (await page.locator('body.awsui-dark-mode').count()) await toggleTheme('Switch to light mode');
  await expect(page.locator('body')).not.toHaveClass(/awsui-dark-mode/);

  await toggleTheme('Switch to dark mode');
  await expect(page.locator('body')).toHaveClass(/awsui-dark-mode/);
  await expectAccessible(page);

  await page.reload();
  await expect(page.locator('body')).toHaveClass(/awsui-dark-mode/);
  await toggleTheme('Switch to light mode');
  await expect(page.locator('body')).not.toHaveClass(/awsui-dark-mode/);
});

test('a teacher sees only the section they are class teacher of', async ({ page }) => {
  await page.goto('/signin');
  await signIn(page, 'teacher@greenvalley.example');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.goto('/students?pageSize=100');
  await expect(page.getByText(ADMISSION_NO)).toHaveCount(29);
  await expect(page.getByText('6-A', { exact: true })).toHaveCount(29);
});

test('an accountant gets the 403 page for the student list', async ({ page }) => {
  await page.goto('/signin');
  await signIn(page, 'accountant@greenvalley.example');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  const response = await page.goto('/students');
  expect(response?.status()).toBe(403);
  await expect(page.getByText("You don't have access to this page.")).toBeVisible();
  await expect(page.getByText(ADMISSION_NO)).toHaveCount(0);
  await page.getByRole('link', { name: 'Go to dashboard' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  browserErrors = browserErrors.filter((message) => !message.includes('403'));
});
