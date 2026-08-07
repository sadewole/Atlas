export interface ServiceGeneratorSchema {
  name: string;
  port?: number;
  needsDatabase?: boolean;
  tags?: string;
}
