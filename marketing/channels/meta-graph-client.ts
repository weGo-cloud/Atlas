/**
 * Mission 031, Section 7/8/9 — the one place that actually speaks to
 * graph.facebook.com. Both MetaChannelProvider (Page feed posts) and
 * WhatsAppChannelProvider (Business Cloud API messages) are Meta
 * Graph API products under the hood, so this is the shared HTTP/auth
 * helper that keeps their two provider classes from each
 * reimplementing request signing, error-shape parsing, and the
 * never-log-the-token discipline separately.
 */
const GRAPH_API_VERSION = "v19.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class MetaGraphApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "MetaGraphApiError";
  }
}

/**
 * POSTs to a Graph API node with a page/system-user access token.
 * Never logs `accessToken` or the raw response body (which can echo
 * request parameters back, including the token in some Graph error
 * payloads) — only a status code and Graph's own `error.message`
 * (already dealer-safe wording Meta itself provides) ever leave this
 * function.
 */
/**
 * POSTs to a Graph API node with a page/system-user access token, as
 * a form-encoded body with `access_token` as a parameter — the
 * classic Graph API convention used by Page feed posts. Never logs
 * `accessToken` or the raw response body (which can echo request
 * parameters back, including the token in some Graph error payloads)
 * — only a status code and Graph's own `error.message` (already
 * dealer-safe wording Meta itself provides) ever leave this function.
 */
export async function graphApiPost(
  path: string,
  accessToken: string,
  params: Record<string, string>
): Promise<{ id?: string }> {
  const url = `${GRAPH_API_BASE}/${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, access_token: accessToken }).toString(),
    });
  } catch {
    throw new MetaGraphApiError("Could not reach Meta. Please try again.", 0);
  }

  return parseGraphApiResponse(response);
}

/**
 * POSTs a JSON body with `Authorization: Bearer` auth — the WhatsApp
 * Business Cloud API's convention (distinct from the classic Graph
 * API's form-encoded, query-param-token style `graphApiPost` above
 * uses for Page feed posts). Same never-log-the-token and
 * safe-error-message discipline; this is the one other shape the
 * Graph API family actually needs, not a second bespoke client.
 */
export async function graphApiJsonPost(
  path: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<{ id?: string }> {
  const url = `${GRAPH_API_BASE}/${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new MetaGraphApiError("Could not reach Meta. Please try again.", 0);
  }

  const parsed = await parseGraphApiResponse(response);
  // The WhatsApp send-message endpoint returns
  // `{ messages: [{ id }] }` rather than the classic `{ id }` shape —
  // normalize it here so both provider classes see the same `{ id }` result.
  if (!parsed.id) {
    const whatsappBody = parsed as unknown as { messages?: Array<{ id?: string }> };
    return { id: whatsappBody.messages?.[0]?.id };
  }
  return parsed;
}

async function parseGraphApiResponse(response: Response): Promise<{ id?: string }> {
  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new MetaGraphApiError(body.error?.message ?? "Meta rejected the request.", response.status);
  }

  return body;
}
