import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type Family, type Person, type CreateFamilyRequest, type UpdateFamilyRequest, type CreatePersonRequest, type UpdatePersonRequest } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export function useFamilies() {
  return useQuery<(Family & { people: Person[] })[]>({
    queryKey: [api.families.list.path],
  });
}

export function useCreateFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (family: CreateFamilyRequest) => {
      const res = await apiRequest("POST", api.families.create.path, family);
      return res.json();
    },
    onMutate: async (newFamily) => {
      await queryClient.cancelQueries({ queryKey: [api.families.list.path] });
      const previous = queryClient.getQueryData<any[]>([api.families.list.path]);
      
      const optimisticFamily = {
        id: Math.random(),
        ...newFamily,
        status: newFamily.status || 'newcomer',
        createdAt: new Date().toISOString(),
        people: []
      };

      queryClient.setQueryData([api.families.list.path], (old: any) => [optimisticFamily, ...(old || [])]);
      return { previous };
    },
    onError: (err, newFamily, context) => {
      queryClient.setQueryData([api.families.list.path], context?.previous);
    },
    onSettled: () => {
      // Don't invalidate if we're in the middle of other mutations
    },
  });
}

export function useUpdateFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateFamilyRequest & { id: number }) => {
      const res = await apiRequest("PUT", buildUrl(api.families.update.path, { id }), updates);
      return res.json();
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: [api.families.list.path] });
      const previous = queryClient.getQueryData<any[]>([api.families.list.path]);

      queryClient.setQueryData([api.families.list.path], (old: any) => 
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
      queryClient.setQueryData([api.families.list.path], context?.previous);
    },
    onSettled: () => {
      // No automatic refetch to prevent lag during rapid edits
    },
  });
}

export function useDeleteFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", buildUrl(api.families.delete.path, { id }));
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [api.families.list.path] });
      const previous = queryClient.getQueryData<any[]>([api.families.list.path]);
      queryClient.setQueryData([api.families.list.path], (old: any) => old?.filter((f: any) => f.id !== id));
      return { previous };
    },
    onError: (err, id, context) => {
      queryClient.setQueryData([api.families.list.path], context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [api.families.list.path] });
    },
  });
}

export function useCreatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (person: CreatePersonRequest) => {
      const res = await apiRequest("POST", api.people.create.path, person);
      return res.json();
    },
    onMutate: async (newPerson) => {
      await queryClient.cancelQueries({ queryKey: [api.families.list.path] });
      const previous = queryClient.getQueryData<any[]>([api.families.list.path]);

      const optimisticPerson = {
        id: Math.random(),
        ...newPerson,
        status: newPerson.status || 'newcomer',
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData([api.families.list.path], (old: any) => 
        old?.map((f: any) => f.id === newPerson.familyId ? { ...f, people: [...f.people, optimisticPerson] } : f)
      );
      return { previous };
    },
    onError: (err, newPerson, context) => {
      queryClient.setQueryData([api.families.list.path], context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [api.families.list.path] });
    },
  });
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdatePersonRequest & { id: number }) => {
      const res = await apiRequest("PUT", buildUrl(api.people.update.path, { id }), updates);
      return res.json();
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: [api.families.list.path] });
      const previous = queryClient.getQueryData<any[]>([api.families.list.path]);

      queryClient.setQueryData([api.families.list.path], (old: any) => 
        old?.map((f: any) => ({
          ...f,
          people: f.people.map((p: any) => p.id === updates.id ? { ...p, ...updates } : p)
        }))
      );
      return { previous };
    },
    onError: (err, updates, context) => {
      queryClient.setQueryData([api.families.list.path], context?.previous);
    },
    onSettled: () => {
      // No automatic refetch
    },
  });
}

export function useDeletePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", buildUrl(api.people.delete.path, { id }));
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [api.families.list.path] });
      const previous = queryClient.getQueryData<any[]>([api.families.list.path]);

      queryClient.setQueryData([api.families.list.path], (old: any) => 
        old?.map((f: any) => ({
          ...f,
          people: f.people.filter((p: any) => p.id !== id)
        }))
      );
      return { previous };
    },
    onError: (err, id, context) => {
      queryClient.setQueryData([api.families.list.path], context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [api.families.list.path] });
    },
  });
}
