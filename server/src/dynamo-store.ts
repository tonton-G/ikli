import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  OTHER_REFERRER,
  REFERRER_CAP,
  UNIQUE_WINDOW_DAYS,
  type LinkRecord,
  type LinkStore,
  type Visit,
} from './types.js';

/**
 * Direct traffic is keyed by '' in LinkRecord.referrers, but an empty string
 * can't be used as a document-path name in an update expression. Store it under
 * a sentinel instead; parentheses can't appear in a hostname, so nothing collides.
 */
const DIRECT_KEY = '(direct)';
const storeRef = (host: string): string => (host === '' ? DIRECT_KEY : host);
const loadRef = (host: string): string => (host === DIRECT_KEY ? '' : host);

/**
 * Per-visitor markers share the table with links, keyed under a prefix no real
 * slug can produce ('#' is outside the slug alphabet). Each carries an epoch
 * expiry the table's TTL sweeps up, so the link record itself never grows with
 * traffic: uniques is a plain integer on it, bumped only when a marker is new.
 */
const visitorKey = (slug: string, visitor: string): string => `v#${slug}#${visitor}`;
export const TTL_ATTRIBUTE = 'expiresAt';

/**
 * clicksByDay and referrers must always be present as maps: the update
 * expression addresses paths inside them, and DynamoDB rejects a path into a
 * missing parent with a ValidationException rather than a condition failure.
 * Initialising both here unconditionally is what keeps that invariant true.
 */
function toItem(link: LinkRecord): Record<string, unknown> {
  const { referrers, clicksByDay, uniques, ...rest } = link;
  return {
    ...rest,
    uniques: uniques ?? 0,
    clicksByDay: clicksByDay ?? {},
    referrers: Object.fromEntries(
      Object.entries(referrers ?? {}).map(([host, n]) => [storeRef(host), n]),
    ),
  };
}

function fromItem(item: Record<string, any>): LinkRecord {
  const { referrers, ...rest } = item;
  return {
    ...rest,
    uniques: item.uniques ?? 0,
    clicksByDay: item.clicksByDay ?? {},
    referrers: Object.fromEntries(
      Object.entries((referrers ?? {}) as Record<string, number>).map(([host, n]) => [
        loadRef(host),
        n,
      ]),
    ),
  } as LinkRecord;
}

/**
 * Production store. Keeps no link data on the instance, so any instance in the
 * fleet can serve any slug and scale-in doesn't take links with it.
 */
export class DynamoDbStore implements LinkStore {
  private doc: DynamoDBDocumentClient;

