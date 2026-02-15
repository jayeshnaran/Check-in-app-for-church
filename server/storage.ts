import { db } from "./db";
import {
  families, people, churches, churchMembers, pcoCheckins,
  type Family, type InsertFamily, type UpdateFamilyRequest,
  type Person, type InsertPerson, type UpdatePersonRequest,
  type Church, type InsertChurch,
  type ChurchMember, type InsertChurchMember,
  type PcoCheckin, type InsertPcoCheckin
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, desc, asc, and, ilike, ne, or, sql } from "drizzle-orm";

export interface IStorage {
  // Churches
  createChurch(church: InsertChurch): Promise<Church>;
  getChurch(id: number): Promise<Church | undefined>;
  searchChurches(query: string): Promise<Church[]>;
  updateChurch(id: number, updates: Partial<Church>): Promise<Church>;

  // Church Members
  createChurchMember(member: InsertChurchMember): Promise<ChurchMember>;
  getUserMembership(userId: string): Promise<(ChurchMember & { church: Church }) | undefined>;
  getMember(id: number): Promise<ChurchMember | undefined>;
  getPendingMembers(churchId: number): Promise<ChurchMember[]>;
  getApprovedMembers(churchId: number): Promise<(ChurchMember & { userName: string; userEmail: string | null })[]>;
  updateMemberStatus(id: number, status: string): Promise<ChurchMember>;
  deleteMember(id: number): Promise<void>;

  // Families (scoped to church)
  getFamilies(churchId: number): Promise<(Family & { people: Person[] })[]>;
  getFamily(id: number): Promise<Family | undefined>;
  createFamily(family: InsertFamily): Promise<Family>;
  updateFamily(id: number, family: UpdateFamilyRequest): Promise<Family>;
  deleteFamily(id: number): Promise<void>;

  // People
  getPerson(id: number): Promise<Person | undefined>;
  createPerson(person: InsertPerson): Promise<Person>;
  updatePerson(id: number, person: UpdatePersonRequest): Promise<Person>;
  deletePerson(id: number): Promise<void>;
  searchAllPeople(churchId: number, query: string): Promise<(Person & { familyName: string | null; familyStatus: string | null; serviceDate: string | null })[]>;

