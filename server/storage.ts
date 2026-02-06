import { db } from "./db";
import {
  families, people,
  type Family, type InsertFamily, type UpdateFamilyRequest,
  type Person, type InsertPerson, type UpdatePersonRequest
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Families
  getFamilies(): Promise<(Family & { people: Person[] })[]>;
  getFamily(id: number): Promise<Family | undefined>;
  createFamily(family: InsertFamily): Promise<Family>;
  updateFamily(id: number, family: UpdateFamilyRequest): Promise<Family>;
  deleteFamily(id: number): Promise<void>;

  // People
  createPerson(person: InsertPerson): Promise<Person>;
  updatePerson(id: number, person: UpdatePersonRequest): Promise<Person>;
  deletePerson(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getFamilies(): Promise<(Family & { people: Person[] })[]> {
    const allFamilies = await db.select().from(families).orderBy(desc(families.createdAt));
    const allPeople = await db.select().from(people);

    // Join people to families
    return allFamilies.map(family => ({
      ...family,
      people: allPeople.filter(p => p.familyId === family.id).sort((a, b) => a.id - b.id)
    }));
  }

  async getFamily(id: number): Promise<Family | undefined> {
    const [family] = await db.select().from(families).where(eq(families.id, id));
    return family;
  }

  async createFamily(family: InsertFamily): Promise<Family> {
    const [newFamily] = await db.insert(families).values(family).returning();
    return newFamily;
  }

  async updateFamily(id: number, updates: UpdateFamilyRequest): Promise<Family> {
    const [updated] = await db.update(families)
      .set(updates)
      .where(eq(families.id, id))
      .returning();
    return updated;
  }

  async deleteFamily(id: number): Promise<void> {
    // Cascade delete people first (though DB FK might handle it if configured, manual is safer here without migration file editing)
    await db.delete(people).where(eq(people.familyId, id));
    await db.delete(families).where(eq(families.id, id));
  }

  async createPerson(person: InsertPerson): Promise<Person> {
    const [newPerson] = await db.insert(people).values(person).returning();
    return newPerson;
  }

  async updatePerson(id: number, updates: UpdatePersonRequest): Promise<Person> {
    const [updated] = await db.update(people)
      .set(updates)
      .where(eq(people.id, id))
      .returning();
    return updated;
  }

  async deletePerson(id: number): Promise<void> {
    await db.delete(people).where(eq(people.id, id));
  }
}

export const storage = new DatabaseStorage();
