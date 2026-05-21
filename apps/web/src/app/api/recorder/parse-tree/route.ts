import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { z } from "zod";
import {
  isDomSnapshotPayload,
  MAX_PARSED_DOM_ELEMENTS,
  parseDomSnapshotPayloadDetailed,
} from "@/lib/dom-parser";
import { parseViewTreeJson } from "@/lib/parse-view-tree-json";
import { parseViewTreePayload } from "@/lib/view-tree-parser";

const parseBodySchema = z.object({
  viewTreeJson: z.string().min(2).max(2_000_000),
});

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const json: unknown = await req.json().catch(() => null);
  const parsed = parseBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = parseViewTreeJson(parsed.data.viewTreeJson);
  } catch {
    return NextResponse.json(
      {
        error:
          "DOM snapshot is not valid JSON. Capture again from the browser, or paste only the JSON object (starts with {).",
      },
      { status: 400 },
    );
  }

  if (isDomSnapshotPayload(payload)) {
    const result = parseDomSnapshotPayloadDetailed(payload);
    if (result.elements.length === 0) {
      return NextResponse.json(
        {
          error:
            "No interactive DOM elements found. Navigate to a page with buttons or links, then capture again.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({
      elements: result.elements,
      totalMatched: result.totalMatched,
      truncated: result.truncated,
      maxElements: MAX_PARSED_DOM_ELEMENTS,
    });
  }

  const elements = parseViewTreePayload(payload);
  if (elements.length === 0) {
    return NextResponse.json(
      {
        error:
          "No accessibility nodes found. For web projects use the browser capture flow; do not paste environment config JSON here.",
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ elements, totalMatched: elements.length, truncated: false });
}
