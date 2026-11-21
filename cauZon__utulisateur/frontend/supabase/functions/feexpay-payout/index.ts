// ==============================================================================
// 💸 cauZon.ci — EDGE FUNCTION : feexpay-payout (retrait posteur >= 5 000 FCFA)
//
// - Authentifie le posteur via son JWT Supabase (jamais d'ID fourni par le client)
// - Débit atomique + idempotent via RPC demander_retrait_posteur (service_role)
// - Le numéro Mobile Money transite UNIQUEMENT en mémoire vers FeexPay :
//   il n'est jamais écrit en base, ni loggué.
// - Échec FeexPay => finaliser_retrait_posteur(false) => solde re-crédité.
//
// Variables d'environnement requises :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FEEXPAY_SECRET_KEY, FEEXPAY_PAYOUT_URL
//   (FEEXPAY_PAYOUT_URL = endpoint payout de votre compte FeexPay, à confirmer
//    dans la documentation / le dashboard FeexPay).
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FEEXPAY_SECRET_KEY = Deno.env.get("FEEXPAY_SECRET_KEY") || "";
const FEEXPAY_PAYOUT_URL = Deno.env.get("FEEXPAY_PAYOUT_URL") || "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const OPERATEURS = ["WAVE_CI", "MTN_CI", "ORANGE_CI", "MOOV_CI"];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, message: "Méthode non autorisée." }, 405);

  try {
    // 1. Authentification du posteur
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: userData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !userData?.user) return json({ success: false, message: "Session invalide." }, 401);
    const posteurId = userData.user.id;

    // 2. Validation des entrées
    const body = await req.json().catch(() => ({}));
    const montant = Number(body.montant);
    const operateur = String(body.operateur || "");
    const idempotencyKey = String(body.idempotencyKey || "");
    const telephone = String(body.telephone || "").replace(/[^\d+]/g, "");

    if (!Number.isFinite(montant) || montant < 5000) {
      return json({ success: false, message: "Le montant minimum de retrait est de 5 000 FCFA." }, 400);
    }
    if (!OPERATEURS.includes(operateur)) return json({ success: false, message: "Opérateur invalide." }, 400);
    if (telephone.length < 8 || telephone.length > 15) return json({ success: false, message: "Numéro invalide." }, 400);

    if (!FEEXPAY_PAYOUT_URL || !FEEXPAY_SECRET_KEY) {
      // Pas de débit tant que la passerelle de payout n'est pas configurée
      return json({ success: false, message: "Retraits temporairement indisponibles (passerelle non configurée)." }, 503);
    }

    // 3. Débit atomique + idempotent
    const { data: dem, error: rpcErr } = await admin.rpc("demander_retrait_posteur", {
      p_posteur_id: posteurId,
      p_montant: montant,
      p_operateur: operateur,
      p_idempotency_key: idempotencyKey,
    });
    if (rpcErr) throw rpcErr;
    if (!dem?.success) return json({ success: false, message: dem?.message || "Demande refusée." }, 400);
    if (dem.deja_traite) return json({ success: true, deja_traite: true, statut: dem.statut, demande_id: dem.demande_id });

    // 4. Exécution du payout FeexPay (numéro uniquement en mémoire)
    let succes = false;
    let reference: string | null = null;
    let motif: string | null = null;
    try {
      const res = await fetch(FEEXPAY_PAYOUT_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${FEEXPAY_SECRET_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          amount: montant,
          phoneNumber: telephone,
          operator: operateur,
          reference: dem.demande_id,
          description: "Retrait gains posteur cauZon",
        }),
      });
      const payload = await res.json().catch(() => ({}));
      const statut = String(payload?.status || payload?.data?.status || "").toUpperCase();
      succes = res.ok && ["SUCCESS", "SUCCESSFUL", "APPROVED", "PENDING", "PROCESSING"].includes(statut);
      reference = payload?.reference || payload?.data?.reference || null;
      if (!succes) motif = `FeexPay: ${res.status} ${statut || "rejet"}`;
    } catch (_) {
      motif = "Erreur réseau passerelle";
    }

    // 5. Clôture : succès => ledger ; échec => re-crédit
    await admin.rpc("finaliser_retrait_posteur", {
      p_demande_id: dem.demande_id,
      p_succes: succes,
      p_reference_payout: reference,
      p_motif: motif,
    });

    if (!succes) {
      return json({ success: false, message: "Le virement a échoué. Votre solde a été re-crédité intégralement." }, 502);
    }
    return json({ success: true, demande_id: dem.demande_id, statut: "valide" });
  } catch (e: any) {
    console.error("💥 feexpay-payout :", e?.message);
    return json({ success: false, message: "Erreur interne." }, 500);
  }
});
