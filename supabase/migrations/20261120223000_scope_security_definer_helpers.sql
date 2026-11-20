-- Scope SECURITY DEFINER helper RPCs to the caller's own identity (or an admin/service role).
-- This prevents authenticated users from probing other users' roles, subscriptions, or team membership.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE
    WHEN auth.role() = 'service_role' THEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
    )
    WHEN auth.uid() IS NULL THEN false
    WHEN auth.uid() = _user_id THEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
    )
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role
    ) THEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
    )
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.is_pro(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE
    WHEN auth.role() = 'service_role' THEN EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = _user AND s.status = 'active'
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    )
    WHEN auth.uid() IS NULL THEN false
    WHEN auth.uid() = _user OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role
    ) THEN EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = _user AND s.status = 'active'
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    )
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.is_team_member(_owner uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE
    WHEN auth.role() = 'service_role' THEN EXISTS (
      SELECT 1 FROM public.team_members
      WHERE owner_id = _owner AND member_id = _user AND status = 'active'
    )
    WHEN auth.uid() IS NULL THEN false
    WHEN auth.uid() = _user OR auth.uid() = _owner OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role
    ) THEN EXISTS (
      SELECT 1 FROM public.team_members
      WHERE owner_id = _owner AND member_id = _user AND status = 'active'
    )
    ELSE false
  END;
$function$;

-- Phone confirmation had no OTP check; the current app does not call this legacy RPC.
REVOKE EXECUTE ON FUNCTION public.confirm_phone(text) FROM authenticated;
