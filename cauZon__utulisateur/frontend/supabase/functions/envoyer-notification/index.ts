// ==============================================================================
// ⚡ cauZon - SUPABASE EDGE FUNCTION : ENVOI NOTIFICATIONS FLASHSCORE
// Fichier : supabase/functions/envoyer-notification/index.ts (Deno TypeScript)
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface NotificationRequest {
  title: string;
  body: string;
  document_id?: string;
  route?: string;
  target_user_id?: string;
  tokens?: string[];
  send_to_all?: boolean;
}

serve(async (req: Request) => {
  // Gestion CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const payload: NotificationRequest = await req.json();
    const { title, body, document_id, route, target_user_id, tokens, send_to_all } = payload;

    if (!title || !body) {
      return new Response(JSON.stringify({ error: "title et body sont obligatoires." }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    const tokensToNotify = new Set<string>();

    if (tokens && Array.isArray(tokens) && tokens.length > 0) {
      tokens.forEach((t) => {
        if (typeof t === "string" && (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["))) {
          tokensToNotify.add(t);
        }
      });
    } else {
      // 1. Récupération depuis la table push_tokens
      let queryPush = supabaseAdmin
        .from("push_tokens")
        .select("token")
        .eq("est_actif", true);

      if (target_user_id) {
        queryPush = queryPush.eq("user_id", target_user_id);
      }

      const { data: pushData } = await queryPush;
      if (pushData) {
        pushData.forEach((row: { token: string }) => {
          if (row.token) tokensToNotify.add(row.token);
        });
      }

      // 2. Repli profiles.push_token
      let queryProfiles = supabaseAdmin
        .from("profiles")
        .select("push_token")
        .not("push_token", "is", null);

      if (target_user_id) {
        queryProfiles = queryProfiles.eq("id", target_user_id);
      }

      const { data: profData } = await queryProfiles;
      if (profData) {
        profData.forEach((row: { push_token: string | null }) => {
          if (row.push_token) tokensToNotify.add(row.push_token);
        });
      }
    }

    const validTokens = Array.from(tokensToNotify);

    if (validTokens.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        sent: 0,
        message: "Aucun token push actif trouvé pour cette cible.",
      }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Préparation des messages haute priorité "FlashScore" avec rétention 24h
    const messages = validTokens.map((token) => ({
      to: token,
      sound: "default",
      title: title,
      body: body,
      priority: "high",
      ttl: 86400,
      channelId: "default",
      _displayInForeground: true,
      data: {
        document_id: document_id || undefined,
        route: route || "Bibliotheque",
        cible: route || "Bibliotheque",
      },
    }));

    // Envoi par lots de 100 à Expo
    const CHUNK_SIZE = 100;
    let totalSuccess = 0;
    let totalErrors = 0;
    const invalidTokensToDeactivate: string[] = [];

    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      const chunk = messages.slice(i, i + CHUNK_SIZE);
      const res = await fetch(EXPO_PUSH_API_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        totalErrors += chunk.length;
        continue;
      }

      const json = await res.json();
      const tickets = json?.data || [];

      for (let k = 0; k < tickets.length; k++) {
        const ticket = tickets[k];
        if (ticket.status === "ok") {
          totalSuccess++;
        } else {
          totalErrors++;
          if (ticket.details?.error === "DeviceNotRegistered") {
            const tokenToPurge = chunk[k]?.to;
            if (tokenToPurge) invalidTokensToDeactivate.push(tokenToPurge);
          }
        }
      }
    }

    // Nettoyage en arrière-plan des tokens désinstallés
    if (invalidTokensToDeactivate.length > 0) {
      await supabaseAdmin
        .from("push_tokens")
        .update({ est_actif: false, derniere_activite: new Date().toISOString() })
        .in("token", invalidTokensToDeactivate);

      await supabaseAdmin
        .from("profiles")
        .update({ push_token: null })
        .in("push_token", invalidTokensToDeactivate);
    }

    return new Response(JSON.stringify({
      success: totalSuccess > 0,
      total_targeted: validTokens.length,
      total_success: totalSuccess,
      total_errors: totalErrors,
      deactivated_tokens_count: invalidTokensToDeactivate.length,
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    console.error("Erreur Edge Function envoyer-notification :", err);
    return new Response(JSON.stringify({ error: err?.message || "Erreur interne" }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
