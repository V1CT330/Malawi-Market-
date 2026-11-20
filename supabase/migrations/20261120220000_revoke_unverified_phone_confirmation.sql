-- Prevent users from marking an arbitrary phone number as verified without OTP proof.
-- The current Malawi Market app does not call this legacy RPC.
REVOKE EXECUTE ON FUNCTION public.confirm_phone(text) FROM authenticated;
