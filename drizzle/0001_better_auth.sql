-- Better Auth 1.6.25 schema for the direct Cloudflare D1 adapter.
-- Includes the fields required by the Better Auth Admin plugin.
--
-- These tables are intentionally not declared in src/lib/server/db/schema.js.
-- Drizzle owns the learning-domain schema; Better Auth owns its authentication
-- schema contract. This custom migration keeps both sets of tables in the same
-- D1 database without coupling Better Auth's runtime schema to Drizzle ORM.

CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`emailVerified` integer NOT NULL,
	`image` text,
	`createdAt` date NOT NULL,
	`updatedAt` date NOT NULL,
	`role` text,
	`banned` integer,
	`banReason` text,
	`banExpires` date
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` date NOT NULL,
	`token` text NOT NULL UNIQUE,
	`createdAt` date NOT NULL,
	`updatedAt` date NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	`impersonatedBy` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`userId`);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` date,
	`refreshTokenExpiresAt` date,
	`scope` text,
	`password` text,
	`createdAt` date NOT NULL,
	`updatedAt` date NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`userId`);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` date NOT NULL,
	`createdAt` date NOT NULL,
	`updatedAt` date NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);