  // PCO Checkins
  upsertPcoCheckins(churchId: number, records: InsertPcoCheckin[]): Promise<number>;
  getPcoCheckinsByDate(churchId: number, date: string): Promise<PcoCheckin[]>;
  getPcoCheckin(id: number): Promise<PcoCheckin | undefined>;
  updatePcoCheckin(id: number, updates: Partial<PcoCheckin>): Promise<PcoCheckin>;
  clearPcoCheckinsForYear(churchId: number, year: number): Promise<void>;
  clearPcoCheckinsForDate(churchId: number, date: string): Promise<void>;
  hasPcoCheckinForPerson(churchId: number, pcoPersonId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Churches
  async createChurch(church: InsertChurch): Promise<Church> {
    const [newChurch] = await db.insert(churches).values(church).returning();
    return newChurch;
  }

  async getChurch(id: number): Promise<Church | undefined> {
    const [church] = await db.select().from(churches).where(eq(churches.id, id));
    return church;
  }

  async searchChurches(query: string): Promise<Church[]> {
    if (!query || query.length < 2) return [];
    return db.select().from(churches).where(ilike(churches.name, `%${query}%`)).limit(10);
  }

  async updateChurch(id: number, updates: Partial<Church>): Promise<Church> {
    const [updated] = await db.update(churches).set(updates).where(eq(churches.id, id)).returning();
    return updated;
  }

  // Church Members
  async createChurchMember(member: InsertChurchMember): Promise<ChurchMember> {
    const [newMember] = await db.insert(churchMembers).values(member).returning();
    return newMember;
  }

  async getUserMembership(userId: string): Promise<(ChurchMember & { church: Church }) | undefined> {
    const members = await db.select().from(churchMembers).where(eq(churchMembers.userId, userId));
    const member = members.find(m => m.status === "approved") || members[0];
    if (!member) return undefined;
    const [church] = await db.select().from(churches).where(eq(churches.id, member.churchId));
    if (!church) return undefined;
    return { ...member, church };
  }

  async getMember(id: number): Promise<ChurchMember | undefined> {
    const [member] = await db.select().from(churchMembers).where(eq(churchMembers.id, id));
    return member;
  }

  async getPendingMembers(churchId: number): Promise<ChurchMember[]> {
    return db.select().from(churchMembers).where(
      and(eq(churchMembers.churchId, churchId), eq(churchMembers.status, "pending"))
    ).orderBy(asc(churchMembers.createdAt));
  }

  async getApprovedMembers(churchId: number): Promise<(ChurchMember & { userName: string; userEmail: string | null })[]> {
    const rows = await db
      .select({
        member: churchMembers,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(churchMembers)
      .leftJoin(users, eq(churchMembers.userId, users.id))
      .where(
        and(eq(churchMembers.churchId, churchId), eq(churchMembers.status, "approved"))
      )
      .orderBy(asc(churchMembers.createdAt));

    return rows.map((r) => ({
      ...r.member,
      userName: [r.firstName, r.lastName].filter(Boolean).join(" ") || `User #${r.member.userId.slice(0, 8)}`,
      userEmail: r.email,
    }));
  }

  async updateMemberStatus(id: number, status: string): Promise<ChurchMember> {
    const [updated] = await db.update(churchMembers).set({ status }).where(eq(churchMembers.id, id)).returning();
    return updated;
  }

  async deleteMember(id: number): Promise<void> {
    await db.delete(churchMembers).where(eq(churchMembers.id, id));
  }

  // Families (scoped to church)
  async getFamilies(churchId: number): Promise<(Family & { people: Person[] })[]> {
    const allFamilies = await db.select().from(families)
      .where(eq(families.churchId, churchId))
      .orderBy(desc(families.createdAt));
    const allPeople = await db.select().from(people).orderBy(asc(people.id));

    return allFamilies.map(family => ({
      ...family,
      people: allPeople.filter(p => p.familyId === family.id)
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
    await db.delete(people).where(eq(people.familyId, id));
    await db.delete(families).where(eq(families.id, id));
  }

  async getPerson(id: number): Promise<Person | undefined> {
    const [person] = await db.select().from(people).where(eq(people.id, id));
    return person;
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

  async searchAllPeople(churchId: number, query: string): Promise<(Person & { familyName: string | null; familyStatus: string | null; serviceDate: string | null })[]> {
    const searchLower = `%${query.toLowerCase()}%`;
    const rows = await db
      .select({
        person: people,
        familyName: families.name,
        familyStatus: families.status,
        serviceDate: families.serviceDate,
      })
      .from(people)
      .innerJoin(families, eq(people.familyId, families.id))
      .where(
        and(
          eq(families.churchId, churchId),
          or(
            ilike(people.firstName, searchLower),
            ilike(people.lastName, searchLower),
            ilike(sql`concat(${people.firstName}, ' ', ${people.lastName})`, searchLower)
          )
        )
      )
      .orderBy(asc(people.createdAt))
      .limit(50);

    return rows.map((r) => ({
      ...r.person,
      familyName: r.familyName,
      familyStatus: r.familyStatus,
      serviceDate: r.serviceDate,
    }));
  }

  // PCO Checkins
  async upsertPcoCheckins(churchId: number, records: InsertPcoCheckin[]): Promise<number> {
    if (records.length === 0) return 0;
    let inserted = 0;
    for (const record of records) {
      const existing = await db.select().from(pcoCheckins).where(
        and(
          eq(pcoCheckins.churchId, churchId),
          eq(pcoCheckins.pcoPersonId, record.pcoPersonId),
          eq(pcoCheckins.checkinDate, record.checkinDate)
        )
      ).limit(1);

      if (existing.length > 0) {
        await db.update(pcoCheckins).set({
          firstName: record.firstName,
          lastName: record.lastName,
          gender: record.gender,
          child: record.child,
          eventName: record.eventName,
          pcoCheckinId: record.pcoCheckinId,
          syncedAt: new Date(),
        }).where(eq(pcoCheckins.id, existing[0].id));
      } else {
        await db.insert(pcoCheckins).values({ ...record, churchId });
        inserted++;
      }
    }
    return inserted;
  }

  async getPcoCheckinsByDate(churchId: number, date: string): Promise<PcoCheckin[]> {
    return db.select().from(pcoCheckins).where(
      and(eq(pcoCheckins.churchId, churchId), eq(pcoCheckins.checkinDate, date))
    ).orderBy(asc(pcoCheckins.lastName), asc(pcoCheckins.firstName));
  }

  async getPcoCheckin(id: number): Promise<PcoCheckin | undefined> {
    const [checkin] = await db.select().from(pcoCheckins).where(eq(pcoCheckins.id, id));
    return checkin;
  }

  async updatePcoCheckin(id: number, updates: Partial<PcoCheckin>): Promise<PcoCheckin> {
    const [updated] = await db.update(pcoCheckins).set(updates).where(eq(pcoCheckins.id, id)).returning();
    return updated;
  }

  async clearPcoCheckinsForYear(churchId: number, year: number): Promise<void> {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    await db.delete(pcoCheckins).where(
      and(
        eq(pcoCheckins.churchId, churchId),
        sql`${pcoCheckins.checkinDate} >= ${yearStart}`,
        sql`${pcoCheckins.checkinDate} <= ${yearEnd}`
      )
    );
  }

  async clearPcoCheckinsForDate(churchId: number, date: string): Promise<void> {
    await db.delete(pcoCheckins).where(
      and(
        eq(pcoCheckins.churchId, churchId),
        eq(pcoCheckins.checkinDate, date)
      )
    );
  }

  async hasPcoCheckinForPerson(churchId: number, pcoPersonId: string): Promise<boolean> {
    const result = await db.select({ id: pcoCheckins.id })
      .from(pcoCheckins)
      .where(
        and(
          eq(pcoCheckins.churchId, churchId),
          eq(pcoCheckins.pcoPersonId, pcoPersonId)
        )
      )
      .limit(1);
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
