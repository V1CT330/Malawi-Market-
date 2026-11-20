import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-onekhusa-webhook-event, x-onekhusa-webhook-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function secretKey(): string {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try { return JSON.parse(keys).default; } catch { /* missing configuration */ }
  }
  throw new Error("Supabase server secret is not configured");
}
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(supabaseUrl, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });

function equalConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifySignature(raw: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return equalConstantTime(hex.toLowerCase(), signature.trim().toLowerCase());
}

async function initiatePayment(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token === authHeader) return json({ error: "Sign in before paying." }, 401);
  const { data: userData, error: authError } = await admin.auth.getUser(token);
  if (authError || !userData.user) return json({ error: "Your session is invalid. Sign in again." }, 401);

  const { order_id } = await req.json();
  if (typeof order_id !== "string") return json({ error: "order_id is required." }, 400);
  const { data: order, error: orderError } = await admin.from("market_orders")
    .select("id,buyer_user_id,status,payment_status,total_mwk,payment_reference")
    .eq("id", order_id).eq("buyer_user_id", userData.user.id).maybeSingle();
  if (orderError || !order) return json({ error: "Order not found." }, 404);
  if (order.status !== "pending_payment" || !["unpaid", "pending", "failed"].includes(order.payment_status)) {
    return json({ error: "This order is not awaiting payment." }, 409);
  }

  const env = (Deno.env.get("ONEKHUSA_ENV") ?? "sandbox").toLowerCase();
  const base = env === "live" ? "https://api.onekhusa.com/live/v1" : "https://api.onekhusa.com/sandbox/v1";
  const apiKey = Deno.env.get("ONEKHUSA_API_KEY");
  const apiSecret = Deno.env.get("ONEKHUSA_API_SECRET");
  const organisationId = Deno.env.get("ONEKHUSA_ORGANISATION_ID");
  const merchantRaw = Deno.env.get("ONEKHUSA_MERCHANT_ACCOUNT_NUMBER");
  const capturedBy = Deno.env.get("ONEKHUSA_CAPTURED_BY");
  if (!apiKey || !apiSecret || !organisationId || !merchantRaw || !capturedBy) {
    return json({ error: "OneKhusa is selected, but its merchant credentials have not been configured on the Malawi Market backend yet." }, 503);
  }
  const merchantAccountNumber = Number(merchantRaw);
  if (!Number.isInteger(merchantAccountNumber) || merchantAccountNumber < 10000000 || merchantAccountNumber > 99999999) {
    return json({ error: "OneKhusa merchant account number is invalid." }, 500);
  }

  const { data: active } = await admin.from("market_payment_attempts")
    .select("provider_reference,timed_account_number,expires_at,status,amount_mwk")
    .eq("order_id", order.id).in("status", ["initiating", "pending"]).maybeSingle();
  if (active?.status === "pending" && active.expires_at && new Date(active.expires_at).getTime() > Date.now()) {
    return json({ provider: "onekhusa", reference: active.provider_reference, timed_account_number: active.timed_account_number, expires_at: active.expires_at, amount_mwk: active.amount_mwk });
  }
  if (active) await admin.from("market_payment_attempts").update({ status: "expired", updated_at: new Date().toISOString() }).eq("provider_reference", active.provider_reference);

  const reference = "MM-" + crypto.randomUUID().replaceAll("-", "").toUpperCase();
  const { error: insertError } = await admin.from("market_payment_attempts").insert({
    order_id: order.id, provider: "onekhusa", provider_reference: reference,
    amount_mwk: order.total_mwk, status: "initiating",
  });
  if (insertError) return json({ error: "A payment attempt is already being created. Retry in a moment." }, 409);

  try {
    const tokenResponse = await fetch(base + "/account/getAccessToken", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, apiSecret, organisationId, merchantAccountNumber }),
    });
    const tokenBody = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenBody.accessToken) throw new Error(tokenBody.message ?? "OneKhusa authentication failed.");
    const payResponse = await fetch(base + "/collections/requestToPay/initiate", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + tokenBody.accessToken,
        "Content-Type": "application/json",
        "Accept-Language": "en",
        "X-Idempotency-Key": reference,
      },
      body: JSON.stringify({
        merchantAccountNumber,
        transactionAmount: Number(order.total_mwk),
        transactionDescription: "Malawi Market order " + order.id,
        referenceNumber: reference,
        capturedBy,
      }),
    });
    const payBody = await payResponse.json();
    if (!payResponse.ok || !payBody.timedAccountNumber) throw new Error(payBody.message ?? payBody.title ?? "OneKhusa could not create a payment request.");
    const expiresAt = payBody.expiryDate ?? new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error: updateError } = await admin.from("market_payment_attempts").update({
      timed_account_number: String(payBody.timedAccountNumber), expires_at: expiresAt, status: "pending", updated_at: new Date().toISOString(),
    }).eq("provider_reference", reference);
    if (updateError) throw updateError;
    await admin.from("market_orders").update({
      payment_status: "pending", payment_reference: reference, updated_at: new Date().toISOString(),
    }).eq("id", order.id);
    return json({ provider: "onekhusa", reference, timed_account_number: String(payBody.timedAccountNumber), expires_at: expiresAt, amount_mwk: order.total_mwk });
  } catch (error) {
    await admin.from("market_payment_attempts").update({ status: "failed", updated_at: new Date().toISOString() }).eq("provider_reference", reference);
    return json({ error: error instanceof Error ? error.message : "Payment initiation failed." }, 502);
  }
}

