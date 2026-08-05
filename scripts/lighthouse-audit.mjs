import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";

const thresholds = {
  accessibility: 0.9,
  "best-practices": 0.9,
};

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Could not allocate a local audit port."));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function waitForUrl(url, processHandle, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Process exited before ${url} became available.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function stopProcess(processHandle) {
  if (processHandle.exitCode !== null || processHandle.pid === undefined) return;
  const exited = once(processHandle, "exit");
  if (process.platform === "win32") {
    processHandle.kill("SIGTERM");
  } else {
    try {
      process.kill(-processHandle.pid, "SIGTERM");
    } catch {
      processHandle.kill("SIGTERM");
    }
  }
  await Promise.race([exited, delay(5_000)]);
}

const webPort = await availablePort();
const chromePort = await availablePort();
const chromeProfile = await mkdtemp(path.join(os.tmpdir(), "atlas-lighthouse-"));
const reportDirectory = path.resolve(".lighthouseci");
const webOrigin = `http://127.0.0.1:${webPort}`;
const standaloneDirectory = path.resolve(".next/standalone");

await cp(path.resolve("public"), path.join(standaloneDirectory, "public"), {
  recursive: true,
  force: true,
});
await cp(
  path.resolve(".next/static"),
  path.join(standaloneDirectory, ".next/static"),
  { recursive: true, force: true },
);

const web = spawn(
  process.execPath,
  ["server.js"],
  {
    cwd: standaloneDirectory,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      BACKEND_URL: process.env.BACKEND_URL ?? "http://127.0.0.1:4000",
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ??
        "lighthouse-only-secret-with-at-least-32-characters",
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? webOrigin,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://atlas:atlas@127.0.0.1:5432/atlas",
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? "lighthouse-client",
      GITHUB_CLIENT_SECRET:
        process.env.GITHUB_CLIENT_SECRET ?? "lighthouse-client-secret",
      HOSTNAME: "127.0.0.1",
      PORT: String(webPort),
    },
    stdio: "inherit",
  },
);

const chrome = spawn(
  chromium.executablePath(),
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${chromeProfile}`,
    "about:blank",
  ],
  {
    detached: process.platform !== "win32",
    stdio: "ignore",
  },
);

try {
  await Promise.all([
    waitForUrl(webOrigin, web),
    waitForUrl(`http://127.0.0.1:${chromePort}/json/version`, chrome),
  ]);
  await mkdir(reportDirectory, { recursive: true });

  const pages = [
    { name: "landing", url: `${webOrigin}/` },
    { name: "sign-in", url: `${webOrigin}/sign-in` },
  ];
  const failures = [];

  for (const page of pages) {
    const result = await lighthouse(page.url, {
      port: chromePort,
      output: "json",
      logLevel: "error",
      onlyCategories: Object.keys(thresholds),
    });
    if (!result) throw new Error(`Lighthouse returned no result for ${page.url}.`);

    await writeFile(
      path.join(reportDirectory, `${page.name}.report.json`),
      result.report,
    );

    for (const [categoryName, minimum] of Object.entries(thresholds)) {
      const score = result.lhr.categories[categoryName]?.score;
      const formattedScore =
        typeof score === "number" ? score.toFixed(2) : "unavailable";
      console.log(`${page.name} ${categoryName}: ${formattedScore}`);
      if (typeof score !== "number" || score < minimum) {
        failures.push(
          `${page.name} ${categoryName} scored ${formattedScore}; expected at least ${minimum.toFixed(2)}`,
        );
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Lighthouse thresholds failed:\n- ${failures.join("\n- ")}`);
  }
} finally {
  await Promise.all([stopProcess(chrome), stopProcess(web)]);
  await rm(chromeProfile, { recursive: true, force: true });
}
