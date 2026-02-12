import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { api, buildUrl } from "@shared/routes";
import { type Family, type Person, type CreateFamilyRequest, type UpdateFamilyRequest, type CreatePersonRequest, type UpdatePersonRequest } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { startMutation, endMutation } from "@/lib/mutation-tracker";

export interface SessionContext {
  date: string;
  time: string;
}

export const ServiceSessionContext = createContext<SessionContext | null>(null);

function useSessionQueryKey() {
  const session = useContext(ServiceSessionContext);
  return [api.families.list.path, session?.date, session?.time];
}

export function useFamilies(serviceDate?: string, serviceTime?: string) {
  const params = serviceDate && serviceTime 
    ? `?serviceDate=${encodeURIComponent(serviceDate)}&serviceTime=${encodeURIComponent(serviceTime)}`
    : '';
  return useQuery<(Family & { people: Person[] })[]>({
    queryKey: [api.families.list.path, serviceDate, serviceTime],
    queryFn: async () => {
      const res = await fetch(`${api.families.list.path}${params}`);
      if (!res.ok) throw new Error('Failed to fetch families');
      return res.json();
    },
    enabled: !!serviceDate && !!serviceTime,
  });
}

export function useCreateFamily() {
  const queryClient = useQueryClient();
  const key = useSessionQueryKey();
  return useMutation({
    mutationFn: async (family: CreateFamilyRequest) => {
      const res = await apiRequest("POST", api.families.create.path, family);
      return res.json();
    },
    onMutate: async (newFamily) => {
      startMutation();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);
      
      const tempId = -Date.now();
      const tempPersonId = tempId - 1;
      const optimisticFamily = {
        id: tempId,
        ...newFamily,
        status: newFamily.status || 'newcomer',
        createdAt: new Date().toISOString(),
        people: [{
          id: tempPersonId,
          familyId: tempId,
          type: 'man',
          status: newFamily.status || 'newcomer',
          firstName: null,
          lastName: null,
          ageBracket: null,
          createdAt: new Date().toISOString(),
        }]
      };

      queryClient.setQueryData(key, (old: any) => [optimisticFamily, ...(old || [])]);
      return { previous, tempId };
    },
    onError: (_err, _newFamily, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSuccess: (data, _variables, context) => {
      queryClient.setQueryData(key, (old: any) => 
        old?.map((f: any) => f.id === context?.tempId ? { ...data, people: f.people || [] } : f)
      );
    },
    onSettled: () => {
      endMutation();
    },
  });
}

export function useUpdateFamily() {
  const queryClient = useQueryClient();
  const key = useSessionQueryKey();
  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateFamilyRequest & { id: number }) => {
      const res = await apiRequest("PUT", buildUrl(api.families.update.path, { id }), updates);
      return res.json();
    },
    onMutate: async (updates) => {
      startMutation();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);

      queryClient.setQueryData(key, (old: any) => 
        old?.map((f: any) => {
          if (f.id === updates.id) {
            const updatedFamily = { ...f, ...updates };
            if (updates.status) {
              updatedFamily.people = f.people.map((p: any) => ({ ...p, status: updates.status }));
            }
            return updatedFamily;
          }
          return f;
        })
      );
      return { previous };
    },
    onError: (_err, _updates, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => {
      endMutation();
    },
  });
}

export function useDeleteFamily() {
  const queryClient = useQueryClient();
  const key = useSessionQueryKey();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", buildUrl(api.families.delete.path, { id }));
    },
    onMutate: async (id) => {
      startMutation();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);
      queryClient.setQueryData(key, (old: any) => old?.filter((f: any) => f.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => {
      endMutation();
    },
  });
}

export function useCreatePerson() {
  const queryClient = useQueryClient();
  const key = useSessionQueryKey();
  return useMutation({
    mutationFn: async (person: CreatePersonRequest) => {
      const res = await apiRequest("POST", api.people.create.path, person);
      return res.json();
    },
    onMutate: async (newPerson) => {
      startMutation();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);

      const tempId = -Date.now();
      const optimisticPerson = {
        id: tempId,
        ...newPerson,
        status: newPerson.status || 'newcomer',
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData(key, (old: any) => 
        old?.map((f: any) => f.id === newPerson.familyId ? { ...f, people: [...f.people, optimisticPerson] } : f)
      );
      return { previous, tempId };
    },
    onError: (_err, _newPerson, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSuccess: (data, _variables, context) => {
      queryClient.setQueryData(key, (old: any) => 
        old?.map((f: any) => ({
          ...f,
          people: f.people.map((p: any) => p.id === context?.tempId ? { ...data } : p)
        }))
      );
    },
    onSettled: () => {
      endMutation();
    },
  });
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();
  const key = useSessionQueryKey();
  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdatePersonRequest & { id: number }) => {
      const res = await apiRequest("PUT", buildUrl(api.people.update.path, { id }), updates);
      return res.json();
    },
    onMutate: async (updates) => {
      startMutation();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);

      queryClient.setQueryData(key, (old: any) => 
        old?.map((f: any) => ({
          ...f,
          people: f.people.map((p: any) => p.id === updates.id ? { ...p, ...updates } : p)
        }))
      );
      return { previous };
    },
    onError: (_err, _updates, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => {
      endMutation();
    },
  });
}

export function useDeletePerson() {
  const queryClient = useQueryClient();
  const key = useSessionQueryKey();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", buildUrl(api.people.delete.path, { id }));
    },
    onMutate: async (id) => {
      startMutation();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);

      queryClient.setQueryData(key, (old: any) => 
        old?.map((f: any) => ({
          ...f,
          people: f.people.filter((p: any) => p.id !== id)
        }))
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => {
      endMutation();
    },
  });
}
