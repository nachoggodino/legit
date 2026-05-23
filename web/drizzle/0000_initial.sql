CREATE TABLE `repositories` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `name` text NOT NULL,
  `provider` text NOT NULL,
  `repo_url` text NOT NULL,
  `default_branch` text NOT NULL,
  `docs_path` text NOT NULL,
  `visibility` text NOT NULL,
  `commit_mode` text NOT NULL,
  `commit_target_branch` text NOT NULL,
  `commit_branch_prefix` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CHECK (`provider` IN ('github', 'gitlab')),
  CHECK (`visibility` IN ('private', 'public')),
  CHECK (`commit_mode` IN ('direct', 'branch', 'merge-request'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_slug_idx` ON `repositories` (`slug`);
--> statement-breakpoint
CREATE TABLE `repo_sync_state` (
  `repo_id` text PRIMARY KEY NOT NULL,
  `status` text DEFAULT 'idle' NOT NULL,
  `last_synced_commit` text,
  `last_sync_started_at` integer,
  `last_sync_finished_at` integer,
  `last_error` text,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`status` IN ('idle', 'syncing', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE `document_metadata` (
  `repo_id` text NOT NULL,
  `path` text NOT NULL,
  `title` text,
  `headings` text NOT NULL,
  `frontmatter` text NOT NULL,
  `summary` text,
  `content_hash` text NOT NULL,
  `last_indexed_commit` text,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`repo_id`, `path`),
  FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_id` text,
  `repo_id` text,
  `operation` text NOT NULL,
  `document_path` text,
  `metadata` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text,
  `email` text,
  `email_verified` integer,
  `image` text,
  `role` text DEFAULT 'viewer' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CHECK (`role` IN ('admin', 'editor', 'viewer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);
--> statement-breakpoint
CREATE TABLE `accounts` (
  `user_id` text NOT NULL,
  `type` text NOT NULL,
  `provider` text NOT NULL,
  `provider_account_id` text NOT NULL,
  `refresh_token` text,
  `access_token` text,
  `expires_at` integer,
  `token_type` text,
  `scope` text,
  `id_token` text,
  `session_state` text,
  PRIMARY KEY (`provider`, `provider_account_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
  `session_token` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `expires` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `verification_tokens` (
  `identifier` text NOT NULL,
  `token` text NOT NULL,
  `expires` integer NOT NULL,
  PRIMARY KEY (`identifier`, `token`)
);
--> statement-breakpoint
CREATE TABLE `authenticators` (
  `credential_id` text NOT NULL,
  `user_id` text NOT NULL,
  `provider_account_id` text NOT NULL,
  `credential_public_key` text NOT NULL,
  `counter` integer NOT NULL,
  `credential_device_type` text NOT NULL,
  `credential_backed_up` integer NOT NULL,
  `transports` text,
  PRIMARY KEY (`user_id`, `credential_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authenticators_credential_id_idx` ON `authenticators` (`credential_id`);
--> statement-breakpoint
CREATE TABLE `roles` (
  `name` text PRIMARY KEY NOT NULL,
  `description` text NOT NULL,
  CHECK (`name` IN ('admin', 'editor', 'viewer'))
);
