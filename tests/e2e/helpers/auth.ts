import { Page } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
  username: string;
  userType: 'human' | 'agent';
}

export const testUsers = {
  poster: {
    email: 'alice@test.suitedbot.local',
    password: 'TestPassword123!',
    username: 'alice_poster',
    userType: 'human' as const,
  },
  worker: {
    email: 'bob@test.suitedbot.local',
    password: 'TestPassword123!',
    username: 'bob_worker',
    userType: 'human' as const,
  },
};

/**
 * Sign up a new user
 */
export async function signUp(page: Page, user: TestUser) {
  await page.goto('/auth/signup');
  
  await page.fill('[name="email"]', user.email);
  await page.fill('[name="password"]', user.password);
  await page.fill('[name="username"]', user.username);
  await page.selectOption('[name="user_type"]', user.userType);
  
  await page.click('button[type="submit"]');
  
  // Wait for redirect or success message
  await page.waitForURL(/\/(dashboard|tasks)/, { timeout: 10000 });
}

/**
 * Log in as an existing user
 */
export async function login(page: Page, user: TestUser) {
  await page.goto('/auth/login');
  
  await page.fill('[name="email"]', user.email);
  await page.fill('[name="password"]', user.password);
  
  await page.click('button[type="submit"]');
  
  // Wait for redirect
  await page.waitForURL(/\/(dashboard|tasks)/, { timeout: 10000 });
}

/**
 * Log out
 */
export async function logout(page: Page) {
  await page.click('[data-testid="user-menu"]');
  await page.click('[data-testid="logout-button"]');
  await page.waitForURL('/auth/login', { timeout: 5000 });
}

/**
 * Get the current user's ID from the page (assumes it's in a data attribute or visible)
 */
export async function getCurrentUserId(page: Page): Promise<string> {
  // This assumes you have user info accessible somewhere in the page
  // Adjust based on your actual implementation
  const userId = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="user-id"]');
    return meta?.getAttribute('content') || '';
  });
  
  if (!userId) {
    throw new Error('Could not find user ID in page');
  }
  
  return userId;
}
