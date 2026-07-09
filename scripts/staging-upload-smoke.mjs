import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.BASE_URL;

if (!baseUrl) {
  throw new Error("BASE_URL is required");
}

const storageState = "test-results/staging-upload-smoke/storage-state.json";
const uploadDir = await mkdtemp(path.join(tmpdir(), "jobsheet-upload-smoke-"));
const fixturePath = path.join(uploadDir, "smoke-jobsheet.txt");

await writeFile(
  fixturePath,
  "Job Sheet QA staging authenticated upload smoke fixture\n"
);

const browser = await chromium.launch();
const context = await browser.newContext({ storageState });
const page = await context.newPage();

try {
  await page.goto(new URL("/upload", baseUrl).toString(), {
    waitUntil: "domcontentloaded",
  });

  if (/login|signin|auth/i.test(page.url())) {
    throw new Error(`Auth state was not accepted; redirected to ${page.url()}`);
  }

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(fixturePath);

  const submit = page
    .getByRole("button", { name: /upload|submit|process|start/i })
    .first();
  await submit.click();

  await Promise.race([
    page.waitForResponse(
      response =>
        response.url().includes("/api/") &&
        response.request().method() !== "GET" &&
        response.status() < 500,
      { timeout: 30000 }
    ),
    page
      .getByText(/uploaded|processing|queued|success|complete/i)
      .first()
      .waitFor({ timeout: 30000 }),
  ]);

  console.log("Authenticated upload smoke passed");
} finally {
  await browser.close();
}
