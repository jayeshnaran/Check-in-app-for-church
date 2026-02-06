import { pgTable, text, serial, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === TABLE DEFINITIONS ===

export const families = pgTable("families", {
  id: serial("id").primaryKey(),
  name: text("name"), // Can be auto-generated or explicitly set
  isVisitor: boolean("is_visitor").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull(), // Foreign key to families
  type: text("type").notNull(), // 'man', 'woman', 'boy', 'girl'
  firstName: text("first_name"),
  lastName: text("last_name"),
  ageBracket: text("age_bracket"), // e.g., '0-2', '3-5', 'K-5'
  isVisitor: boolean("is_visitor").default(false),
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
  UPDATE: 'update', // Generic update signal to refetch
} as const;

export interface WsMessage {
  type: keyof typeof WS_EVENTS;
  payload?: any;
}
