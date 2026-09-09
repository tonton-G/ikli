import { mkdir, readFile, rename as fsRename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LinkRecord, LinkStore, Visit } from './types.js';

/**
 * Dev/test store: whole table as one JSON file, loaded once and rewritten on
 * every mutation. The production counterpart is a DynamoDB implementation of
 * the same LinkStore interface.
 */
export class FileStore implements LinkStore {
  private links = new Map<string, LinkRecord>();
  private loaded = false;
  private writing: Promise<void> = Promise.resolve();

  constructor(private filePath: string) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const arr: LinkRecord[] = JSON.parse(raw);
      for (const link of arr) this.links.set(link.slug, link);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
    this.loaded = true;
  }

  private flush(): Promise<void> {
    // Serialize writes so concurrent mutations can't interleave partial files.
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      await writeFile(tmp, JSON.stringify([...this.links.values()], null, 2));
      await fsRename(tmp, this.filePath);
    });
    return this.writing;
  }

  async get(slug: string): Promise<LinkRecord | null> {
    await this.load();
    return this.links.get(slug) ?? null;
  }

  async put(link: LinkRecord): Promise<void> {
    await this.load();
    this.links.set(link.slug, link);
    await this.flush();
  }

  async rename(oldSlug: string, newSlug: string): Promise<boolean> {
    await this.load();
    const link = this.links.get(oldSlug);
    if (!link) return false;
    if (this.links.has(newSlug)) return false;
    this.links.delete(oldSlug);
    this.links.set(newSlug, { ...link, slug: newSlug });
    await this.flush();
    return true;
  }

  async recordVisit(slug: string, visit: Visit): Promise<void> {
    await this.load();
    const link = this.links.get(slug);
    if (!link) return;
    // Single process, single map entry: every mutation below is synchronous, so
    // concurrent visits fold into the same object without losing counts.
    link.clicks += 1;
    link.clicksByDay[visit.day] = (link.clicksByDay[visit.day] ?? 0) + 1;
    if (!link.visitorHashes.includes(visit.visitor)) link.visitorHashes.push(visit.visitor);
    link.referrers[visit.referrer] = (link.referrers[visit.referrer] ?? 0) + 1;
    await this.flush();
  }

  async delete(slug: string): Promise<void> {
    await this.load();
    this.links.delete(slug);
    await this.flush();
  }
}
