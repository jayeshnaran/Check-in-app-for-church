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

  console.log("PCO token exchange: sending request to", PCO_TOKEN_URL);
  console.log("PCO token exchange: redirect_uri =", config.redirectUri);

  const formBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });

  const tokenRes = await fetch(PCO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody,
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("PCO token exchange failed (status " + tokenRes.status + "):", errText);
    return null;
  }

  const tokenData = await tokenRes.json();
  console.log("PCO token exchange succeeded, got access_token:", !!tokenData.access_token);

  const orgRes = await fetch(`${PCO_API_BASE}/`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  let organizationId = "";
  if (orgRes.ok) {
    const orgData = await orgRes.json();
    organizationId = orgData?.data?.id || orgData?.links?.organization || "";
  } else {
    console.error("PCO org fetch failed (status " + orgRes.status + "):", await orgRes.text());
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: church.pcoRefreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    console.error("PCO token refresh failed (status " + tokenRes.status + "):", await tokenRes.text());
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

const PCO_FIELD_DEF_STATUS = "781090";
const PCO_FIELD_DEF_AGE_BRACKET = "826722";

export async function createPersonInPco(
  church: Church,
  person: {
    firstName?: string | null;
    lastName?: string | null;
    type: string;
    ageBracket?: string | null;
  },
  familyStatus?: string | null
): Promise<{ id: string; firstName: string; lastName: string } | null> {
  const token = await getValidToken(church);
  if (!token) return null;

  const firstName = person.firstName || "Unknown";
  const lastName = person.lastName || "";
  const gender = (person.type === "man" || person.type === "boy") ? "M" : "F";
  const child = (person.type === "boy" || person.type === "girl");

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
          gender,
          child,
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
  const pcoPersonId = data.data.id;

  if (familyStatus) {
    const year = new Date().getFullYear();
    const statusLabel = familyStatus === "visitor" ? "Visitor" : "Newcomer";
    const statusValue = `${year} ${statusLabel}`;
    await setFieldDatum(token, pcoPersonId, PCO_FIELD_DEF_STATUS, statusValue);
  }

  if (person.ageBracket) {
    await setFieldDatum(token, pcoPersonId, PCO_FIELD_DEF_AGE_BRACKET, person.ageBracket);
  }

  return {
    id: pcoPersonId,
    firstName: data.data.attributes.first_name,
    lastName: data.data.attributes.last_name,
  };
}

async function setFieldDatum(
  token: string,
  personId: string,
  fieldDefinitionId: string,
  value: string
): Promise<boolean> {
  const res = await fetch(`${PCO_API_BASE}/people/${personId}/field_data`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        type: "FieldDatum",
        attributes: {
          value,
        },
        relationships: {
          field_definition: {
            data: {
              type: "FieldDefinition",
              id: fieldDefinitionId,
            },
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`PCO set field data failed (field ${fieldDefinitionId}, person ${personId}):`, errText);
    return false;
  }

  return true;
}

async function createHousehold(
  token: string,
  name: string,
  primaryContactId: string
): Promise<string | null> {
  const res = await fetch(`${PCO_API_BASE}/households`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        type: "Household",
        attributes: {
          name: `${name} Household`,
        },
        relationships: {
          primary_contact: {
            data: {
              type: "Person",
              id: primaryContactId,
            },
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("PCO create household failed:", errText);
    return null;
  }

  const data = await res.json();
  return data.data.id;
}

async function addPersonToHousehold(
  token: string,
  householdId: string,
  personId: string
): Promise<boolean> {
  const res = await fetch(`${PCO_API_BASE}/households/${householdId}/household_memberships`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        type: "HouseholdMembership",
        attributes: {
          person_name: "",
        },
        relationships: {
          person: {
            data: {
              type: "Person",
              id: personId,
            },
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`PCO add person ${personId} to household ${householdId} failed:`, errText);
    return false;
  }

  return true;
}

interface PcoPushPerson {
  firstName?: string | null;
  lastName?: string | null;
  type: string;
  ageBracket?: string | null;
  status?: string | null;
}

export async function pushFamilyToPco(
  church: Church,
  familyName: string,
  familyStatus: string | null,
  people: PcoPushPerson[]
): Promise<{ pushed: number; failed: number; results: any[] }> {
  const token = await getValidToken(church);
  if (!token) return { pushed: 0, failed: people.length, results: [{ error: "Could not get valid token" }] };

  let pushed = 0;
  let failed = 0;
  const results: any[] = [];
  const createdPcoIds: string[] = [];
  let primaryContactId: string | null = null;

  for (const person of people) {
    if (!person.firstName && !person.lastName) {
      failed++;
      results.push({ person, error: "No name provided" });
      continue;
    }

    const result = await createPersonInPco(church, person, familyStatus);
    if (result) {
      pushed++;
      createdPcoIds.push(result.id);
      results.push({ person, pcoId: result.id });

      if (!primaryContactId && (person.type === "man" || person.type === "woman")) {
        primaryContactId = result.id;
      }
    } else {
      failed++;
      results.push({ person, error: "API call failed" });
    }
  }

  if (createdPcoIds.length > 1 && familyName) {
    const contactId = primaryContactId || createdPcoIds[0];
    const householdId = await createHousehold(token, familyName, contactId);
    if (householdId) {
      for (const pcoId of createdPcoIds) {
        await addPersonToHousehold(token, householdId, pcoId);
      }
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
