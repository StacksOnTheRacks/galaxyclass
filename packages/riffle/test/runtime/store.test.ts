import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMatchStore } from '../../src/runtime/store.js';

type Send = ReturnType<typeof vi.fn>;

function createMockClient() {
  const send = vi.fn<Send>();
  return {
    send,
    client: { send } as unknown as Parameters<typeof createMatchStore>[0],
  };
}

describe('match store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes a connection row on connect', async () => {
    const { client, send } = createMockClient();
    const store = createMatchStore(client, { tableName: 'MatchTable' });

    await store.putConnection('conn-1');

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          TableName: 'MatchTable',
          Item: expect.objectContaining({
            PK: 'CONN#conn-1',
            SK: 'META',
            connectionId: 'conn-1',
          }),
        }),
      }),
    );
  });

  it('deletes only the connection row on disconnect', async () => {
    const { client, send } = createMockClient();
    const store = createMatchStore(client, { tableName: 'MatchTable' });

    await store.deleteConnection('conn-1');

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          TableName: 'MatchTable',
          Key: {
            PK: 'CONN#conn-1',
            SK: 'META',
          },
        }),
      }),
    );
  });

  it('persists hand completion fields and writes seats without undefined attributes', async () => {
    const { client, send } = createMockClient();
    send.mockResolvedValue({});
    const store = createMatchStore(client, { tableName: 'MatchTable' });

    await store.updateTableWithVersion(
      'table-1',
      4,
      {
        tableId: 'table-1',
        version: 5,
        status: 'hand_in_progress',
        createdAt: '2026-09-25T12:00:00.000Z',
        defaultStack: 2000,
        maxSeats: 8,
        blinds: { smallBlind: 1, bigBlind: 2 },
        handNumber: 1,
        phase: 'complete',
        winners: [{ seatId: '1', amount: 4 }],
        completeReason: 'fold_to_one',
      },
      [{ seatId: '2', displayName: 'Bob', stack: 1998, seatTokenHash: 'h', connectionId: undefined, allIn: true }],
    );

    const update = send.mock.calls[0]![0].input;
    expect(update.UpdateExpression).toContain('winners = :winners');
    expect(update.UpdateExpression).toContain('completeReason = :completeReason');
    expect(update.ExpressionAttributeValues[':completeReason']).toBe('fold_to_one');
    expect(update.ExpressionAttributeValues[':winners']).toHaveLength(1);

    const seatPut = send.mock.calls[1]![0].input;
    expect(seatPut.Item).toEqual({
      PK: 'TABLE#table-1',
      SK: 'SEAT#2',
      seatId: '2',
      displayName: 'Bob',
      stack: 1998,
      seatTokenHash: 'h',
      allIn: true,
    });
  });

  it('reads allIn and completion fields back', async () => {
    const { client, send } = createMockClient();
    const store = createMatchStore(client, { tableName: 'MatchTable' });

    send.mockResolvedValueOnce({
      Item: { seatId: '2', displayName: 'Bob', stack: 0, seatTokenHash: 'h', allIn: true },
    });
    expect((await store.getSeat('table-1', '2'))?.allIn).toBe(true);

    send.mockResolvedValueOnce({
      Item: {
        tableId: 'table-1',
        version: 5,
        status: 'hand_in_progress',
        createdAt: 'x',
        phase: 'complete',
        winners: [{ seatId: '1', amount: 4 }],
        completeReason: 'showdown',
      },
    });
    const table = await store.getTable('table-1');
    expect(table?.completeReason).toBe('showdown');
    expect(table?.winners).toHaveLength(1);
  });

  it('returns null when a conditional version write fails', async () => {
    const { client, send } = createMockClient();
    send.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });
    const store = createMatchStore(client, { tableName: 'MatchTable' });

    const result = await store.incrementTableVersion('table-1', 1);
    expect(result).toBeNull();
  });
});
