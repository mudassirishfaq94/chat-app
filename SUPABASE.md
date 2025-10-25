# Supabase Cloud Database Design and Implementation Guide

This document describes the complete cloud-based data model, SQL schema, Row Level Security (RLS) policies, storage configuration, indexes, and backup procedures to replace the current local storage with Supabase.

## Credentials to Provide (from your Supabase project)

Paste these into your workspace `.env` (do NOT commit service keys):

- SUPABASE_URL = https://<your-project-ref>.supabase.co
- SUPABASE_ANON_KEY = <anon-public-key>
- SUPABASE_SERVICE_ROLE_KEY = <service-role-key>  (server-side only, never to client)
- SUPABASE_DB_URL = postgres://<user>:<password>@db.<your-project-ref>.supabase.co:5432/postgres
- SUPABASE_BUCKET = chat-media

If you changed JWT settings, note:
- JWT verifications use your project’s JWT secret. Keep defaults unless you have a custom signing setup.
- The service role key bypasses RLS. Keep it in server-side secrets only.

## Data Model Overview (ER Diagram in text)

- auth.users (built-in)
  - profiles (public.profiles) — 1:1 with auth.users
- invitations (public.invitations) — sender (auth.users) → recipient (auth.users?) or email
- friendships (public.friendships) — user1 ↔ user2, status
- rooms (public.rooms)
  - participants (public.participants) — room ↔ user, role
  - messages (public.messages) — room ↔ sender, content + attachment metadata
  - media (public.media) — owner ↔ room/message, storage object reference

Key lookups and references:
- profiles.id references auth.users.id
- invitations.sender_id and invitations.recipient_id reference auth.users.id
- friendships.user1_id and friendships.user2_id reference auth.users.id
- rooms.created_by references auth.users.id
- participants.room_id references rooms.id; participants.user_id references auth.users.id
- messages.room_id references rooms.id; messages.sender_id references auth.users.id
- media.owner_id references auth.users.id; media.room_id references rooms.id; media.message_id references messages.id

## Implementation Steps

1) Create schema: Open Supabase SQL editor and run files:
- supabase/sql/schema.sql

2) Enable and configure RLS: Run
- supabase/sql/policies.sql

3) Create storage bucket and storage policies: Run
- supabase/sql/storage.sql

4) Indexes for performance are included in schema.sql; verify via Database → Tables → Indexes.

5) Backups:
- Enable automatic daily backups in project settings (paid tiers) or
- Use pg_dump from CI with SUPABASE_DB_URL (service role credentials) on a schedule.

6) Documentation:
- This SUPABASE.md is your canonical reference. Keep it updated when evolving the schema.

## Table Summaries

profiles
- id (uuid, PK, references auth.users.id)
- display_name (text)
- avatar_url (text)
- created_at (timestamptz)

invitations
- id (uuid, PK)
- sender_id (uuid → auth.users.id)
- recipient_email (text)
- recipient_id (uuid → auth.users.id, nullable)
- status (invitation_status enum)
- token (text, unique)
- expires_at (timestamptz)
- created_at, accepted_at (timestamptz)

friendships
- id (uuid, PK)
- user1_id, user2_id (uuid → auth.users.id)
- status (friendship_status enum)
- created_at, updated_at (timestamptz)
- unique pair index (order-insensitive)

rooms
- id (uuid, PK)
- is_direct (boolean)
- created_by (uuid → auth.users.id)
- created_at (timestamptz)

participants
- room_id (uuid → rooms.id)
- user_id (uuid → auth.users.id)
- role (member_role enum)
- joined_at (timestamptz)
- PK (room_id, user_id)

messages
- id (uuid, PK)
- room_id (uuid → rooms.id)
- sender_id (uuid → auth.users.id)
- content (text)
- attachment_url, attachment_type, attachment_name, attachment_size, attachment_mime
- created_at, edited_at, deleted_at (timestamptz)

media
- id (uuid, PK)
- owner_id (uuid → auth.users.id)
- room_id (uuid → rooms.id)
- message_id (uuid → messages.id)
- bucket_id (text, default 'chat-media')
- object_path (text)
- name, mime, size, type (text/integer)
- created_at (timestamptz)
- checksum (text, optional)

## RLS Summary

- profiles: any authenticated can read; only owner can insert/update
- invitations: sender or recipient (by id or email claim) can read; sender can insert; sender/recipient can update
- friendships: either user in the pair can read/update; only initiator (user1) can insert
- rooms: only participants can read; creator/admin can update
- participants: visible to room participants; only creator/admin can insert/delete
- messages: visible to room participants; only sender can insert/update; admin/sender can delete
- media: owner or room participant can read; owner can insert/delete; storage policies mirror this via storage.objects

## Storage Configuration

- Bucket: chat-media (private)
- Object path convention: room/<room_id>/message/<message_id>/<filename>
- Keep media table in sync with storage operations (write metadata when uploading).
- Storage policies restrict read to owner or room participants by joining to public.media.

## Backups

- Automated: Enable from project settings if available.
- Manual/CI:
  pg_dump --format=c --file backup.dump "$SUPABASE_DB_URL"
- Restore:
  pg_restore --clean --create --dbname=postgres --host=db.<ref>.supabase.co --username=<db_user> backup.dump

Security best practices
- Never expose service role key to the client; use server-only secret management.
- Keep bucket private; use signed URLs when needed.
- Review all RLS policies whenever schema changes.
