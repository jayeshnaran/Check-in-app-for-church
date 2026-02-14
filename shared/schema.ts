import { pgTable, text, serial, boolean, timestamp, integer, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

export * from "./models/auth";

// === TABLE DEFINITIONS ===

export const churches = pgTable("churches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  pcoOrganizationId: text("pco_organization_id"),
  pcoAccessToken: text("pco_access_token"),
  pcoRefreshToken: text("pco_refresh_token"),
  pcoTokenExpiresAt: timestamp("pco_token_expires_at"),
  pcoConnectedAt: timestamp("pco_connected_at"),
  pcoFieldMembershipStatus: text("pco_field_membership_status"),
  pcoFieldAgeBracket: text("pco_field_age_bracket"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const churchMembers = pgTable("church_members", {
  id: serial("id").primaryKey(),
  churchId: integer("church_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const families = pgTable("families", {
  id: serial("id").primaryKey(),
  churchId: integer("church_id"),
  name: text("name"), 
  status: text("status").default("newcomer"),
  notes: text("notes"),
  serviceDate: text("service_date"),
  serviceTime: text("service_time"),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull(), 
  type: text("type").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  ageBracket: text("age_bracket"), 
  status: text("status").default("newcomer"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===

export const churchesRelations = relations(churches, ({ many }) => ({
  members: many(churchMembers),
  families: many(families),
}));

export const churchMembersRelations = relations(churchMembers, ({ one }) => ({
  church: one(churches, {
    fields: [churchMembers.churchId],
    references: [churches.id],
  }),
}));

export const familiesRelations = relations(families, ({ many, one }) => ({
  people: many(people),
  church: one(churches, {
    fields: [families.churchId],
    references: [churches.id],
  }),
}));

export const peopleRelations = relations(people, ({ one }) => ({
  family: one(families, {
    fields: [people.familyId],
    references: [families.id],
  }),
}));

// === SCHEMAS ===

export const insertChurchSchema = createInsertSchema(churches).omit({ id: true, createdAt: true });
export const insertChurchMemberSchema = createInsertSchema(churchMembers).omit({ id: true, createdAt: true });
export const insertFamilySchema = createInsertSchema(families).omit({ id: true, createdAt: true });
export const insertPersonSchema = createInsertSchema(people).omit({ id: true, createdAt: true });

// === TYPES ===

export type Church = typeof churches.$inferSelect;
export type InsertChurch = z.infer<typeof insertChurchSchema>;

export type ChurchMember = typeof churchMembers.$inferSelect;
export type InsertChurchMember = z.infer<typeof insertChurchMemberSchema>;

export type Family = typeof families.$inferSelect;
export type InsertFamily = z.infer<typeof insertFamilySchema>;

export type Person = typeof people.$inferSelect;
export type InsertPerson = z.infer<typeof insertPersonSchema>;

// Request Types
export type CreateFamilyRequest = InsertFamily;
export type UpdateFamilyRequest = Partial<InsertFamily>;

export type CreatePersonRequest = InsertPerson;
export type UpdatePersonRequest = Partial<InsertPerson>;

