import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase environment variables." }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }

  const authHeader =
    request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = bearerMatch?.[1]?.trim() ?? "";
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const {
    data: { user },
    error: userError
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const payload = await request.json().catch(() => ({}));
  const draftId = typeof payload?.draftId === "string" ? payload.draftId.trim() : "";
  if (!draftId) {
    return new Response(JSON.stringify({ error: "Missing draftId." }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }

  const { data: draftAccess, error: draftAccessError } = await supabase
    .from("site_drafts")
    .select("id")
    .eq("id", draftId)
    .maybeSingle();

  if (draftAccessError) {
    return new Response(JSON.stringify({ error: draftAccessError.message }), {
      status: 403,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }

  if (!draftAccess) {
    return new Response(JSON.stringify({ error: "Draft not found or inaccessible." }), {
      status: 404,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }

  const { data: images, error: imagesError } = await supabase
    .from("site_draft_images")
    .select("storage_path")
    .eq("draft_id", draftId);

  if (imagesError) {
    return new Response(JSON.stringify({ error: imagesError.message }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }

  const paths = (images ?? [])
    .map((image) => (typeof image.storage_path === "string" ? image.storage_path.trim() : ""))
    .filter(Boolean);

  if (paths.length) {
    const { error: storageError } = await supabase.storage.from("site-draft-images").remove(paths);
    if (storageError) {
      return new Response(JSON.stringify({ error: storageError.message }), {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
  }

  const { error: deleteError } = await supabase
    .from("site_draft_images")
    .delete()
    .eq("draft_id", draftId);

  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }

  return new Response(
    JSON.stringify({
      deletedCount: paths.length
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" }
    }
  );
});
