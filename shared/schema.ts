import { pgTable, text, serial, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === TABLE DEFINITIONS ===

export const families = pgTable("families", {
  id: serial("id").primaryKey(),
  name: text("name"), 
  status: text("status").default("newcomer"), // 'newcomer' or 'visitor'
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull(), 
  type: text("type").notNull(), // 'man', 'woman', 'boy', 'girl'
  firstName: text("first_name"),
  lastName: text("last_name"),
  ageBracket: text("age_bracket"), 
  status: text("status").default("newcomer"), // 'newcomer' or 'visitor'
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===

export const familiesRelations = relations(families, ({ many }) => ({
  people: many(people),
}));

export const peopleRelations = relations(people, ({ one }) => ({
  family: one(families, {
    fields: [people.familyId],
    references: [families.id],
  }),
}));

// === SCHEMAS ===

export const insertFamilySchema = createInsertSchema(families).omit({ id: true, createdAt: true });
export const insertPersonSchema = createInsertSchema(people).omit({ id: true, createdAt: true });

// === TYPES ===

export type Family = typeof families.$inferSelect;
export type InsertFamily = z.infer<typeof insertFamilySchema>;

export type Person = typeof people.$inferSelect;
export type InsertPerson = z.infer<typeof insertPersonSchema>;

// Request Types
export type CreateFamilyRequest = InsertFamily;
export type UpdateFamilyRequest = Partial<InsertFamily>;

export type CreatePersonRequest = InsertPerson;
export type UpdatePersonRequest = Partial<InsertPerson>;

// WebSocket Events
export const WS_EVENTS = {
  UPDATE: 'update',
} as const;

export interface WsMessage {
  type: keyof typeof WS_EVENTS;
  payload?: any;
}
