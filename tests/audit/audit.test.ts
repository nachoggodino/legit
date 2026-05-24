import { beforeEach, describe, expect, it, vi } from "vitest";

const run = vi.fn();
const values = vi.fn(() => ({ run }));
const insert = vi.fn(() => ({ values }));

vi.mock("@/server/db", () => ({
  auditEvents: { tableName: "audit_events" },
  getRuntimeDatabase: () => ({
    db: { insert },
  }),
}));

describe("audit events", () => {
  beforeEach(() => {
    run.mockClear();
    values.mockClear();
    insert.mockClear();
  });

  it("records audit metadata through the runtime database", async () => {
    const { recordAuditEvent } = await import("@/server/audit");
    const createdAt = new Date("2026-01-01T00:00:00.000Z");

    await recordAuditEvent({
      actorId: "admin",
      repoId: "repo",
      operation: "document.update",
      documentPath: "index.md",
      metadata: { commit: "abc123" },
      createdAt,
    });

    expect(insert).toHaveBeenCalledWith({ tableName: "audit_events" });
    expect(values).toHaveBeenCalledWith({
      id: expect.any(String),
      actorId: "admin",
      repoId: "repo",
      operation: "document.update",
      documentPath: "index.md",
      metadata: { commit: "abc123" },
      createdAt,
    });
    expect(run).toHaveBeenCalled();
  });

  it("stores optional audit fields as nulls", async () => {
    const { recordAuditEvent } = await import("@/server/audit");
    const createdAt = new Date("2026-01-01T00:00:00.000Z");

    await recordAuditEvent({
      actorId: null,
      repoId: null,
      operation: "repo.sync",
      createdAt,
    });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      documentPath: null,
      metadata: null,
    }));
  });
});