async function initiateAdPayment(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token === authHeader) return json({ error: "Sign in before paying." }, 401);
  const { data: userData, error: authError } = await admin.auth.getUser(token);
  if (authError || !userData.user) return json({ error: "Your session is invalid. Sign in again." }, 401);
  const { campaign_id } = await req.json();
  if (typeof campaign_id !== "string") return json({ error: "campaign_id is required." }, 400);
  const { data: campaign, error } = await admin.from("market_ad_campaigns")
    .select("id,advertiser_user_id,status,payment_status,budget_mwk,payment_reference")
    .eq("id", campaign_id).eq("advertiser_user_id", userData.user.id).maybeSingle();
  if (error || !campaign) return json({ error: "Campaign not found." }, 404);
  if (campaign.status !== "draft" || campaign.payment_status !== "unpaid") return json({ error: "This campaign is not awaiting payment." }, 409);
  const env = (Deno.env.get("ONEKHUSA_ENV") ?? "sandbox").toLowerCase();
  const base = env === "live" ? "https://api.onekhusa.com/live/v1" : "https://api.onekhusa.com/sandbox/v1";
  const apiKey = Deno.env.get("ONEKHUSA_API_KEY");
  const apiSecret = Deno.env.get("ONEKHUSA_API_SECRET");
  const organisationId = Deno.env.get("ONEKHUSA_ORGANISATION_ID");
  const merchantRaw = Deno.env.get("ONEKHUSA_MERCHANT_ACCOUNT_NUMBER");
  const capturedBy = Deno.env.get("ONEKHUSA_CAPTURED_BY");
  if (!apiKey || !apiSecret || !organisationId || !merchantRaw || !capturedBy) return json({ error: "OneKhusa merchant credentials are not configured." }, 503);
  const merchantAccountNumber = Number(merchantRaw);
  if (!Number.isInteger(merchantAccountNumber) || merchantAccountNumber < 10000000 || merchantAccountNumber > 99999999) return json({ error: "OneKhusa merchant account number is invalid." }, 500);
  const reference = "MKA-" + crypto.randomUUID().replaceAll("-", "").toUpperCase();
  const { data: reserved, error: reserveError } = await admin.from("market_ad_campaigns").update({
    status: "pending_payment", payment_status: "pending", payment_reference: reference, updated_at: new Date().toISOString()
  }).eq("id", campaign.id).eq("status", "draft").eq("payment_status", "unpaid").select("id").maybeSingle();
  if (reserveError || !reserved) return json({ error: "Campaign payment is already being processed. Refresh and retry." }, 409);
  try {
    const tokenResponse = await fetch(base + "/account/getAccessToken", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey, apiSecret, organisationId, merchantAccountNumber }) });
    const tokenBody = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenBody.accessToken) throw new Error(tokenBody.message ?? "OneKhusa authentication failed.");
    const payResponse = await fetch(base + "/collections/requestToPay/initiate", {
      method: "POST",
      headers: { "Authorization": "Bearer " + tokenBody.accessToken, "Content-Type": "application/json", "Accept-Language": "en", "X-Idempotency-Key": reference },
      body: JSON.stringify({ merchantAccountNumber, transactionAmount: Number(campaign.budget_mwk), transactionDescription: "Malawi Market advertising campaign " + campaign.id, referenceNumber: reference, capturedBy }),
    });
    const payBody = await payResponse.json();
    if (!payResponse.ok || !payBody.timedAccountNumber) throw new Error(payBody.message ?? payBody.title ?? "OneKhusa could not create a payment request.");
    return json({ provider: "onekhusa", reference, timed_account_number: String(payBody.timedAccountNumber), expires_at: payBody.expiryDate ?? new Date(Date.now() + 15 * 60 * 1000).toISOString(), amount_mwk: campaign.budget_mwk });
  } catch (error) {
    await admin.from("market_ad_campaigns").update({ status: "draft", payment_status: "failed", payment_reference: null, updated_at: new Date().toISOString() }).eq("id", campaign.id).eq("payment_reference", reference);
    return json({ error: error instanceof Error ? error.message : "Ad payment initiation failed." }, 502);
  }
}

