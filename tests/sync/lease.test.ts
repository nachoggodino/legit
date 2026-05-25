import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireFileLease, withFileLease } from "@/server/sync/lease";

describe("file leases", () => {
  let locksRoot: string;
  let originalLocksRoot: string | undefined;

  beforeEach(() => {
    originalLocksRoot = process.env.LEGIT_LOCKS_ROOT;
    locksRoot = fs.mkdtempSync(path.join(os.tmpdir(), "legit-locks-"));
    process.env.LEGIT_LOCKS_ROOT = locksRoot;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalLocksRoot === undefined) {
      delete process.env.LEGIT_LOCKS_ROOT;
    } else {
      process.env.LEGIT_LOCKS_ROOT = originalLocksRoot;
    }
    fs.rmSync(locksRoot, { recursive: true, force: true });
  });

  it("holds a lock while work is running and releases it afterward", async () => {
    const lockPath = path.join(locksRoot, "repo-research.lock");

    await expect(
      withFileLease("repo-research", async () => {
        expect(fs.existsSync(lockPath)).toBe(true);
        expect(acquireFileLease("repo-research", 60_000).acquired).toBe(false);
        return "synced";
      }, 60_000),
    ).resolves.toBe("synced");

    expect(fs.existsSync(lockPath)).toBe(false);
    const lease = acquireFileLease("repo-research", 60_000);
    expect(lease.acquired).toBe(true);
    lease.release();
  });

  it("replaces stale locks before acquiring", () => {
    const lockPath = path.join(locksRoot, "scheduler.lock");
    fs.mkdirSync(locksRoot, { recursive: true });
    fs.writeFileSync(lockPath, "");
    const staleDate = new Date(Date.now() - 120_000);
    fs.utimesSync(lockPath, staleDate, staleDate);

    const lease = acquireFileLease("scheduler", 1_000);

    expect(lease.acquired).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(true);
    lease.release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("releases the lock when work rejects", async () => {
    const lockPath = path.join(locksRoot, "repo-failing.lock");

    await expect(
      withFileLease("repo-failing", async () => {
        throw new Error("boom");
      }, 60_000),
    ).rejects.toThrow("boom");

    expect(fs.existsSync(lockPath)).toBe(false);
  });
});
