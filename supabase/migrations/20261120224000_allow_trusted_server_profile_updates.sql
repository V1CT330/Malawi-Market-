-- Preserve protected profile fields for trusted Edge Function/service-role updates.
CREATE OR REPLACE FUNCTION public.guard_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  NEW.kyc_status := OLD.kyc_status;
  NEW.suspended := OLD.suspended;
  NEW.reputation_score := OLD.reputation_score;
  NEW.follower_count := OLD.follower_count;
  NEW.phone_verified := OLD.phone_verified;
  RETURN NEW;
END;
$function$;
