import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { isPcoConfigured, generateOAuthState, getOAuthUrl, exchangeCodeForTokens, pushFamilyToPco, testPcoConnection } from "./pco";

async function getUserChurchId(req: any): Promise<number | null> {
  const userId = req.user?.claims?.sub;
  if (!userId) return null;
  const membership = await storage.getUserMembership(userId);
  if (!membership || membership.status !== "approved") return null;
  return membership.churchId;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  await setupAuth(app);
  registerAuthRoutes(app);

  // === CHURCH ROUTES ===

  app.get('/api/churches/search', isAuthenticated, async (req, res) => {
    const query = (req.query.q as string) || "";
    const results = await storage.searchChurches(query);
    res.json(results);
  });

  app.post('/api/churches', isAuthenticated, async (req: any, res) => {
    try {
      const { name, description } = req.body;
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ message: "Church name is required" });
      }
      const userId = req.user.claims.sub;

      const church = await storage.createChurch({ name: name.trim(), description });
      await storage.createChurchMember({
        churchId: church.id,
        userId,
        role: "admin",
        status: "approved",
      });
      res.status(201).json(church);
    } catch (err) {
      res.status(400).json({ message: "Failed to create church" });
    }
  });

  app.put('/api/churches/:id', isAuthenticated, async (req: any, res) => {
    const churchId = Number(req.params.id);
    const userId = req.user.claims.sub;
    const membership = await storage.getUserMembership(userId);
    if (!membership || membership.churchId !== churchId || membership.role !== "admin") {
      return res.status(403).json({ message: "Only admins can update church info" });
    }
    try {
      const { name, description, logoUrl } = req.body;
      const updated = await storage.updateChurch(churchId, { name, description, logoUrl });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: "Failed to update church" });
    }
  });

  // === MEMBERSHIP ROUTES ===

  app.get('/api/membership', isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const membership = await storage.getUserMembership(userId);
    res.json(membership || null);
  });

  app.post('/api/membership/join', isAuthenticated, async (req: any, res) => {
    try {
      const { churchId } = req.body;
      const userId = req.user.claims.sub;

      const existing = await storage.getUserMembership(userId);
      if (existing) {
        return res.status(400).json({ message: "You already have a church membership" });
      }

      const church = await storage.getChurch(churchId);
      if (!church) {
        return res.status(404).json({ message: "Church not found" });
      }

      const member = await storage.createChurchMember({
        churchId,
        userId,
        role: "member",
        status: "pending",
      });
      res.status(201).json(member);
    } catch (err) {
      res.status(400).json({ message: "Failed to request membership" });
    }
  });

  app.get('/api/membership/pending', isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const membership = await storage.getUserMembership(userId);
    if (!membership || membership.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const pending = await storage.getPendingMembers(membership.churchId);
    const { authStorage } = await import("./replit_integrations/auth");
    const enriched = await Promise.all(pending.map(async (m) => {
      const user = await authStorage.getUser(m.userId);
      return { ...m, userName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || m.userId.slice(0, 8) : m.userId.slice(0, 8) };
    }));
    res.json(enriched);
  });

  app.patch('/api/membership/:id/approve', isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const membership = await storage.getUserMembership(userId);
    if (!membership || membership.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const targetId = Number(req.params.id);
      const target = await storage.getMember(targetId);
      if (!target || target.churchId !== membership.churchId) {
        return res.status(404).json({ message: "Member not found" });
      }
      const updated = await storage.updateMemberStatus(targetId, "approved");
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: "Failed to approve member" });
    }
  });

  app.patch('/api/membership/:id/reject', isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const membership = await storage.getUserMembership(userId);
    if (!membership || membership.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const targetId = Number(req.params.id);
      const target = await storage.getMember(targetId);
      if (!target || target.churchId !== membership.churchId) {
        return res.status(404).json({ message: "Member not found" });
      }
      await storage.deleteMember(targetId);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ message: "Failed to reject member" });
    }
  });

  app.get('/api/membership/approved', isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const membership = await storage.getUserMembership(userId);
    if (!membership || membership.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const approved = await storage.getApprovedMembers(membership.churchId);
    res.json(approved);
  });

  app.delete('/api/membership/:id/revoke', isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const membership = await storage.getUserMembership(userId);
    if (!membership || membership.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const targetId = Number(req.params.id);
      const target = await storage.getMember(targetId);
      if (!target || target.churchId !== membership.churchId) {
        return res.status(404).json({ message: "Member not found" });
      }
      if (target.userId === userId) {
        return res.status(400).json({ message: "You cannot revoke your own access" });
      }
      await storage.deleteMember(targetId);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ message: "Failed to revoke member" });
    }
  });

  // === FAMILY ROUTES (church-scoped) ===

  app.get(api.families.list.path, isAuthenticated, async (req: any, res) => {
    const churchId = await getUserChurchId(req);
    if (!churchId) return res.status(403).json({ message: "No approved church membership" });

    const { serviceDate, serviceTime } = req.query;
    const allFamilies = await storage.getFamilies(churchId);
    
    if (serviceDate && serviceTime) {
      const filtered = allFamilies.filter(f => 
        f.serviceDate === serviceDate && f.serviceTime === serviceTime
      );
      return res.json(filtered);
    }
    
    res.json(allFamilies);
  });

  app.post(api.families.create.path, isAuthenticated, async (req: any, res) => {
    const churchId = await getUserChurchId(req);
    if (!churchId) return res.status(403).json({ message: "No approved church membership" });
    const userId = req.user?.claims?.sub;

    try {
      const input = api.families.create.input.parse(req.body);
      const family = await storage.createFamily({ ...input, churchId, updatedBy: userId });
      const defaultPerson = await storage.createPerson({
        familyId: family.id,
        type: 'man',
        status: input.status || 'newcomer',
      });
      res.status(201).json({ ...family, people: [defaultPerson] });
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.put(api.families.update.path, isAuthenticated, async (req: any, res) => {
    const churchId = await getUserChurchId(req);
    if (!churchId) return res.status(403).json({ message: "No approved church membership" });
    const userId = req.user?.claims?.sub;

    const id = Number(req.params.id);
    try {
      const family = await storage.getFamily(id);
      if (!family || family.churchId !== churchId) return res.status(404).json({ message: "Family not found" });

      const input = api.families.update.input.parse(req.body);
      const updated = await storage.updateFamily(id, { ...input, updatedAt: new Date(), updatedBy: userId });
      
      if (input.status) {
        const familyWithPeople = (await storage.getFamilies(churchId)).find(f => f.id === id);
        if (familyWithPeople) {
          for (const person of familyWithPeople.people) {
            await storage.updatePerson(person.id, { status: input.status });
          }
        }
      }

      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.families.delete.path, isAuthenticated, async (req: any, res) => {
    const churchId = await getUserChurchId(req);
    if (!churchId) return res.status(403).json({ message: "No approved church membership" });

    const id = Number(req.params.id);
    const family = await storage.getFamily(id);
    if (!family || family.churchId !== churchId) return res.status(404).json({ message: "Family not found" });

    await storage.deleteFamily(id);
    res.status(204).end();
  });

  // === PEOPLE ROUTES (church-scoped via family) ===

  app.post(api.people.create.path, isAuthenticated, async (req: any, res) => {
    const churchId = await getUserChurchId(req);
    if (!churchId) return res.status(403).json({ message: "No approved church membership" });
    const userId = req.user?.claims?.sub;

    try {
      const input = api.people.create.input.parse(req.body);
      const family = await storage.getFamily(input.familyId);
      if (!family || family.churchId !== churchId) return res.status(404).json({ message: "Family not found" });

      const person = await storage.createPerson(input);
      await storage.updateFamily(input.familyId, { updatedAt: new Date(), updatedBy: userId });
      res.status(201).json(person);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.put(api.people.update.path, isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const userId = req.user?.claims?.sub;
    try {
      const input = api.people.update.input.parse(req.body);
      const updated = await storage.updatePerson(id, input);
      if (!updated) return res.status(404).json({ message: "Person not found" });
      await storage.updateFamily(updated.familyId, { updatedAt: new Date(), updatedBy: userId });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.people.delete.path, isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const userId = req.user?.claims?.sub;
    const person = await storage.getPerson(id);
    if (person) {
      await storage.updateFamily(person.familyId, { updatedAt: new Date(), updatedBy: userId });
    }
    await storage.deletePerson(id);
    res.status(204).end();
  });

  // === PLANNING CENTER OAUTH ROUTES ===

  app.get('/api/pco/status', isAuthenticated, async (req: any, res) => {
    const churchId = await getUserChurchId(req);
    if (!churchId) return res.status(403).json({ message: "No approved church membership" });

    const church = await storage.getChurch(churchId);
    if (!church) return res.status(404).json({ message: "Church not found" });

    res.json({
      configured: isPcoConfigured(),
      connected: !!church.pcoAccessToken,
      organizationId: church.pcoOrganizationId || null,
      connectedAt: church.pcoConnectedAt || null,
    });
  });

  const pcoOAuthPending = new Map<string, { churchId: number; userId: string; createdAt: number }>();

  setInterval(() => {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const keys = Array.from(pcoOAuthPending.keys());
    for (const key of keys) {
      const val = pcoOAuthPending.get(key);
      if (val && val.createdAt < tenMinutesAgo) pcoOAuthPending.delete(key);
    }
  }, 60 * 1000);

  app.get('/auth/pco', isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const membership = await storage.getUserMembership(userId);
    if (!membership || membership.role !== "admin") {
      return res.status(403).send("Admin access required");
    }

    const state = generateOAuthState();
    pcoOAuthPending.set(state, {
      churchId: membership.churchId,
      userId,
      createdAt: Date.now(),
    });

    const url = getOAuthUrl(state);
    if (!url) {
      pcoOAuthPending.delete(state);
      return res.status(500).send("Planning Center is not configured. Set PCO_CLIENT_ID, PCO_CLIENT_SECRET, and PCO_REDIRECT_URI.");
    }

    res.redirect(url);
  });

  app.get('/auth/pco/callback', async (req: any, res) => {
    const { code, state } = req.query;
    console.log("PCO callback received - code:", !!code, "state:", !!state);

    if (!state || typeof state !== "string") {
      return res.redirect("/settings?pco=error");
    }

    const pending = pcoOAuthPending.get(state);
    if (!pending) {
      console.error("PCO callback: no pending OAuth state found for:", state);
      return res.redirect("/settings?pco=error");
    }

    pcoOAuthPending.delete(state);

    const { churchId, userId } = pending;
    console.log("PCO callback: matched state for churchId:", churchId, "userId:", userId);

    try {
      const tokens = await exchangeCodeForTokens(code as string);
      if (!tokens) {
        return res.redirect("/settings?pco=error");
      }

      await storage.updateChurch(churchId, {
        pcoOrganizationId: tokens.organizationId,
        pcoAccessToken: tokens.accessToken,
        pcoRefreshToken: tokens.refreshToken,
        pcoTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        pcoConnectedAt: new Date(),
      } as any);

      res.redirect("/settings?pco=connected");
    } catch (err) {
      console.error("PCO callback error:", err);
      res.redirect("/settings?pco=error");
    }
  });

  app.post('/api/pco/disconnect', isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const membership = await storage.getUserMembership(userId);
    if (!membership || membership.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    await storage.updateChurch(membership.churchId, {
      pcoOrganizationId: null,
      pcoAccessToken: null,
      pcoRefreshToken: null,
      pcoTokenExpiresAt: null,
      pcoConnectedAt: null,
    } as any);

    res.json({ ok: true });
  });

  app.post('/api/pco/test', isAuthenticated, async (req: any, res) => {
    const churchId = await getUserChurchId(req);
    if (!churchId) return res.status(403).json({ message: "No approved church membership" });

    const church = await storage.getChurch(churchId);
    if (!church || !church.pcoAccessToken) {
      return res.status(400).json({ message: "Planning Center not connected" });
    }

    const connected = await testPcoConnection(church);
    res.json({ connected });
  });

  app.post('/api/pco/push-family/:familyId', isAuthenticated, async (req: any, res) => {
    const churchId = await getUserChurchId(req);
    if (!churchId) return res.status(403).json({ message: "No approved church membership" });

    const familyId = Number(req.params.familyId);
    const family = await storage.getFamily(familyId);
    if (!family || family.churchId !== churchId) {
      return res.status(404).json({ message: "Family not found" });
    }

    const church = await storage.getChurch(churchId);
    if (!church || !church.pcoAccessToken) {
      return res.status(400).json({ message: "Planning Center not connected" });
    }

    const allFamilies = await storage.getFamilies(churchId);
    const familyWithPeople = allFamilies.find(f => f.id === familyId);
    if (!familyWithPeople) {
      return res.status(404).json({ message: "Family not found" });
    }

    const result = await pushFamilyToPco(
      church,
      familyWithPeople.name || "Unknown",
      familyWithPeople.status,
      familyWithPeople.people
    );
    res.json(result);
  });

  app.post('/api/pco/push-all', isAuthenticated, async (req: any, res) => {
    const churchId = await getUserChurchId(req);
    if (!churchId) return res.status(403).json({ message: "No approved church membership" });

    const church = await storage.getChurch(churchId);
    if (!church || !church.pcoAccessToken) {
      return res.status(400).json({ message: "Planning Center not connected" });
    }

    const { serviceDate, serviceTime } = req.body;
    const allFamilies = await storage.getFamilies(churchId);

    let familiesToPush = allFamilies;
    if (serviceDate && serviceTime) {
      familiesToPush = allFamilies.filter(
        f => f.serviceDate === serviceDate && f.serviceTime === serviceTime
      );
    }

    if (familiesToPush.length === 0) {
      return res.json({ pushed: 0, failed: 0, results: [], message: "No families to push" });
    }

    let totalPushed = 0;
    let totalFailed = 0;
    const allResults: any[] = [];

    for (const family of familiesToPush) {
      const namedPeople = family.people.filter(p => p.firstName || p.lastName);
      if (namedPeople.length === 0) continue;

      const result = await pushFamilyToPco(
        church,
        family.name || "Unknown",
        family.status,
        namedPeople
      );
      totalPushed += result.pushed;
      totalFailed += result.failed;
      allResults.push(...result.results);
    }

    res.json({ pushed: totalPushed, failed: totalFailed, results: allResults });
  });

  return httpServer;
}
