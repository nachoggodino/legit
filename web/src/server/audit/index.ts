export type AuditEvent = {
  actorId: string | null;
  repoId: string | null;
  operation: string;
  createdAt: Date;
};
