import { constants } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type {
  ApiError,
  DirectoryResponse,
  PluginListResponse,
  PluginSummary,
} from "./types";

const STATE_FILENAME = ".notion-plugin-sync.json";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;

type Fetch = typeof fetch;
type Logger = Pick<Console, "log" | "error">;

export type SyncState = {
  version: 2;
  baseUrl: string;
  plugins: Record<string, { updatedAt: string }>;
};

export type SyncOptions = {
  baseUrl: string;
  output: string;
  token?: string;
  dryRun?: boolean;
  fetchImpl?: Fetch;
  logger?: Logger;
  timeoutMs?: number;
  maxDownloadBytes?: number;
};

type MaterializeOptions = {
  fetchDirectory: (directoryId: string) => Promise<DirectoryResponse>;
  fetchImpl?: Fetch;
  logger?: Logger;
  timeoutMs?: number;
  maxDownloadBytes?: number;
};

type StagedChange = {
  plugin: PluginSummary;
  stagingPath: string;
  finalPath: string;
};

type Backup = { finalPath: string; backupPath: string };

function indent(value: string, spaces = 4): string {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function logRequest(
  logger: Logger,
  method: string,
  url: string | URL,
  headers: HeadersInit = {},
): void {
  const lines = [`\n→ ${method} ${url}`];
  for (const [name, value] of new Headers(headers)) {
    const displayValue =
      name.toLowerCase() === "authorization" ? "Bearer <redacted>" : value;
    lines.push(`  ${name}: ${displayValue}`);
  }
  logger.log(lines.join("\n"));
}

function logResponse(
  logger: Logger,
  response: Response,
  body?: unknown,
): void {
  const status = response.statusText
    ? `${response.status} ${response.statusText}`
    : String(response.status);
  const lines = [`← ${status}`];
  for (const name of ["content-type", "content-length"]) {
    const value = response.headers.get(name);
    if (value) lines.push(`  ${name}: ${value}`);
  }
  if (body !== undefined) {
    const formattedBody =
      typeof body === "string" && body.startsWith("<binary body:")
        ? body
        : JSON.stringify(body, null, 2);
    lines.push("  body:", indent(formattedBody));
  }
  logger.log(lines.join("\n"));
}

export function validatePathSegment(name: string): void {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    path.isAbsolute(name)
  ) {
    throw new Error(`Unsafe path segment: ${JSON.stringify(name)}`);
  }
}

