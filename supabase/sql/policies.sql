-- Enable Row Level Security (RLS)
alter table profiles enable row level security;
alter table invitations enable row level security;
alter table friendships enable row level security;
alter table rooms enable row level security;
alter table participants enable row level security;
alter table messages enable row level security;
alter table media enable row level security;

-- PROFILES
create policy profiles_select_authenticated on profiles
  for select using (auth.uid() is not null);
create policy profiles_insert_owner on profiles
  for insert with check (id = auth.uid());
create policy profiles_update_owner on profiles
  for update using (id = auth.uid());

-- INVITATIONS
create policy invitations_select_sender_or_recipient on invitations
  for select using (
    sender_id = auth.uid()
    or recipient_id = auth.uid()
    or recipient_email = (auth.jwt() ->> 'email')
  );
create policy invitations_insert_sender on invitations
  for insert with check (sender_id = auth.uid());
create policy invitations_update_sender_or_recipient on invitations
  for update using (sender_id = auth.uid() or recipient_id = auth.uid());

-- FRIENDSHIPS
create policy friendships_select_participant on friendships
  for select using (auth.uid() = user1_id or auth.uid() = user2_id);
create policy friendships_insert_initiator on friendships
  for insert with check (auth.uid() = user1_id);
create policy friendships_update_either on friendships
  for update using (auth.uid() = user1_id or auth.uid() = user2_id);

-- ROOMS
create policy rooms_select_participant on rooms
  for select using (is_room_participant(id));
create policy rooms_insert_creator on rooms
  for insert with check (created_by = auth.uid());
create policy rooms_update_admin_or_creator on rooms
  for update using (
    created_by = auth.uid() or is_room_admin(id)
  );

-- PARTICIPANTS
create policy participants_select_room_participants on participants
  for select using (is_room_participant(room_id));
create policy participants_insert_admin_or_creator on participants
  for insert with check (
    exists(
      select 1 from rooms r where r.id = participants.room_id and r.created_by = auth.uid()
    )
    or exists(
      select 1 from participants p2 where p2.room_id = participants.room_id and p2.user_id = auth.uid() and p2.role = 'admin'
    )
  );
create policy participants_delete_admin_or_creator on participants
  for delete using (
    exists(
      select 1 from rooms r where r.id = participants.room_id and r.created_by = auth.uid()
    )
    or is_room_admin(room_id)
  );

-- MESSAGES
create policy messages_select_room_participants on messages
  for select using (is_room_participant(room_id));
create policy messages_insert_sender_participant on messages
  for insert with check (is_room_participant(room_id) and sender_id = auth.uid());
create policy messages_update_sender_only on messages
  for update using (sender_id = auth.uid());
create policy messages_delete_sender_or_admin on messages
  for delete using (sender_id = auth.uid() or is_room_admin(room_id));

-- MEDIA
create policy media_select_owner_or_room on media
  for select using (
    owner_id = auth.uid() or (room_id is not null and is_room_participant(room_id))
  );
create policy media_insert_owner_only on media
  for insert with check (owner_id = auth.uid());
create policy media_delete_owner_or_admin on media
  for delete using (
    owner_id = auth.uid() or (room_id is not null and is_room_admin(room_id))
  );
