import { mkdir, readFile, rename as fsRename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { OTHER_REFERRER, REFERRER_CAP, type LinkRecord, type LinkStore, type Visit } from './types.js';

/**
 * Dev/test store: whole table as one JSON file, loaded once and rewritten on
 * every mutation. The production counterpart is a DynamoDB implementation of
 * the same LinkStore interface.
 */
export class FileStore implements LinkStore {
  private links = new Map<string, LinkRecord>();
  // Visitor markers are process-local: a dev restart forgets who has been
  // seen, so uniques can re-count after one. Fine for a dev/test store.
  private seen = new Map<string, Set<string>>();
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

  /**
   * Returns a copy, not the stored object. Handing out a live reference lets a
   * caller's in-memory edit reach the store without a write — so a request that
   * mutates a record and then fails before persisting would still have changed
   * it. The DynamoDB store rebuilds a record per read and never aliases; this
   * keeps both implementations of the interface behaving the same way.
   */
  async get(slug: string): Promise<LinkRecord | null> {
    await this.load();
    const link = this.links.get(slug);
    return link ? structuredClone(link) : null;
  }

  // Single process, so "check then set" is atomic here in a way it is not in
  // DynamoDB; the conditional write there is what actually closes the race.
  async create(link: LinkRecord): Promise<boolean> {
    await this.load();
    if (this.links.has(link.slug)) return false;
    this.links.set(link.slug, link);
    await this.flush();
    return true;
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

    let visitors = this.seen.get(slug);
    if (!visitors) this.seen.set(slug, (visitors = new Set()));
    if (!visitors.has(visit.visitor)) {
      visitors.add(visit.visitor);
      link.uniques = (link.uniques ?? 0) + 1;
    }

    // Same rule the DynamoDB store enforces with a size() condition: a host
    // that is not already a key only gets one while the map has room.
    const ref =
      visit.referrer in link.referrers || Object.keys(link.referrers).length < REFERRER_CAP
        ? visit.referrer
        : OTHER_REFERRER;
    link.referrers[ref] = (link.referrers[ref] ?? 0) + 1;
    await this.flush();
  }

  async delete(slug: string): Promise<void> {
    await this.load();
    this.links.delete(slug);
    this.seen.delete(slug);
    await this.flush();
  }
}
