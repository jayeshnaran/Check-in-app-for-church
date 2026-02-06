import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { WS_EVENTS } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  function broadcast(type: string, payload?: any) {
    const message = JSON.stringify({ type, payload });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  app.get(api.families.list.path, async (req, res) => {
    const families = await storage.getFamilies();
    res.json(families);
  });

  app.post(api.families.create.path, async (req, res) => {
    try {
      const input = api.families.create.input.parse(req.body);
      const family = await storage.createFamily(input);
      broadcast(WS_EVENTS.UPDATE);
      res.status(201).json(family);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.put(api.families.update.path, async (req, res) => {
    const id = Number(req.params.id);
    try {
      const input = api.families.update.input.parse(req.body);
      const updated = await storage.updateFamily(id, input);
      if (!updated) return res.status(404).json({ message: "Family not found" });
      
      // If family status changed, update all people in that family
      if (input.status) {
        const familyWithPeople = (await storage.getFamilies()).find(f => f.id === id);
        if (familyWithPeople) {
          for (const person of familyWithPeople.people) {
            await storage.updatePerson(person.id, { status: input.status });
          }
        }
      }

      broadcast(WS_EVENTS.UPDATE);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.families.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    await storage.deleteFamily(id);
    broadcast(WS_EVENTS.UPDATE);
    res.status(204).end();
  });

  app.post(api.people.create.path, async (req, res) => {
    try {
      const input = api.people.create.input.parse(req.body);
      const person = await storage.createPerson(input);
      broadcast(WS_EVENTS.UPDATE);
      res.status(201).json(person);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.put(api.people.update.path, async (req, res) => {
    const id = Number(req.params.id);
    try {
      const input = api.people.update.input.parse(req.body);
      const updated = await storage.updatePerson(id, input);
      broadcast(WS_EVENTS.UPDATE);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.people.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    await storage.deletePerson(id);
    broadcast(WS_EVENTS.UPDATE);
    res.status(204).end();
  });

  return httpServer;
}
