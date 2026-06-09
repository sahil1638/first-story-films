import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";

const TABLES = ["services", "events", "deliverables", "agencies", "crew_members"] as const;
type TableName = (typeof TABLES)[number];

function isTableName(value: unknown): value is TableName {
  return typeof value === "string" && TABLES.includes(value as TableName);
}

function masterPath(table: TableName) {
  return `/masters/${table === "crew_members" ? "crew" : table}`;
}

async function syncServices(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: TableName,
  id: string,
  serviceIds: string[]
) {
  if (table === "agencies") {
    await supabase.from("agency_services").delete().eq("agency_id", id);
    if (serviceIds.length > 0) {
      await supabase.from("agency_services").insert(
        serviceIds.map((service_id) => ({ agency_id: id, service_id }))
      );
    }
  }

  if (table === "crew_members") {
    await supabase.from("crew_member_services").delete().eq("crew_member_id", id);
    if (serviceIds.length > 0) {
      await supabase.from("crew_member_services").insert(
        serviceIds.map((service_id) => ({ crew_member_id: id, service_id }))
      );
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireManagerOrAdminOrThrow();
    const body = await request.json();
    const table = body.table;

    if (!isTableName(table)) {
      return NextResponse.json({ error: "Invalid master table" }, { status: 400 });
    }

    const supabase = await createClient();
    const payload = (body.data ?? {}) as Record<string, unknown>;
    const serviceIds = Array.isArray(body.serviceIds) ? body.serviceIds.map(String) : [];
    const id = typeof body.id === "string" && body.id ? body.id : null;

    let itemId = id;
    if (id) {
      const { error } = await supabase.from(table).update(payload).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await supabase.from(table).insert(payload).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Save failed");
      itemId = data.id;
    }

    if (itemId) await syncServices(supabase, table, itemId, serviceIds);
    revalidatePath(masterPath(table));

    return NextResponse.json({ id: itemId, success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Save failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireManagerOrAdminOrThrow();
    const table = request.nextUrl.searchParams.get("table");
    const id = request.nextUrl.searchParams.get("id");

    if (!isTableName(table) || !id) {
      return NextResponse.json({ error: "Invalid delete request" }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath(masterPath(table));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 400 }
    );
  }
}
