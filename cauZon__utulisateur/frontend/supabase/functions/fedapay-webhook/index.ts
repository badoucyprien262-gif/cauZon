// ==============================================================================
// 💳 cauZon - SUPABASE EDGE FUNCTION : FEDAPAY WEBHOOK
// Fichier : supabase/functions/fedapay-webhook/index.ts (Deno TypeScript)
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Client Supabase avec privilèges administrateur (Service Role) pour contourner le RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface FedaPayWebhookEvent {
  name: string; // 'transaction.approved', 'transaction.created', 'transaction.updated', etc.
  entity: {
    id: number;
    reference: string;
    amount: number;
    status: string; // 'approved', 'declined', 'canceled', 'pending'
    custom_metadata?: {
      type_achat?: 'single' | 'acte' | 'vip' | 'stockage';
      document_id?: string;
      device_id?: string;
      user_id?: string;
      transaction_id?: string;
    };
    customer?: {
      firstname?: string;
      lastname?: string;
      email?: string;
      phone_number?: {
        number?: string;
        country?: string;
      };
    };
    payment_method?: {
      name?: string;
    };
  };
}

serve(async (req: Request) => {
  // 1. Gestion des requêtes préliminaires CORS (OPTIONS)
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fedapay-signature",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée. Seul POST est accepté." }), {
      headers: { "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    const payload: FedaPayWebhookEvent = await req.json();
    console.log(`📥 Webhook FedaPay reçu : [${payload.name}] - Statut : ${payload.entity?.status} - Réf : ${payload.entity?.reference}`);

    const entity = payload.entity;
    if (!entity) {
      return new Response(JSON.stringify({ received: true, note: "payload_sans_entite" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const { status, amount, reference, custom_metadata, customer, payment_method } = entity;
    const statutNormalise = (status || "").toLowerCase();

    const transactionId = custom_metadata?.transaction_id || `FP_${entity.id}` || reference;
    const deviceId = custom_metadata?.device_id || "device_inconnu";
    const userId = custom_metadata?.user_id || null;
    const documentId = custom_metadata?.document_id || null;
    const typeAchat = custom_metadata?.type_achat || (documentId ? "acte" : "vip");
    const operateur = payment_method?.name || "Mobile Money";

    const clientNom = customer ? `${customer.firstname || ''} ${customer.lastname || ''}`.trim() : null;
    const clientEmail = customer?.email || null;
    const clientPhone = customer?.phone_number?.number || null;

    // 2. Traçabilité systématique dans la table transactions_fedapay
    const { error: errTx } = await supabase.from("transactions_fedapay").upsert({
      transaction_id: transactionId,
      user_id: userId,
      device_id: deviceId,
      type_achat: typeAchat,
      document_id: documentId,
      montant: amount,
      operateur: operateur,
      statut: statutNormalise,
      fedapay_reference: reference,
      raw_webhook_payload: payload,
      updated_at: new Date().toISOString(),
    }, { onConflict: "transaction_id" });

    if (errTx) {
      console.warn("⚠️ Note enregistrement transactions_fedapay :", errTx.message);
    }

    // 3. Traitement des paiements validés (transaction.approved)
    const estApprouve = statutNormalise === "approved" || payload.name === "transaction.approved" || statutNormalise === "successful";

    if (estApprouve) {
      console.log(`✅ Transaction validée (${amount} FCFA) pour type : ${typeAchat}`);

      // CAS A : Achat à l'acte d'un cours (100 FCFA) -> Déblocage Permanent dans acquisitions
      if ((typeAchat === "acte" || typeAchat === "single") && documentId) {
        const payloadAcq: any = {
          document_id: documentId,
          device_id: deviceId,
          is_welcome_offer: false,
          is_vip_consultation: false,
          montant_paye: amount || 100,
        };
        if (userId) payloadAcq.user_id = userId;

        const { error: errAcq } = await supabase
          .from("acquisitions")
          .upsert([payloadAcq], { onConflict: "document_id,device_id" });

        if (errAcq) {
          console.error("❌ Erreur déblocage document dans acquisitions :", errAcq.message);
          throw errAcq;
        }
        console.log(`📚 Document [${documentId}] débloqué de façon permanente pour l'appareil : ${deviceId}`);
      }

      // CAS B : Abonnement Pass VIP (500 FCFA) -> Activation 30 jours dans profiles
      else if (typeAchat === "vip") {
        const dateExpiration = new Date();
        dateExpiration.setDate(dateExpiration.getDate() + 30);

        if (userId) {
          await supabase.from("profiles").update({
            has_vip_pass: true,
            vip_expiration_date: dateExpiration.toISOString(),
          }).eq("id", userId);
        }

        console.log(`👑 Pass VIP 30 jours activé jusqu'au : ${dateExpiration.toISOString()}`);
      }

      // CAS C : Extension Stockage 250 documents (1000 FCFA) -> Activation dans profiles
      else if (typeAchat === "stockage") {
        if (userId) {
          await supabase.from("profiles").update({
            has_extended_storage: true,
          }).eq("id", userId);
        }

        console.log(`📦 Extension de stockage 250 documents activée pour l'utilisateur : ${userId}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Webhook FedaPay traité avec succès.",
      statut: statutNormalise,
      transaction_id: transactionId,
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("💥 Crash dans le traitement du Webhook FedaPay :", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur interne webhook" }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
