import crypto from "crypto";
import { storage } from "./storage";
import type { Church } from "@shared/schema";

const PCO_AUTH_URL = "https://api.planningcenteronline.com/oauth/authorize";
const PCO_TOKEN_URL = "https://api.planningcenteronline.com/oauth/token";
const PCO_API_BASE = "https://api.planningcenteronline.com/people/v2";

function getPcoConfig() {
  const clientId = process.env.PCO_CLIENT_ID;
  const clientSecret = process.env.PCO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

export function isPcoConfigured(): boolean {
  return getPcoConfig() !== null;
}

export function generateOAuthState(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function getOAuthUrl(state: string, redirectUri: string): string | null {
  const config = getPcoConfig();
  if (!config) return null;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: "people check_ins",
    state,
  });

  return `${PCO_AUTH_URL}?${params}`;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  organizationId: string;
} | null> {
  const config = getPcoConfig();
  if (!config) return null;

  console.log("PCO token exchange: sending request to", PCO_TOKEN_URL);
  console.log("PCO token exchange: redirect_uri =", redirectUri);

  const formBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
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

export async function createOrUpdatePcoEmail(
  token: string,
  pcoPersonId: string,
  email: string
): Promise<boolean> {
  const listRes = await fetch(`${PCO_API_BASE}/people/${pcoPersonId}/emails`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (listRes.ok) {
    const listData = await listRes.json();
    const existing = (listData.data || []).find((e: any) => e.attributes.address === email);
    if (existing) return true;

    const primary = (listData.data || []).find((e: any) => e.attributes.primary);
    if (primary) {
      const patchRes = await fetch(`${PCO_API_BASE}/people/${pcoPersonId}/emails/${primary.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ data: { type: "Email", id: primary.id, attributes: { address: email } } }),
      });
      if (patchRes.ok) return true;
    }
  }

  const res = await fetch(`${PCO_API_BASE}/people/${pcoPersonId}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { type: "Email", attributes: { address: email, location: "Home", primary: true } } }),
  });

  if (!res.ok) {
    console.error(`PCO create email for person ${pcoPersonId} failed:`, await res.text());
    return false;
  }
  return true;
}

export async function createOrUpdatePcoPhone(
  token: string,
  pcoPersonId: string,
  number: string
): Promise<boolean> {
  const listRes = await fetch(`${PCO_API_BASE}/people/${pcoPersonId}/phone_numbers`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (listRes.ok) {
    const listData = await listRes.json();
    const existing = (listData.data || []).find((p: any) => p.attributes.number === number);
    if (existing) return true;

    const primary = (listData.data || []).find((p: any) => p.attributes.primary);
    if (primary) {
      const patchRes = await fetch(`${PCO_API_BASE}/people/${pcoPersonId}/phone_numbers/${primary.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ data: { type: "PhoneNumber", id: primary.id, attributes: { number } } }),
      });
      if (patchRes.ok) return true;
    }
  }

  const res = await fetch(`${PCO_API_BASE}/people/${pcoPersonId}/phone_numbers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { type: "PhoneNumber", attributes: { number, location: "Mobile", primary: true } } }),
  });

  if (!res.ok) {
    console.error(`PCO create phone for person ${pcoPersonId} failed:`, await res.text());
    return false;
  }
  return true;
}

export async function createPersonInPco(
  church: Church,
  person: {
    firstName?: string | null;
    lastName?: string | null;
    type: string;
    ageBracket?: string | null;
    phone?: string | null;
    email?: string | null;
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

  if (familyStatus && church.pcoFieldMembershipStatus) {
    const year = new Date().getFullYear();
    const statusLabel = familyStatus === "visitor" ? "Visitor" : "Newcomer";
    const statusValue = `${year} ${statusLabel}`;
    await setFieldDatum(token, pcoPersonId, church.pcoFieldMembershipStatus, statusValue);
  }

  if (person.ageBracket && church.pcoFieldAgeBracket) {
    await setFieldDatum(token, pcoPersonId, church.pcoFieldAgeBracket, person.ageBracket);
  }

  if (person.email) {
    await createOrUpdatePcoEmail(token, pcoPersonId, person.email);
  }

  if (person.phone) {
    await createOrUpdatePcoPhone(token, pcoPersonId, person.phone);
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
  primaryContactId: string,
  allPersonIds: string[]
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
          people: {
            data: allPersonIds.map(id => ({
              type: "Person",
              id,
            })),
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

async function addHouseholdMembership(
  token: string,
  householdId: string,
  personId: string,
  personType: string
): Promise<boolean> {
  const householdRole = (personType === "man" || personType === "woman")
    ? "parent_guardian"
    : "child";

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
          pending: false,
          household_role: householdRole,
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
    console.error(`PCO add household membership for person ${personId} failed:`, errText);
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
  phone?: string | null;
  email?: string | null;
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
  const createdPeople: Array<{ pcoId: string; type: string }> = [];
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
      createdPeople.push({ pcoId: result.id, type: person.type });
      results.push({ person, pcoId: result.id });

      if (!primaryContactId && (person.type === "man" || person.type === "woman")) {
        primaryContactId = result.id;
      }
    } else {
      failed++;
      results.push({ person, error: "API call failed" });
    }
  }

  if (createdPeople.length > 1 && familyName) {
    const contactId = primaryContactId || createdPeople[0].pcoId;
    const allIds = createdPeople.map(p => p.pcoId);
    const householdId = await createHousehold(token, familyName, contactId, allIds);
    if (householdId) {
      for (const cp of createdPeople) {
        await addHouseholdMembership(token, householdId, cp.pcoId, cp.type);
      }
    }
  }

  return { pushed, failed, results };
}

const PCO_CHECKINS_API = "https://api.planningcenteronline.com/check-ins/v2";

export interface PcoCheckinRecord {
  pcoPersonId: string;
  pcoCheckinId: string;
  firstName: string;
  lastName: string;
  gender: string | null;
  child: boolean;
  checkinDate: string;
  eventName: string | null;
}

export async function fetchCheckinsForEvent(
  church: Church,
  eventId: string,
  targetDate?: string
): Promise<PcoCheckinRecord[]> {
  const token = await getValidToken(church);
  if (!token) return [];

  // Step 1: Fetch all event periods for this event (paginated)
  const eventPeriods: Array<{ id: string; endsAt: string; date: string }> = [];
  let periodsUrl: string | null = `${PCO_CHECKINS_API}/events/${eventId}/event_periods?per_page=100`;

  while (periodsUrl) {
    const res: Response = await fetch(periodsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("PCO fetch event_periods failed:", errText);
      break;
    }

    const data: any = await res.json();
    for (const period of data.data || []) {
      const endsAt = period.attributes.ends_at || "";
      const date = endsAt.split("T")[0]; // e.g. "2026-02-15"
      eventPeriods.push({ id: period.id, endsAt, date });
    }

    periodsUrl = data.links?.next || null;
  }

  console.log(`Found ${eventPeriods.length} event periods for event ${eventId}`);

  // Step 2: Filter event periods by target date if provided
  let periodsToFetch = eventPeriods;
  if (targetDate) {
    periodsToFetch = eventPeriods.filter(ep => ep.date === targetDate);
    if (periodsToFetch.length === 0) {
      console.log(`No event period found for date ${targetDate}`);
      return [];
    }
  }

  // Step 3: For each event period, fetch check-ins (paginated)
  const allCheckins: PcoCheckinRecord[] = [];
  const seenPersonDates = new Set<string>();

  for (const period of periodsToFetch) {
    let checkinsUrl: string | null = `${PCO_CHECKINS_API}/events/${eventId}/event_periods/${period.id}/check_ins?per_page=100`;

    while (checkinsUrl) {
      const res: Response = await fetch(checkinsUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`PCO fetch check-ins for period ${period.id} failed:`, errText);
        break;
      }

      const data: any = await res.json();

      for (const checkin of data.data || []) {
        const personRel = checkin.relationships?.person?.data;
        if (!personRel) continue;

        const dedupeKey = `${personRel.id}-${period.date}`;
        if (seenPersonDates.has(dedupeKey)) continue;
        seenPersonDates.add(dedupeKey);

        allCheckins.push({
          pcoPersonId: personRel.id,
          pcoCheckinId: checkin.id,
          firstName: checkin.attributes.first_name || "",
          lastName: checkin.attributes.last_name || "",
          gender: null,
          child: checkin.attributes.kind === "Guest" ? false : false,
          checkinDate: period.date,
          eventName: null,
        });
      }

      checkinsUrl = data.links?.next || null;
    }
  }

  console.log(`Fetched ${allCheckins.length} check-ins total`);
  return allCheckins;
}

export async function fetchPersonFromPco(
  church: Church,
  pcoPersonId: string
): Promise<{
  firstName: string | null;
  lastName: string | null;
  gender: string | null;
  child: boolean | null;
  ageBracket: string | null;
  membershipStatus: string | null;
  phone: string | null;
  email: string | null;
} | null> {
  const token = await getValidToken(church);
  if (!token) return null;

  const personRes = await fetch(`${PCO_API_BASE}/people/${pcoPersonId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!personRes.ok) {
    console.error(`PCO fetch person ${pcoPersonId} failed:`, await personRes.text());
    return null;
  }

  const personData = await personRes.json();
  const attrs = personData.data?.attributes || {};

  const result: {
    firstName: string | null;
    lastName: string | null;
    gender: string | null;
    child: boolean | null;
    ageBracket: string | null;
    membershipStatus: string | null;
    phone: string | null;
    email: string | null;
  } = {
    firstName: attrs.first_name || null,
    lastName: attrs.last_name || null,
    gender: attrs.gender === "Female" ? "F" : attrs.gender === "Male" ? "M" : null,
    child: typeof attrs.child === "boolean" ? attrs.child : null,
    ageBracket: null,
    membershipStatus: null,
    phone: null,
    email: null,
  };

  const [fieldRes, emailsRes, phonesRes] = await Promise.all([
    fetch(`${PCO_API_BASE}/people/${pcoPersonId}/field_data`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`${PCO_API_BASE}/people/${pcoPersonId}/emails`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`${PCO_API_BASE}/people/${pcoPersonId}/phone_numbers`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);

  if (fieldRes.ok) {
    const fieldData = await fieldRes.json();
    for (const datum of fieldData.data || []) {
      const fdRel = datum.relationships?.field_definition?.data;
      if (!fdRel) continue;
      if (church.pcoFieldAgeBracket && fdRel.id === church.pcoFieldAgeBracket) {
        result.ageBracket = datum.attributes.value || null;
      }
      if (church.pcoFieldMembershipStatus && fdRel.id === church.pcoFieldMembershipStatus) {
        result.membershipStatus = datum.attributes.value || null;
      }
    }
  }

  if (emailsRes.ok) {
    const emailData = await emailsRes.json();
    const primary = (emailData.data || []).find((e: any) => e.attributes.primary) || (emailData.data || [])[0];
    if (primary) {
      result.email = primary.attributes.address || null;
    }
  }

  if (phonesRes.ok) {
    const phoneData = await phonesRes.json();
    const primary = (phoneData.data || []).find((p: any) => p.attributes.primary) || (phoneData.data || [])[0];
    if (primary) {
      result.phone = primary.attributes.number || null;
    }
  }

  return result;
}

export async function fetchPersonFieldData(
  church: Church,
  pcoPersonId: string,
  fieldDefinitionId: string
): Promise<string | null> {
  const token = await getValidToken(church);
  if (!token) return null;

  const res = await fetch(`${PCO_API_BASE}/people/${pcoPersonId}/field_data`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;

  const data = await res.json();
  for (const datum of data.data || []) {
    const fdRel = datum.relationships?.field_definition?.data;
    if (fdRel?.id === fieldDefinitionId) {
      return datum.attributes.value || null;
    }
  }
  return null;
}

export async function updatePersonInPco(
  church: Church,
  pcoPersonId: string,
  updates: {
    firstName?: string;
    lastName?: string;
    gender?: string;
    child?: boolean;
  }
): Promise<boolean> {
  const token = await getValidToken(church);
  if (!token) return false;

  const attributes: any = {};
  if (updates.firstName !== undefined) attributes.first_name = updates.firstName;
  if (updates.lastName !== undefined) attributes.last_name = updates.lastName;
  if (updates.gender !== undefined) attributes.gender = updates.gender;
  if (updates.child !== undefined) attributes.child = updates.child;

  const res = await fetch(`${PCO_API_BASE}/people/${pcoPersonId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        type: "Person",
        id: pcoPersonId,
        attributes,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`PCO update person ${pcoPersonId} failed:`, errText);
    return false;
  }
  return true;
}

export async function updateFieldDatum(
  church: Church,
  pcoPersonId: string,
  fieldDefinitionId: string,
  value: string
): Promise<boolean> {
  const token = await getValidToken(church);
  if (!token) return false;

  const listRes = await fetch(`${PCO_API_BASE}/people/${pcoPersonId}/field_data`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) return false;

  const listData = await listRes.json();
  let existingDatumId: string | null = null;
  for (const datum of listData.data || []) {
    const fdRel = datum.relationships?.field_definition?.data;
    if (fdRel?.id === fieldDefinitionId) {
      existingDatumId = datum.id;
      break;
    }
  }

  if (existingDatumId) {
    const patchRes = await fetch(`${PCO_API_BASE}/people/${pcoPersonId}/field_data/${existingDatumId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          type: "FieldDatum",
          id: existingDatumId,
          attributes: { value },
        },
      }),
    });
    if (!patchRes.ok) {
      console.error("PCO update field datum failed:", await patchRes.text());
      return false;
    }
    return true;
  } else {
    return setFieldDatum(token, pcoPersonId, fieldDefinitionId, value);
  }
}

export async function testPcoConnection(church: Church): Promise<boolean> {
  const token = await getValidToken(church);
  if (!token) return false;

  const res = await fetch(`${PCO_API_BASE}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return res.ok;
}
