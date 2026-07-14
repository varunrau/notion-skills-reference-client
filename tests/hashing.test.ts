import { describe, expect, it } from "vitest";
import { deterministicHash, pluginHash } from "../src/lib/hashing";
import { workspaces } from "../src/lib/mock-data";
import type { PluginDefinition } from "../src/lib/types";

describe("plugin hashing", () => {
  it("is deterministic when object keys have different insertion order", () => {
    expect(deterministicHash({ b: 2, a: { d: 4, c: 3 } })).toBe(
      deterministicHash({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(pluginHash(workspaces[0].plugins[0])).toBe(
      pluginHash(structuredClone(workspaces[0].plugins[0])),
    );
  });

  it("changes when descendant content changes", () => {
    const original = workspaces[0].plugins[0];
    const changed = structuredClone(original) as PluginDefinition;
    const skill = changed.skillDirectories[0];
    const examples = skill.contents.examples;
    if (examples.type !== "directory") throw new Error("fixture changed");
    const example = examples.contents["launch.md"];
    if (example.type !== "file") throw new Error("fixture changed");
    example.content += "Changed";

    expect(pluginHash(changed)).not.toBe(pluginHash(original));
  });
});
