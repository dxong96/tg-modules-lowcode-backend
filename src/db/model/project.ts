import {z} from "zod";
import {ObjectId} from "mongodb";

const nodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    label: z.string(),
    depth: z.number(),
    tgNodeType: z.string(),
    locals: z.record(z.string(), z.string()).optional(),
    inputs: z.record(z.string(), z.string()).optional(),
    files: z.array(
      z.object({ fileName: z.string(), fileId: z.string() })
    ).optional()
  }),
  parentId: z.string().optional(),
  extent: z.string().optional(),
  measured: z.object({ width: z.number(), height: z.number() }),
  width: z.number().optional(),
  height: z.number().optional()
});

const edgeSchema = z.object({
  markerEnd: z.object({ type: z.string() }).optional(),
  zIndex: z.number(),
  source: z.string(),
  sourceHandle: z.string().optional(),
  target: z.string(),
  targetHandle: z.string().optional(),
  id: z.string(),
  selected: z.boolean().optional(),
  data: z.object({
    dependencyName: z.string().optional(),
    enabled: z.boolean().optional()
  })
});

const viewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number()
});

export const saveStateSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
  viewport: viewportSchema.optional()
});

// export type MyNode = z.infer<typeof nodeSchema>;
// export type MyEdge = z.infer<typeof edgeSchema>;
// type Viewport = z.infer<typeof viewportSchema>;
export type SaveState = z.infer<typeof saveStateSchema>;

export interface Project {
  _id?: ObjectId;
  projectId: string;
  state: SaveState;
}