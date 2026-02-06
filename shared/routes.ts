import { z } from 'zod';
import { insertFamilySchema, insertPersonSchema, families, people } from './schema';

// Shared error schemas
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  families: {
    list: {
      method: 'GET' as const,
      path: '/api/families',
      responses: {
        200: z.array(z.custom<typeof families.$inferSelect & { people: typeof people.$inferSelect[] }>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/families',
      input: insertFamilySchema,
      responses: {
        201: z.custom<typeof families.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/families/:id',
      input: insertFamilySchema.partial(),
      responses: {
        200: z.custom<typeof families.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/families/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  people: {
    create: {
      method: 'POST' as const,
      path: '/api/people',
      input: insertPersonSchema,
      responses: {
        201: z.custom<typeof people.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/people/:id',
      input: insertPersonSchema.partial(),
      responses: {
        200: z.custom<typeof people.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/people/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