async function receiveWebhook(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("X-OneKhusa-Webhook-Signature") ?? "";
  const event = (req.headers.get("X-OneKhusa-Webhook-Event") ?? "").toLowerCase();
  const webhookSecret = Deno.env.get("ONEKHUSA_WEBHOOK_SECRET");
  if (!webhookSecret) return json({ error: "Webhook secret is not configured." }, 503);
  if (!await verifySignature(raw, signature, webhookSecret)) return json({ error: "Invalid webhook signature." }, 401);

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch { return json({ error: "Invalid JSON." }, 400); }
  const metadata = (payload.metaData ?? payload.metadata ?? {}) as Record<string, unknown>;
  const reference = String(metadata.referenceNumber ?? payload.referenceNumber ?? payload.sourceReferenceNumber ?? "");
  const transactionReference = String(payload.transactionReferenceNumber ?? "");
  const amount = Number(payload.transactionAmount);
  if (!reference || !transactionReference || !Number.isFinite(amount)) return json({ error: "Missing transaction reference or amount." }, 400);

  if (reference.startsWith("MKA-")) {
    const { data: campaign, error: campaignError } = await admin.from("market_ad_campaigns")
      .select("id,budget_mwk,status,payment_status,payment_reference").eq("payment_reference", reference).maybeSingle();
    if (campaignError || !campaign) return json({ error: "No matching advertising payment." }, 404);
    if (campaign.payment_status === "paid" && event === "payrequest.success") return json({ acknowledged: true, duplicate: true });
    if (event === "payrequest.success" && String(payload.transactionStatusCode) === "S") {
      if (Number(campaign.budget_mwk) !== amount) {
        await admin.from("market_ad_campaigns").update({ status: "paused", payment_status: "review_required", provider_transaction_reference: transactionReference, updated_at: new Date().toISOString() }).eq("id", campaign.id);
        return json({ acknowledged: true, review_required: true });
      }
      const now = new Date().toISOString();
      const { data: paid, error: paidError } = await admin.from("market_ad_campaigns").update({
        status: "active", payment_status: "paid", provider_transaction_reference: transactionReference, activated_at: now, updated_at: now
      }).eq("id", campaign.id).eq("status", "pending_payment").eq("payment_status", "pending").select("id").maybeSingle();
      if (paidError || !paid) return json({ acknowledged: true, review_required: true });
    } else if (event === "payrequest.reversed") {
      await admin.from("market_ad_campaigns").update({ status: "paused", payment_status: "reversed", provider_transaction_reference: transactionReference, updated_at: new Date().toISOString() }).eq("id", campaign.id);
    } else return json({ acknowledged: true, ignored: true });
    return json({ acknowledged: true });
  }

  const { data: attempt, error } = await admin.from("market_payment_attempts")
    .select("id,order_id,amount_mwk,status").eq("provider_reference", reference).maybeSingle();
  if (error || !attempt) return json({ error: "No matching Malawi Market payment attempt." }, 404);
  if (attempt.status === "paid" && event === "payrequest.success") return json({ acknowledged: true, duplicate: true });
  if (attempt.status === "reversed" && event === "payrequest.success") {
    await admin.from("market_orders").update({ status: "review_required", payment_status: "review_required", updated_at: new Date().toISOString() }).eq("id", attempt.order_id);
    return json({ acknowledged: true, review_required: true });
  }
  const orderResult = await admin.from("market_orders").select("id,status,payment_status,total_mwk").eq("id", attempt.order_id).single();
  const order = orderResult.data;
  if (!order) return json({ error: "Order not found." }, 404);
  if (Math.abs(amount - Number(attempt.amount_mwk)) > 0.000001 || Number(order.total_mwk) !== Number(attempt.amount_mwk)) {
    await admin.from("market_payment_attempts").update({ status: "review_required", provider_transaction_reference: transactionReference, provider_response_code: String(payload.responseCode ?? ""), updated_at: new Date().toISOString() }).eq("id", attempt.id);
    await admin.from("market_orders").update({ status: "review_required", payment_status: "review_required", updated_at: new Date().toISOString() }).eq("id", order.id);
    return json({ acknowledged: true, review_required: true });
  }

  if (event === "payrequest.success" && String(payload.transactionStatusCode) === "S") {
    if (order.status === "cancelled") {
      await admin.from("market_payment_attempts").update({ status: "review_required", provider_transaction_reference: transactionReference, updated_at: new Date().toISOString() }).eq("id", attempt.id);
      await admin.from("market_orders").update({ status: "review_required", payment_status: "review_required", updated_at: new Date().toISOString() }).eq("id", order.id);
      return json({ acknowledged: true, review_required: true });
    }
    const paidAt = new Date().toISOString();
    const { data: paidOrder, error: paidOrderError } = await admin.from("market_orders").update({
      status: "processing", payment_status: "paid", paid_at: paidAt, updated_at: paidAt,
    }).eq("id", order.id).eq("status", "pending_payment").eq("payment_status", "pending").select("id").maybeSingle();
    if (paidOrderError || !paidOrder) {
      await admin.from("market_payment_attempts").update({
        status: "review_required", provider_transaction_reference: transactionReference, provider_response_code: String(payload.responseCode ?? ""), updated_at: paidAt,
      }).eq("id", attempt.id);
      await admin.from("market_orders").update({ status: "review_required", payment_status: "review_required", updated_at: paidAt }).eq("id", order.id);
      return json({ acknowledged: true, review_required: true });
    }
    await admin.from("market_payment_attempts").update({
      status: "paid", provider_transaction_reference: transactionReference, provider_response_code: String(payload.responseCode ?? ""), paid_at: paidAt, updated_at: paidAt,
    }).eq("id", attempt.id);
    await admin.from("market_order_items").update({ fulfillment_status: "processing" }).eq("order_id", order.id).eq("fulfillment_status", "awaiting_payment");
  } else if (event === "payrequest.reversed") {
    await admin.from("market_payment_attempts").update({
      status: "reversed", provider_transaction_reference: transactionReference, provider_response_code: String(payload.responseCode ?? ""), updated_at: new Date().toISOString(),
    }).eq("id", attempt.id);
    await admin.from("market_orders").update({
      status: "payment_reversed", payment_status: "reversed", updated_at: new Date().toISOString(),
    }).eq("id", order.id);
  } else {
    return json({ acknowledged: true, ignored: true });
  }
  return json({ acknowledged: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/webhook")) return await receiveWebhook(req);
    const body = await req.clone().json().catch(() => ({}));
    if (body.action === "initiate_ad") return await initiateAdPayment(req);
    if (body.action !== "initiate") return json({ error: "Unsupported action." }, 400);
    return await initiatePayment(req);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected payment error." }, 500);
  }
});
