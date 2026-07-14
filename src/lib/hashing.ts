import { createHash } from "node:crypto";
import type {
  PluginDefinition,
  PluginListResponse,
  PluginSummary,
  VirtualContentNode,
} from "./types";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }

  return value;
}

export function deterministicHash(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value));
  return `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
}

function canonicalContent(node: VirtualContentNode): unknown {
  if (node.type !== "directory") {
    return node;
  }

  return {
    ...node,
    contents: Object.fromEntries(
      Object.entries(node.contents)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, child]) => [name, canonicalContent(child)]),
    ),
  };
}

export function pluginHash(plugin: PluginDefinition): string {
  return deterministicHash({
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    updatedAt: plugin.updatedAt,
    skillDirectories: [...plugin.skillDirectories]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((directory) => ({
        id: directory.id,
        name: directory.name,
        description: directory.description,
        updatedAt: directory.updatedAt,
        content: canonicalContent(directory),
      })),
  });
}

export function summarizePlugin(plugin: PluginDefinition): PluginSummary {
  return {
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    updatedAt: plugin.updatedAt,
    skillDirectories: [...plugin.skillDirectories]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ id, name, description, updatedAt }) => ({
        id,
        name,
        description,
        updatedAt,
      })),
  };
}

export function buildPluginList(
  plugins: PluginDefinition[],
): PluginListResponse {
  return {
    plugins: [...plugins]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(summarizePlugin),
  };
}
