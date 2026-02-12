import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { WS_EVENTS } from "@shared/schema";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";

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

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  function broadcast(type: string, payload?: any, exclude?: WebSocket) {
    const message = JSON.stringify({ type, payload });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client !== exclude) {
        client.send(message);
      }
    });
  }

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

    try {
      const input = api.families.create.input.parse(req.body);
      const family = await storage.createFamily({ ...input, churchId });
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

    const id = Number(req.params.id);
    try {
      const family = await storage.getFamily(id);
      if (!family || family.churchId !== churchId) return res.status(404).json({ message: "Family not found" });

      const input = api.families.update.input.parse(req.body);
      const updated = await storage.updateFamily(id, input);
      
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

    try {
      const input = api.people.create.input.parse(req.body);
      const family = await storage.getFamily(input.familyId);
      if (!family || family.churchId !== churchId) return res.status(404).json({ message: "Family not found" });

      const person = await storage.createPerson(input);
      res.status(201).json(person);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.put(api.people.update.path, isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    try {
      const input = api.people.update.input.parse(req.body);
      const updated = await storage.updatePerson(id, input);
      if (!updated) return res.status(404).json({ message: "Person not found" });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.people.delete.path, isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    await storage.deletePerson(id);
    res.status(204).end();
  });

  app.post('/api/sync', isAuthenticated, async (_req, res) => {
    broadcast(WS_EVENTS.UPDATE);
    res.json({ ok: true });
  });

  return httpServer;
}
