import { buildPluginList } from "@/lib/hashing";
import {
  directoryMetadata,
  serializeDirectoryEntries,
  workspaces,
} from "@/lib/mock-data";
import type { DirectoryResponse, PluginListResponse } from "@/lib/types";

export default function Home() {
  const workspace = workspaces[0];
  const plugins = buildPluginList(workspace.plugins);
  const pluginList: PluginListResponse = {
    object: "list",
    results: plugins,
    next_cursor: null,
    has_more: false,
    type: "plugin",
    plugin: {},
  };
  const firstDirectory = workspace.plugins[0].skillDirectories[0];
  const directoryResponse: DirectoryResponse = {
    ...directoryMetadata(firstDirectory),
    contents: {
      object: "list",
      results: serializeDirectoryEntries(firstDirectory),
      next_cursor: null,
      has_more: false,
      type: "content",
      content: {},
    },
  };
  const listEndpoint = "/v1/skills/plugins";
  const directoryEndpoint = `/v1/skills/directories/${firstDirectory.id}`;

  return (
    <main>
      <header className="hero">
        <div className="eyebrow">Isolated developer prototype</div>
        <h1>Workspace skills, exposed as installable plugins.</h1>
        <p className="lede">
          An external agent connects to one workspace, discovers only its
          explicitly shared skills, and incrementally materializes them on disk.
        </p>
        <div className="workspace-pill">
          Demo workspace <code>{workspace.id}</code>
        </div>
      </header>

      <section aria-labelledby="plugins-title">
        <div className="section-heading">
          <div>
            <div className="kicker">Workspace catalog</div>
            <h2 id="plugins-title">Plugins and skills</h2>
          </div>
          <a className="endpoint-link" href={listEndpoint}>
            Open raw plugin list ↗
          </a>
        </div>

        <div className="plugin-grid">
          {pluginList.results.map((plugin) => (
            <article className="plugin-card" key={plugin.id}>
              <div className="plugin-topline">
                <span className="status-dot" aria-hidden="true" />
                Shared mega-plugin
              </div>
              <h3>{plugin.name}</h3>
              <p>{plugin.description}</p>
              <dl className="metadata">
                <div>
                  <dt>Updated</dt>
                  <dd>{plugin.updatedAt}</dd>
                </div>
              </dl>
              <div className="skills">
                {plugin.skillDirectories.map((skill, index) => (
                  <div className="skill-row" key={skill.id}>
                    <span className="skill-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <strong>{skill.name}</strong>
                      <span>{skill.description}</span>
                    </div>
                    <a
                      aria-label={`Open ${skill.name} directory JSON`}
                      href={`/v1/skills/directories/${skill.id}`}
                    >
                      JSON ↗
                    </a>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="flow" aria-labelledby="flow-title">
        <div className="kicker">Reference flow</div>
        <h2 id="flow-title">Discover → compare → fetch → install</h2>
        <div className="flow-steps">
          {[
            ["01", "List", "Read the connected workspace plugin catalog."],
            ["02", "Compare", "Skip plugins whose updatedAt is unchanged."],
            ["03", "Stage", "Follow directory IDs recursively into temporary storage."],
            ["04", "Commit", "Atomically replace managed plugin directories."],
          ].map(([number, title, copy]) => (
            <div className="flow-step" key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="run-title">
        <div className="section-heading">
          <div>
            <div className="kicker">Try it locally</div>
            <h2 id="run-title">Run the reference client</h2>
          </div>
        </div>
        <div className="terminal" role="region" aria-label="Client commands">
          <div className="terminal-bar">
            <span />
            <span />
            <span />
          </div>
          <pre>
            <code>{`pnpm install\npnpm dev\n\n# In another terminal\npnpm reference-client sync \\\n  --base-url http://localhost:3000 \\\n  --output ./installed-plugins`}</code>
          </pre>
        </div>
      </section>

      <section aria-labelledby="responses-title">
        <div className="section-heading">
          <div>
            <div className="kicker">Inspectable contracts</div>
            <h2 id="responses-title">API response shapes</h2>
          </div>
        </div>
        <div className="json-grid">
          <details open>
            <summary>
              Plugin list <code>GET {listEndpoint}</code>
            </summary>
            <pre>{JSON.stringify(pluginList, null, 2)}</pre>
          </details>
          <details>
            <summary>
              Skill directory <code>GET {directoryEndpoint}</code>
            </summary>
            <pre>{JSON.stringify(directoryResponse, null, 2)}</pre>
          </details>
        </div>
      </section>

      <footer>
        Prototype only · no OAuth, database, marketplace, or production
        authorization semantics.
      </footer>
    </main>
  );
}
