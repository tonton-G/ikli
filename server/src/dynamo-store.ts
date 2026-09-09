import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { LinkRecord, LinkStore, Visit } from './types.js';

/**
 * Direct traffic is keyed by '' in LinkRecord.referrers, but an empty string
 * can't be used as a document-path name in an update expression. Store it under
 * a sentinel instead; parentheses can't appear in a hostname, so nothing collides.
 */
const DIRECT_KEY = '(direct)';
const storeRef = (host: string): string => (host === '' ? DIRECT_KEY : host);
const loadRef = (host: string): string => (host === DIRECT_KEY ? '' : host);

/**
 * visitorHashes is a DynamoDB string set rather than a list so that ADD can
 * union a new visitor in atomically. Sets can't be empty, so a link with no
 * visitors simply has no such attribute.
 */
function toItem(link: LinkRecord): Record<string, unknown> {
  const { visitorHashes, referrers, ...rest } = link;
  const item: Record<string, unknown> = {
    ...rest,
    referrers: Object.fromEntries(
      Object.entries(referrers).map(([host, n]) => [storeRef(host), n]),
    ),
  };
  if (visitorHashes.length > 0) item.visitorHashes = new Set(visitorHashes);
  return item;
}

function fromItem(item: Record<string, any>): LinkRecord {
  const { visitorHashes, referrers, ...rest } = item;
  return {
    ...rest,
    visitorHashes: visitorHashes ? [...(visitorHashes as Set<string>)] : [],
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
    client: DynamoDBClient = new DynamoDBClient({}),
  ) {
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async get(slug: string): Promise<LinkRecord | null> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { slug } }),
    );
    return res.Item ? fromItem(res.Item) : null;
  }

  async put(link: LinkRecord): Promise<void> {
    await this.doc.send(
      new PutCommand({ TableName: this.table, Item: toItem(link) }),
    );
  }

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
    await this.doc.send(
      new DeleteCommand({ TableName: this.table, Key: { slug } }),
    );
  }

  async recordVisit(slug: string, visit: Visit): Promise<void> {
    try {
      // One round trip, no read first: ADD and if_not_exists let DynamoDB fold
      // the counters server-side, so simultaneous visits on different instances
      // can't overwrite each other's increments.
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { slug },
          UpdateExpression:
            'ADD clicks :one, visitorHashes :visitor ' +
            'SET clicksByDay.#day = if_not_exists(clicksByDay.#day, :zero) + :one, ' +
            'referrers.#ref = if_not_exists(referrers.#ref, :zero) + :one',
          ConditionExpression: 'attribute_exists(slug)',
          ExpressionAttributeNames: {
            '#day': visit.day,
            '#ref': storeRef(visit.referrer),
          },
          ExpressionAttributeValues: {
            ':one': 1,
            ':zero': 0,
            ':visitor': new Set([visit.visitor]),
          },
        }),
      );
    } catch (err: any) {
      // Link deleted between the lookup and this write: nothing left to count.
      if (err?.name === 'ConditionalCheckFailedException') return;
      throw err;
    }
  }
}
