export type AuditEvent = {
  actorId: string | null;
  repoId: string | null;
  operation: string;
  createdAt: Date;
};

export async function recordAuditEvent(event: AuditEvent & { documentPath?: string; metadata?: Record<string, unknown> }): Promise<void> {
  const { getRuntimeDatabase, auditEvents } = await import("@/server/db");
  const { db } = getRuntimeDatabase();

  db.insert(auditEvents)
    .values({
      id: crypto.randomUUID(),
      actorId: event.actorId,
      repoId: event.repoId,
      operation: event.operation,
      documentPath: event.documentPath ?? null,
      metadata: event.metadata ?? null,
      createdAt: event.createdAt,
    })
    .run();
}
