import fs from "node:fs";
import path from "node:path";

const DEFAULT_LOCKS_ROOT = "/tmp/legit-locks";

function resolveLocksRoot(): string {
  return process.env.LEGIT_LOCKS_ROOT ?? DEFAULT_LOCKS_ROOT;
}

function ensureLocksRoot(): string {
  const root = path.resolve(resolveLocksRoot());
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function isStale(lockPath: string, staleMs: number): boolean {
  try {
    const stats = fs.statSync(lockPath);
    return Date.now() - stats.mtimeMs > staleMs;
  } catch {
    return false;
  }
}

export function withFileLease<T>(name: string, work: () => Promise<T>, staleMs: number): Promise<T> {
  const root = ensureLocksRoot();
  const lockPath = path.join(root, `${name}.lock`);

  try {
    const fd = fs.openSync(lockPath, "wx");
    fs.closeSync(fd);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST" && isStale(lockPath, staleMs)) {
      fs.rmSync(lockPath, { force: true });
      const fd = fs.openSync(lockPath, "wx");
      fs.closeSync(fd);
    } else {
      throw error;
    }
  }

  return work().finally(() => {
    fs.rmSync(lockPath, { force: true });
  });
}

export function acquireFileLease(name: string, staleMs: number): { acquired: boolean; release: () => void } {
  const root = ensureLocksRoot();
  const lockPath = path.join(root, `${name}.lock`);

  const tryAcquire = () => {
    const fd = fs.openSync(lockPath, "wx");
    fs.closeSync(fd);
  };

  try {
    tryAcquire();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") {
      throw error;
    }
    if (!isStale(lockPath, staleMs)) {
      return { acquired: false, release: () => undefined };
    }

    fs.rmSync(lockPath, { force: true });
    tryAcquire();
  }

  return {
    acquired: true,
    release: () => {
      fs.rmSync(lockPath, { force: true });
    },
  };
}
