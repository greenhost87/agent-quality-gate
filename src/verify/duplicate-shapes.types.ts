export interface DuplicateShapesConfig {
  tsconfig?: string;
  include?: string[];
  exclude?: string[];
  similarityThreshold?: number;
  minProperties?: number;
  allowNames?: string[];
  allowPairs?: [string, string][];
}

export interface ShapeDeclaration {
  kind: 'interface' | 'type';
  name: string;
  file: string;
  properties: string[];
}

export interface ShapeFinding {
  similarity: number;
  left: ShapeDeclaration;
  right: ShapeDeclaration;
  shared: string[];
}
