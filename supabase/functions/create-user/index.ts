import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// Allowed browser origins for CORS are supplied at deploy time via the
// ALLOWED_ORIGINS environment variable (comma-separated exact origins).
// This keeps deployment-specific hostnames out of source control and lets
// the production origin be chosen/changed by platform/infra configuration.
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter((o) => o.length > 0);

function getCorsHeaders(origin: string | null): Record<string, string> | null {
  if (!origin) return null;
  if (ALLOWED_ORIGINS.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };
  }
  return null;
}

function jsonResponse(body: Record<string, unknown>, status: number, cors: Record<string, string> | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cors) Object.assign(headers, cors);
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    if (!cors) return new Response(null, { status: 403 });
    return new Response("ok", { headers: cors });
  }

  try {
    // 1. Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401, cors);
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create client with caller's JWT to verify identity
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: userError } = await callerClient.auth.getUser();
    if (userError || !callerUser) {
      return jsonResponse({ error: "Invalid token" }, 401, cors);
    }
    const callerUserId = callerUser.id;

    // 2. Check caller is admin
    const { data: roleCheck } = await callerClient.rpc("has_role", {
      _user_id: callerUserId,
      _role: "admin",
    });
    if (!roleCheck) {
      return jsonResponse({ error: "Forbidden: admin role required" }, 403, cors);
    }

    // 3. Parse and validate input
    const body = await req.json();
    const { email, password, full_name, role, branch_id, confirm_admin } = body;

    if (!email || !password || !full_name || !role) {
      return jsonResponse({ error: "Missing required fields: email, password, full_name, role" }, 400, cors);
    }
    if (!["admin", "data_manager", "sbc"].includes(role)) {
      return jsonResponse({ error: "Invalid role" }, 400, cors);
    }
    if (password.length < 8) {
      return jsonResponse({ error: "Password must be at least 8 characters" }, 400, cors);
    }
    if (full_name.length > 100 || email.length > 255) {
      return jsonResponse({ error: "Input too long" }, 400, cors);
    }

    // 3b. Admin-creates-admin requires explicit confirmation
    if (role === "admin" && confirm_admin !== true) {
      return jsonResponse({ error: "Creating an admin requires confirm_admin: true" }, 400, cors);
    }

    // 3c. Validate branch_id exists if provided
    if (branch_id) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: branchExists } = await adminClient
        .from("branches")
        .select("id")
        .eq("id", parseInt(branch_id, 10))
        .single();
      if (!branchExists) {
        return jsonResponse({ error: "Invalid branch_id" }, 400, cors);
      }
    }

    // 4. Create user with admin API (service role)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      // Log detailed error server-side; return generic message to the client
      // to avoid leaking schema details or enabling email enumeration.
      console.error("create-user: user creation failed", {
        message: createError.message,
        status: createError.status,
      });
      return jsonResponse({ error: "Unable to create user" }, 400, cors);
    }

    // 5. Assign role
    const { error: roleError } = await adminClient.from("user_roles").insert({
      user_id: newUser.user.id,
      role,
    });

    if (roleError) {
      // Rollback: delete the user if role assignment fails.
      // Log details server-side; return a generic message to the client.
      console.error("create-user: role assignment failed, rolling back", {
        message: roleError.message,
        user_id: newUser.user.id,
      });
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      return jsonResponse({ error: "Unable to complete user setup" }, 500, cors);
    }

    // 6. Update profile with branch if provided (with retry for trigger race)
    if (branch_id) {
      const branchInt = parseInt(branch_id, 10);
      let branchUpdated = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error: branchError } = await adminClient
          .from("profiles")
          .update({ branch_id: branchInt })
          .eq("id", newUser.user.id);
        if (!branchError) {
          branchUpdated = true;
          break;
        }
        if (attempt < 2) await new Promise(r => setTimeout(r, 500));
      }
      if (!branchUpdated) {
        console.error("Branch update failed after retries for user:", newUser.user.id);
      }
    }

    // 7. Server-side audit log
    await adminClient.from("audit_logs").insert({
      action: "create_user",
      entity_type: "user",
      entity_id: newUser.user.id,
      actor_user_id: callerUserId,
      payload: {
        email,
        role,
        branch_id: branch_id ?? null,
        created_by: callerUserId,
        elevated: role === "admin",
      },
    });

    return jsonResponse(
      { success: true, user_id: newUser.user.id, email, role },
      200,
      cors,
    );
  } catch (err) {
    console.error("create-user error:", err);
    return jsonResponse({ error: "Internal server error" }, 500, getCorsHeaders(req.headers.get("origin")));
  }
});