  constructor(
    private table: string,
    client: DynamoDBClient = new DynamoDBClient({
      // The SDK ships with no timeouts: requestTimeout defaults to 0 and the
      // socket timeout to 0, both of which mean "wait forever". With no route
      // to DynamoDB — gateway endpoint missing, or the prefix-list egress rule
      // absent — a call blocks on TCP connect until the OS gives up, roughly
      // two minutes on Linux, then retries twice more, while /healthz keeps
      // answering and the ALB keeps sending traffic. These bound that to a
      // TimeoutError in the log within seconds of the first request.
      requestHandler: { connectionTimeout: 2_000, requestTimeout: 5_000 },
    }),
  ) {
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async get(slug: string): Promise<LinkRecord | null> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { slug } }),
    );
    // A visitor marker or any other non-link item at this key is not a link.
    if (!res.Item || typeof res.Item.longUrl !== 'string') return null;
    return fromItem(res.Item);
  }

  /**
   * Conditional write: the item is created only if nothing holds that key yet.
   * This is the collision check for slug minting — a get() first would be a
   * read-then-write race across instances.
   */
  async create(link: LinkRecord): Promise<boolean> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.table,
          Item: toItem(link),
          ConditionExpression: 'attribute_not_exists(slug)',
        }),
      );
      return true;
    } catch (err: any) {
      if (err?.name === 'ConditionalCheckFailedException') return false;
      throw err;
    }
  }

  async put(link: LinkRecord): Promise<void> {
    await this.doc.send(
      new PutCommand({ TableName: this.table, Item: toItem(link) }),
    );
  }

  /**
   * Known limitation: the read is not part of the transaction, so a visit that
   * lands between get() and the write increments the old item and is then
   * deleted with it. Renames are rare and owner-initiated; this is documented
   * rather than closed with optimistic concurrency.
   */
  async rename(oldSlug: string, newSlug: string): Promise<boolean> {
    const link = await this.get(oldSlug);
    if (!link) return false;
    try {
      // Both conditions are evaluated inside one transaction, so a slug can
      // never be claimed twice and the old record can't be dropped on failure.
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
                Item: toItem({ ...link, slug: newSlug }),
                ConditionExpression: 'attribute_not_exists(slug)',
              },
            },
            {
              Delete: {
                TableName: this.table,
                Key: { slug: oldSlug },
                ConditionExpression: 'attribute_exists(slug)',
              },
            },
          ],
        }),
      );
      return true;
    } catch (err: any) {
      if (err?.name === 'TransactionCanceledException') return false;
      throw err;
    }
  }

  async delete(slug: string): Promise<void> {
    // Visitor markers for this slug are left to the TTL sweep.
    await this.doc.send(
      new DeleteCommand({ TableName: this.table, Key: { slug } }),
    );
  }

  async recordVisit(slug: string, visit: Visit): Promise<void> {
    const isNew = await this.markVisitor(slug, visit.visitor);

    // First attempt: the referrer gets its own key only if it already has one
    // or the map still has room. size() makes the cap a server-side invariant
    // rather than something a racing pair of instances could overshoot.
    const applied = await this.bumpCounters(slug, visit, isNew, storeRef(visit.referrer), true);
    if (applied) return;

    // Either the map is full or the link is gone. Fold into the overflow bucket
    // and drop the size check; if this fails too, the link no longer exists.
    await this.bumpCounters(slug, visit, isNew, OTHER_REFERRER, false);
  }

  /** Conditional put of the visitor marker. True if this visitor is new in the window. */
  private async markVisitor(slug: string, visitor: string): Promise<boolean> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.table,
          Item: {
            slug: visitorKey(slug, visitor),
            [TTL_ATTRIBUTE]: Math.floor(Date.now() / 1000) + UNIQUE_WINDOW_DAYS * 86_400,
          },
          ConditionExpression: 'attribute_not_exists(slug)',
        }),
      );
      return true;
    } catch (err: any) {
      if (err?.name === 'ConditionalCheckFailedException') return false;
      throw err;
    }
  }

  /** One UpdateItem folding the visit in. Returns false only on a condition failure. */
  private async bumpCounters(
    slug: string,
    visit: Visit,
    isNew: boolean,
    refKey: string,
    enforceCap: boolean,
  ): Promise<boolean> {
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { slug },
          UpdateExpression:
            `ADD clicks :one${isNew ? ', uniques :one' : ''} ` +
            'SET clicksByDay.#day = if_not_exists(clicksByDay.#day, :zero) + :one, ' +
            'referrers.#ref = if_not_exists(referrers.#ref, :zero) + :one',
          ConditionExpression: enforceCap
            ? 'attribute_exists(slug) AND (attribute_exists(referrers.#ref) OR size(referrers) < :cap)'
            : 'attribute_exists(slug)',
          ExpressionAttributeNames: { '#day': visit.day, '#ref': refKey },
          ExpressionAttributeValues: {
            ':one': 1,
            ':zero': 0,
            ...(enforceCap ? { ':cap': REFERRER_CAP } : {}),
          },
        }),
      );
      return true;
    } catch (err: any) {
      if (err?.name === 'ConditionalCheckFailedException') return false;
      throw err;
    }
  }
}
