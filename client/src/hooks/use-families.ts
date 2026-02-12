import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { api, buildUrl } from "@shared/routes";
import { type Family, type Person, type CreateFamilyRequest, type UpdateFamilyRequest, type CreatePersonRequest, type UpdatePersonRequest } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

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
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);
      
      const tempId = Math.random();
      const optimisticFamily = {
        id: tempId,
        ...newFamily,
        status: newFamily.status || 'newcomer',
        createdAt: new Date().toISOString(),
        people: []
      };

      queryClient.setQueryData(key, (old: any) => [optimisticFamily, ...(old || [])]);
      return { previous, tempId };
    },
    onError: (err, newFamily, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData(key, (old: any) => 
        old?.map((f: any) => f.id === context?.tempId ? { ...f, id: data.id } : f)
      );
    },
    onSettled: () => {
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
    onError: (err, updates, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => {
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
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);
      queryClient.setQueryData(key, (old: any) => old?.filter((f: any) => f.id !== id));
      return { previous };
    },
    onError: (err, id, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
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
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);

      const tempId = Math.random();
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
    onError: (err, newPerson, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData(key, (old: any) => 
        old?.map((f: any) => ({
          ...f,
          people: f.people.map((p: any) => p.id === context?.tempId ? { ...p, id: data.id } : p)
        }))
      );
    },
    onSettled: () => {
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
    onError: (err, updates, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => {
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
    onError: (err, id, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
