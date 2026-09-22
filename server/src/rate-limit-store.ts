import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';
import { TTL_ATTRIBUTE } from './dynamo-store.js';

const counterKey = (name: string, key: string): string => `rl#${name}#${key}`;

export class DynamoRateLimitStore implements Store {
  private doc: DynamoDBDocumentClient;
  private windowMs = 0;

  constructor(
    private table: string,
    private name: string,
    client: DynamoDBClient = new DynamoDBClient({
      requestHandler: { connectionTimeout: 2_000, requestTimeout: 5_000 },
    }),
  ) {
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const slug = counterKey(this.name, key);
    const now = Date.now();

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resetTime = now + this.windowMs;
        await this.doc.send(
          new UpdateCommand({
            TableName: this.table,
            Key: { slug },
            UpdateExpression: `SET totalHits = :one, resetTime = :resetTime, ${TTL_ATTRIBUTE} = :ttl`,
            ConditionExpression: 'attribute_not_exists(slug) OR resetTime <= :now',
            ExpressionAttributeValues: {
              ':one': 1,
              ':resetTime': resetTime,
              ':ttl': Math.ceil(resetTime / 1000),
              ':now': now,
            },
          }),
        );
        return { totalHits: 1, resetTime: new Date(resetTime) };
      } catch (err: any) {
        if (err?.name !== 'ConditionalCheckFailedException') throw err;
      }

      // Branch 2: still inside the window. Add one to the existing counter.
      try {
        const res = await this.doc.send(
          new UpdateCommand({
            TableName: this.table,
            Key: { slug },
            UpdateExpression: 'ADD totalHits :one',
            ConditionExpression: 'attribute_exists(slug) AND resetTime > :now',
            ExpressionAttributeValues: { ':one': 1, ':now': now },
            ReturnValues: 'ALL_NEW',
          }),
        );
        return {
          totalHits: res.Attributes!.totalHits as number,
          resetTime: new Date(res.Attributes!.resetTime as number),
        };
      } catch (err: any) {
        if (err?.name !== 'ConditionalCheckFailedException') throw err;
      }
    }
    throw new Error(`rate-limit counter for "${this.name}" would not settle after 3 attempts`);
  }

  /**
   * Only called by express-rate-limit's skipSuccessfulRequests/skipFailedRequests,
   * and only while the caller's own window is still open, so there is always
   * a counter here to undo. Swallows a condition failure regardless -- a
   * counter that already reset or hit zero needs no further correction.
   */
  async decrement(key: string): Promise<void> {
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { slug: counterKey(this.name, key) },
          UpdateExpression: 'ADD totalHits :negOne',
          ConditionExpression: 'attribute_exists(slug) AND totalHits > :zero',
          ExpressionAttributeValues: { ':negOne': -1, ':zero': 0 },
        }),
      );
    } catch (err: any) {
      if (err?.name !== 'ConditionalCheckFailedException') throw err;
    }
  }

  async resetKey(key: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({ TableName: this.table, Key: { slug: counterKey(this.name, key) } }),
    );
  }
}
