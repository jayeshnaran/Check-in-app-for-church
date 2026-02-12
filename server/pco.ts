import crypto from "crypto";
import { storage } from "./storage";
import type { Church } from "@shared/schema";

const PCO_AUTH_URL = "https://api.planningcenteronline.com/oauth/authorize";
const PCO_TOKEN_URL = "https://api.planningcenteronline.com/oauth/token";
const PCO_API_BASE = "https://api.planningcenteronline.com/people/v2";

function getPcoConfig() {
  const clientId = process.env.PCO_CLIENT_ID;
  const clientSecret = process.env.PCO_CLIENT_SECRET;
  const redirectUri = process.env.PCO_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}

export function isPcoConfigured(): boolean {
  return getPcoConfig() !== null;
}

export function generateOAuthState(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function getOAuthUrl(state: string): string | null {
  const config = getPcoConfig();
  if (!config) return null;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "people",
    state,
  });

  return `${PCO_AUTH_URL}?${params}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  organizationId: string;
} | null> {
  const config = getPcoConfig();
  if (!config) return null;

  const tokenRes = await fetch(PCO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("PCO token exchange failed:", errText);
    return null;
  }

  const tokenData = await tokenRes.json();

  const orgRes = await fetch(`${PCO_API_BASE}/`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  let organizationId = "";
  if (orgRes.ok) {
    const orgData = await orgRes.json();
    organizationId = orgData?.data?.id || orgData?.links?.organization || "";
  }

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresIn: tokenData.expires_in || 7200,
    organizationId,
  };
}

async function refreshTokenIfNeeded(church: Church): Promise<string | null> {
  const config = getPcoConfig();
  if (!config || !church.pcoAccessToken || !church.pcoRefreshToken) return null;

  const now = new Date();
  const expiresAt = church.pcoTokenExpiresAt ? new Date(church.pcoTokenExpiresAt) : null;

  if (expiresAt && now < new Date(expiresAt.getTime() - 5 * 60 * 1000)) {
    return church.pcoAccessToken;
  }

  const tokenRes = await fetch(PCO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: church.pcoRefreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    console.error("PCO token refresh failed:", await tokenRes.text());
    return null;
  }

  const data = await tokenRes.json();

  await storage.updateChurch(church.id, {
    pcoAccessToken: data.access_token,
    pcoRefreshToken: data.refresh_token,
    pcoTokenExpiresAt: new Date(Date.now() + (data.expires_in || 7200) * 1000),
  } as any);

  return data.access_token;
}

export async function getValidToken(church: Church): Promise<string | null> {
  return refreshTokenIfNeeded(church);
}

export async function createPersonInPco(
  church: Church,
  person: { firstName?: string | null; lastName?: string | null }
): Promise<{ id: string; firstName: string; lastName: string } | null> {
  const token = await getValidToken(church);
  if (!token) return null;

  const firstName = person.firstName || "Unknown";
  const lastName = person.lastName || "";

  const res = await fetch(`${PCO_API_BASE}/people`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        type: "Person",
        attributes: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("PCO create person failed:", errText);
    return null;
  }

  const data = await res.json();
  return {
    id: data.data.id,
    firstName: data.data.attributes.first_name,
    lastName: data.data.attributes.last_name,
  };
}

export async function pushFamilyToPco(
  church: Church,
  people: Array<{ firstName?: string | null; lastName?: string | null; type: string }>
): Promise<{ pushed: number; failed: number; results: any[] }> {
  let pushed = 0;
  let failed = 0;
  const results: any[] = [];

  for (const person of people) {
    if (!person.firstName && !person.lastName) {
      failed++;
      results.push({ person, error: "No name provided" });
      continue;
    }

    const result = await createPersonInPco(church, person);
    if (result) {
      pushed++;
      results.push({ person, pcoId: result.id });
    } else {
      failed++;
      results.push({ person, error: "API call failed" });
    }
  }

  return { pushed, failed, results };
}

export async function testPcoConnection(church: Church): Promise<boolean> {
  const token = await getValidToken(church);
  if (!token) return false;

  const res = await fetch(`${PCO_API_BASE}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return res.ok;
}
