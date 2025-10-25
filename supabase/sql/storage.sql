-- Storage bucket and policies for chat media

-- Create private bucket
select storage.create_bucket('chat-media', public := false);

-- Ensure RLS is enabled on storage objects (default in Supabase)
alter table storage.objects enable row level security;

-- SELECT: allow owner or room participants to read objects linked in public.media
create policy storage_select_media_owner_or_room on storage.objects
  for select using (
    bucket_id = 'chat-media' and exists (
      select 1 from public.media m
      where m.bucket_id = storage.objects.bucket_id
        and m.object_path = storage.objects.name
        and (
          m.owner_id = auth.uid() or (m.room_id is not null and public.is_room_participant(m.room_id))
        )
    )
  );

-- INSERT: allow any authenticated user to upload into chat-media
create policy storage_insert_authenticated on storage.objects
  for insert with check (
    bucket_id = 'chat-media' and auth.uid() is not null
  );

-- UPDATE: allow owner to update objects they own (linked via public.media)
create policy storage_update_owner_only on storage.objects
  for update using (
    bucket_id = 'chat-media' and exists (
      select 1 from public.media m
      where m.bucket_id = storage.objects.bucket_id
        and m.object_path = storage.objects.name
        and m.owner_id = auth.uid()
    )
  );

-- DELETE: allow owner to delete objects they own (linked via public.media)
create policy storage_delete_owner_only on storage.objects
  for delete using (
    bucket_id = 'chat-media' and exists (
      select 1 from public.media m
      where m.bucket_id = storage.objects.bucket_id
        and m.object_path = storage.objects.name
        and m.owner_id = auth.uid()
    )
  );

-- Recommended path convention: room/<room_id>/message/<message_id>/<filename>
-- Keep public.media rows in sync with storage operations.