function safeChild(root: string, segment: string): string {
  validatePathSegment(segment);
  const candidate = path.resolve(root, segment);
  const relative = path.relative(path.resolve(root), candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes installation root: ${segment}`);
  }
  return candidate;
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readState(output: string): Promise<SyncState | undefined> {
  try {
    const parsed = JSON.parse(
      await readFile(path.join(output, STATE_FILENAME), "utf8"),
    ) as SyncState;
    if (parsed.version !== 2 || typeof parsed.plugins !== "object") {
      throw new Error("unsupported state format; remove it and sync again");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`Could not read ${STATE_FILENAME}: ${(error as Error).message}`);
  }
}

async function request(
  url: string,
  fetchImpl: Fetch,
  headers: HeadersInit,
  timeoutMs: number,
  logger: Logger,
): Promise<{ response: Response; body: unknown }> {
  logRequest(logger, "GET", url, headers);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    logger.error(`← request failed\n${indent((error as Error).message, 2)}`);
    throw error;
  }

  const rawBody = await response.text();
  let body: unknown;
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = rawBody;
    }
  }
  logResponse(logger, response, body);
  return { response, body };
}

function responseError(url: string, response: Response, body: unknown): Error {
  const detail =
    typeof body === "object" && body
      ? (body as ApiError).error?.message ?? `${response.status} ${response.statusText}`
      : `${response.status} ${response.statusText}`;
  return new Error(`Request failed for ${url}: ${detail}`);
}

async function fetchJson<T>(
  url: string,
  fetchImpl: Fetch,
  headers: HeadersInit,
  timeoutMs: number,
  logger: Logger,
): Promise<T> {
  const exchange = await request(url, fetchImpl, headers, timeoutMs, logger);
  if (!exchange.response.ok) {
    throw responseError(url, exchange.response, exchange.body);
  }
  if (!exchange.body || typeof exchange.body === "string") {
    throw new Error(`Expected a JSON response from ${url}.`);
  }
  return exchange.body as T;
}

async function downloadHttps(
  url: string,
  destination: string,
  fetchImpl: Fetch,
  timeoutMs: number,
  maxBytes: number,
  logger: Logger,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL node: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`URL nodes must use https:, received ${parsed.protocol}`);
  }

  logRequest(logger, "GET", parsed);
  let response: Response;
  try {
    response = await fetchImpl(parsed, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    logger.error(`← request failed\n${indent((error as Error).message, 2)}`);
    throw error;
  }
  if (!response.ok || !response.body) {
    logResponse(logger, response);
    throw new Error(`Asset download failed for ${url}: ${response.status}`);
  }
  if (new URL(response.url || parsed).protocol !== "https:") {
    logResponse(logger, response);
    throw new Error(`Asset redirected to a non-HTTPS URL: ${response.url}`);
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    logResponse(logger, response, `<binary body: exceeds ${maxBytes} byte limit>`);
    throw new Error(`Asset exceeds ${maxBytes} byte limit: ${url}`);
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      logResponse(
        logger,
        response,
        `<binary body: exceeded limit after ${received} bytes>`,
      );
      throw new Error(`Asset exceeds ${maxBytes} byte limit: ${url}`);
    }
    chunks.push(value);
  }

  logResponse(logger, response, `<binary body: ${received} bytes>`);
  await writeFile(destination, Buffer.concat(chunks));
}

async function materializeContents(
  response: DirectoryResponse,
  destination: string,
  options: Required<MaterializeOptions>,
  ancestors: Set<string>,
): Promise<void> {
  validatePathSegment(response.directory.id);
  validatePathSegment(response.directory.name);
  if (ancestors.has(response.directory.id)) {
    throw new Error(`Directory cycle detected at '${response.directory.id}'.`);
  }
  const nextAncestors = new Set(ancestors).add(response.directory.id);
  await mkdir(destination, { recursive: true });

  for (const [name, node] of Object.entries(response.contents).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const childPath = safeChild(destination, name);
    if (node.type === "file") {
      await writeFile(childPath, node.content, "utf8");
      continue;
    }
    if (node.type === "url") {
      await downloadHttps(
        node.url,
        childPath,
        options.fetchImpl,
        options.timeoutMs,
        options.maxDownloadBytes,
        options.logger,
      );
      continue;
    }

    validatePathSegment(node.id);
    validatePathSegment(node.name);
    if (node.name !== name) {
      throw new Error(`Directory entry '${name}' has mismatched name '${node.name}'.`);
    }
    const child = await options.fetchDirectory(node.id);
    if (child.directory.id !== node.id || child.directory.name !== node.name) {
      throw new Error(`Directory response did not match '${node.id}'.`);
    }
    await materializeContents(child, childPath, options, nextAncestors);
  }
}

export async function materializeDirectory(
  response: DirectoryResponse,
  destination: string,
  options: MaterializeOptions,
): Promise<void> {
  await materializeContents(
    response,
    destination,
    {
      fetchDirectory: options.fetchDirectory,
      fetchImpl: options.fetchImpl ?? fetch,
      logger: options.logger ?? console,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxDownloadBytes:
        options.maxDownloadBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES,
    },
    new Set(),
  );
}

async function atomicWriteState(output: string, state: SyncState): Promise<void> {
  const tempPath = path.join(output, `${STATE_FILENAME}.${process.pid}.tmp`);
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tempPath, path.join(output, STATE_FILENAME));
}

async function rollback(backups: Backup[], installed: string[]): Promise<void> {
  for (const target of installed.reverse()) {
    await rm(target, { recursive: true, force: true });
  }
  for (const backup of backups.reverse()) {
    if (await exists(backup.backupPath)) {
      await rename(backup.backupPath, backup.finalPath);
    }
  }
}

export async function syncPlugins(options: SyncOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const logger = options.logger ?? console;
  const output = path.resolve(options.output);
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxDownloadBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
  const state = await readState(output);
  if (state && state.baseUrl !== baseUrl) {
    throw new Error(`Output is managed for '${state.baseUrl}', not '${baseUrl}'.`);
  }

  const headers = new Headers();
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);

  const catalogUrl = `${baseUrl}/v1/skills/plugins`;
  const catalogExchange = await request(
    catalogUrl,
    fetchImpl,
    headers,
    timeoutMs,
    logger,
  );
  if (!catalogExchange.response.ok) {
    throw responseError(
      catalogUrl,
      catalogExchange.response,
      catalogExchange.body,
    );
  }
  if (!catalogExchange.body || typeof catalogExchange.body === "string") {
    throw new Error(`Expected a JSON response from ${catalogUrl}.`);
  }
  const catalog = catalogExchange.body as PluginListResponse;
  if (!Array.isArray(catalog.plugins)) {
    throw new Error("Plugin catalog response is missing 'plugins'.");
  }
  const previous = state?.plugins ?? {};
  const serverIds = new Set(catalog.plugins.map((plugin) => plugin.id));
  const removed = Object.keys(previous).filter((id) => !serverIds.has(id)).sort();
  const changed: PluginSummary[] = [];
  let unchanged = 0;

  for (const plugin of catalog.plugins) {
    validatePathSegment(plugin.id);
    for (const directory of plugin.skillDirectories) {
      validatePathSegment(directory.id);
      validatePathSegment(directory.name);
    }
    if (previous[plugin.id]?.updatedAt === plugin.updatedAt) {
      logger.log(`unchanged  ${plugin.id}`);
      unchanged += 1;
    } else {
      logger.log(`${previous[plugin.id] ? "updated  " : "new      "}${plugin.id}`);
      changed.push(plugin);
    }
  }
  for (const id of removed) {
    validatePathSegment(id);
    logger.log(`removed    ${id}`);
  }

  if (options.dryRun) {
    logger.log("dry-run    no files changed");
    return;
  }

  await mkdir(output, { recursive: true });
  const transactionRoot = await mkdtemp(path.join(output, ".plugin-sync-"));
  const staged: StagedChange[] = [];
  const backups: Backup[] = [];
  const installed: string[] = [];
  const directoryHeaders: HeadersInit = options.token
    ? { Authorization: `Bearer ${options.token}` }
    : {};
  const fetchDirectory = (directoryId: string) =>
    fetchJson<DirectoryResponse>(
      `${baseUrl}/v1/skills/directories/${encodeURIComponent(directoryId)}`,
      fetchImpl,
      directoryHeaders,
      timeoutMs,
      logger,
    );

  try {
    for (const plugin of changed) {
      const pluginStage = safeChild(transactionRoot, plugin.id);
      const skillsStage = safeChild(pluginStage, "skills");
      await mkdir(skillsStage, { recursive: true });

      for (const summary of plugin.skillDirectories) {
        const root = await fetchDirectory(summary.id);
        if (
          root.directory.id !== summary.id ||
          root.directory.name !== summary.name
        ) {
          throw new Error(`Directory response did not match '${summary.id}'.`);
        }
        await materializeDirectory(root, safeChild(skillsStage, summary.name), {
          fetchDirectory,
          fetchImpl,
          logger,
          timeoutMs,
          maxDownloadBytes: maxBytes,
        });
      }

      staged.push({
        plugin,
        stagingPath: pluginStage,
        finalPath: safeChild(output, plugin.id),
      });
    }

    const commitTargets = [
      ...staged.map(({ finalPath }) => finalPath),
      ...removed.map((id) => safeChild(output, id)),
    ];
    for (const finalPath of commitTargets) {
      if (await exists(finalPath)) {
        const backupPath = safeChild(
          transactionRoot,
          `.backup-${path.basename(finalPath)}`,
        );
        await rename(finalPath, backupPath);
        backups.push({ finalPath, backupPath });
      }
    }

    for (const item of staged) {
      await rename(item.stagingPath, item.finalPath);
      installed.push(item.finalPath);
    }

    const nextState: SyncState = {
      version: 2,
      baseUrl,
      plugins: Object.fromEntries(
        catalog.plugins.map((plugin) => [
          plugin.id,
          { updatedAt: plugin.updatedAt },
        ]),
      ),
    };
    await atomicWriteState(output, nextState);
    logger.log(
      `complete   ${changed.length} installed, ${removed.length} removed, ${unchanged} unchanged`,
    );
  } catch (error) {
    await rollback(backups, installed);
    throw error;
  } finally {
    await rm(transactionRoot, { recursive: true, force: true });
  }
}
