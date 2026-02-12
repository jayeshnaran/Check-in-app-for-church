import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { WS_EVENTS } from "@shared/schema";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";

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

  app.get(api.families.list.path, isAuthenticated, async (req, res) => {
    const { serviceDate, serviceTime } = req.query;
    const allFamilies = await storage.getFamilies();
    
    if (serviceDate && serviceTime) {
      const filtered = allFamilies.filter(f => 
        f.serviceDate === serviceDate && f.serviceTime === serviceTime
      );
      return res.json(filtered);
    }
    
    res.json(allFamilies);
  });

  app.post(api.families.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.families.create.input.parse(req.body);
      const family = await storage.createFamily(input);
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

  app.put(api.families.update.path, isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    try {
      const input = api.families.update.input.parse(req.body);
      const updated = await storage.updateFamily(id, input);
      if (!updated) return res.status(404).json({ message: "Family not found" });
      
      if (input.status) {
        const familyWithPeople = (await storage.getFamilies()).find(f => f.id === id);
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

  app.delete(api.families.delete.path, isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    await storage.deleteFamily(id);
    res.status(204).end();
  });

  app.post(api.people.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.people.create.input.parse(req.body);
      const person = await storage.createPerson(input);
      res.status(201).json(person);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.put(api.people.update.path, isAuthenticated, async (req, res) => {
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

  app.delete(api.people.delete.path, isAuthenticated, async (req, res) => {
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
