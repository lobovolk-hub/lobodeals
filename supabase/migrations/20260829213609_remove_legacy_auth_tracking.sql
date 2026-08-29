-- P10: remove only the retired public auth/profile/tracking surface.
-- Auth users are hard-deleted separately through the Supabase Auth Admin API.

drop trigger on_auth_user_created_create_profile on auth.users;

drop function public.get_email_for_login_username(text);
drop function public.get_user_tracked_item_ids(uuid[]);
drop function public.handle_new_auth_user();
drop function public.is_login_username_available(text);
drop function public.is_user_tracking_item(uuid);
drop function public.toggle_user_tracked_item(uuid);
drop function public.track_user_item(uuid);
drop function public.untrack_user_item(uuid);

drop table public.user_tracked_items;
drop table public.profiles;

drop function public.resolve_tracking_item_id(uuid);
drop function public.prevent_username_update_before_30_days();
drop function public.make_default_login_username(uuid);
drop function public.normalize_candidate_login_username(text);
