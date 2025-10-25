-- Supabase schema for chat app
set search_path = public;

-- Extensions
create extension if not exists pgcrypto;

-- Enums
create type invitation_status as enum ('pending','accepted','declined','expired');
create type friendship_status as enum ('pending','accepted','blocked');
create type member_role as enum ('admin','member');
create type attachment_type as enum ('image','video','file');

-- Helper functions
create or replace function is_room_participant(p_room_id uuid)
returns boolean stable language sql as $$
  select exists(
    select 1 from public.participants p
    where p.room_id = p_room_id and p.user_id = auth.uid()
  );
$$;

create or replace function is_room_admin(p_room_id uuid)
returns boolean stable language sql as $$
  select exists(
    select 1 from public.participants p
    where p.room_id = p_room_id and p.user_id = auth.uid() and p.role = 'admin'
  );
$$;

-- Profiles (1:1 with auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Invitations
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  recipient_id uuid references auth.users(id) on delete set null,
  status invitation_status not null default 'pending',
  token text unique,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists invitations_recipient_email_idx on invitations(recipient_email);
create index if not exists invitations_status_idx on invitations(status);

-- Friendships
create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  user1_id uuid not null references auth.users(id) on delete cascade,
  user2_id uuid not null references auth.users(id) on delete cascade,
  status friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Unique pair (order-insensitive)
create unique index if not exists friendships_pair_unique
  on friendships(least(user1_id, user2_id), greatest(user1_id, user2_id));

-- Rooms
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  is_direct boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Participants
create table if not exists participants (
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists participants_room_idx on participants(room_id);
create index if not exists participants_user_idx on participants(user_id);

-- Messages
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text,
  attachment_url text,
  attachment_type attachment_type,
  attachment_name text,
  attachment_size integer,
  attachment_mime text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index if not exists messages_room_created_idx on messages(room_id, created_at);
create index if not exists messages_sender_idx on messages(sender_id);

-- Media metadata
create table if not exists media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid references rooms(id) on delete set null,
  message_id uuid references messages(id) on delete set null,
  bucket_id text not null default 'chat-media',
  object_path text not null,
  name text,
  mime text,
  size integer,
  type text,
  checksum text,
  created_at timestamptz not null default now()
);

create index if not exists media_room_idx on media(room_id);
create index if not exists media_message_idx on media(message_id);
create index if not exists media_owner_idx on media(owner_id);
create index if not exists media_bucket_path_idx on media(bucket_id, object_path);

-- Updated_at trigger function
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Apply updated_at triggers
create trigger friendships_set_updated_at before update on friendships
  for each row execute function set_updated_at();
