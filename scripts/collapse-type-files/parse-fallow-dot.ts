type FallowDotEdge = {
  fromId: string;
  toId: string;
};

type FallowDotGraph = {
  labelsById: Map<string, string>;
  edges: FallowDotEdge[];
};

const NODE_LINE = /^\s*(n\d+)\s*\[\s*label="([^"]*)"(?:\s*,|\s*\])/u;
const EDGE_LINE = /^\s*(n\d+)\s*->\s*(n\d+)\s*;?\s*$/u;

export function parseFallowDot(source: string): FallowDotGraph {
  const labelsById = new Map<string, string>();
  const edges: FallowDotEdge[] = [];
  for (const line of source.split('\n')) {
    const node = NODE_LINE.exec(line);
    if (node !== null) {
      const nodeId = node[1];
      const label = node[2];
      if (nodeId !== undefined && label !== undefined) {
        labelsById.set(nodeId, label);
      }
      continue;
    }
    const edge = EDGE_LINE.exec(line);
    if (edge !== null) {
      const fromId = edge[1];
      const toId = edge[2];
      if (fromId !== undefined && toId !== undefined) {
        edges.push({ fromId, toId });
      }
    }
  }
  return { labelsById, edges };
}

export function importFanInByPath(graph: FallowDotGraph): Map<string, string[]> {
  const importersByPath = new Map<string, string[]>();
  for (const label of graph.labelsById.values()) {
    importersByPath.set(label, []);
  }
  for (const edge of graph.edges) {
    const imported = graph.labelsById.get(edge.toId);
    const importer = graph.labelsById.get(edge.fromId);
    if (imported === undefined || importer === undefined) {
      continue;
    }
    const importers = importersByPath.get(imported);
    if (importers === undefined) {
      importersByPath.set(imported, [importer]);
    } else {
      importers.push(importer);
    }
  }
  return importersByPath;
}
