import { DeleteCommand, GetCommand, PutCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DocumentClientLike } from '../../src/profile-store.js';

type Item = Record<string, unknown>;
type Names = Record<string, string> | undefined;
type Values = Record<string, unknown> | undefined;

/**
 * In-memory stand-in for the DynamoDB document client covering the subset of
 * condition/update syntax the profile store uses, so tests exercise the real
 * conditional-write semantics rather than mocked responses.
 */
export class MemoryDynamo implements DocumentClientLike {
  readonly items = new Map<string, Item>();
  readonly commands: unknown[] = [];

  async send(command: unknown): Promise<unknown> {
    this.commands.push(command);
    if (command instanceof GetCommand) {
      const item = this.items.get(String(command.input.Key!.pk));
      return { Item: item ? structuredClone(item) : undefined };
    }
    if (command instanceof PutCommand) {
      this.applyPut(command.input as never);
      return {};
    }
    if (command instanceof DeleteCommand) {
      this.applyDelete(command.input as never);
      return {};
    }
    if (command instanceof UpdateCommand) {
      return { Attributes: this.applyUpdate(command.input as never) };
    }
    if (command instanceof TransactWriteCommand) {
      const items = command.input.TransactItems ?? [];
      const reasons = items.map((entry) => {
        const op = (entry.Put ?? entry.Update ?? entry.Delete) as {
          Key?: Item;
          Item?: Item;
          ConditionExpression?: string;
          ExpressionAttributeNames?: Names;
          ExpressionAttributeValues?: Values;
        };
        const pk = String((op.Key ?? op.Item)!.pk);
        const ok =
          !op.ConditionExpression ||
          evaluate(op.ConditionExpression, this.items.get(pk), op.ExpressionAttributeNames, op.ExpressionAttributeValues);
        return { Code: ok ? 'None' : 'ConditionalCheckFailed' };
      });
      if (reasons.some((reason) => reason.Code !== 'None')) {
        throw Object.assign(new Error('Transaction cancelled'), {
          name: 'TransactionCanceledException',
          CancellationReasons: reasons,
        });
      }
      for (const entry of items) {
        if (entry.Put) this.applyPut({ ...entry.Put, ConditionExpression: undefined } as never);
        if (entry.Update) this.applyUpdate({ ...entry.Update, ConditionExpression: undefined } as never);
        if (entry.Delete) this.applyDelete({ ...entry.Delete, ConditionExpression: undefined } as never);
      }
      return {};
    }
    throw new Error(`unsupported command ${String(command)}`);
  }

  private check(input: { ConditionExpression?: string; ExpressionAttributeNames?: Names; ExpressionAttributeValues?: Values }, pk: string) {
    if (
      input.ConditionExpression &&
      !evaluate(input.ConditionExpression, this.items.get(pk), input.ExpressionAttributeNames, input.ExpressionAttributeValues)
    ) {
      throw Object.assign(new Error('The conditional request failed'), { name: 'ConditionalCheckFailedException' });
    }
  }

  private applyPut(input: { Item: Item; ConditionExpression?: string; ExpressionAttributeNames?: Names; ExpressionAttributeValues?: Values }) {
    const pk = String(input.Item.pk);
    this.check(input, pk);
    this.items.set(pk, structuredClone(input.Item));
  }

  private applyDelete(input: { Key: Item; ConditionExpression?: string; ExpressionAttributeNames?: Names; ExpressionAttributeValues?: Values }) {
    const pk = String(input.Key.pk);
    this.check(input, pk);
    this.items.delete(pk);
  }

  private applyUpdate(input: {
    Key: Item;
    UpdateExpression: string;
    ConditionExpression?: string;
    ExpressionAttributeNames?: Names;
    ExpressionAttributeValues?: Values;
  }): Item {
    const pk = String(input.Key.pk);
    this.check(input, pk);
    const item: Item = structuredClone(this.items.get(pk) ?? { pk });
    const assignments = input.UpdateExpression.replace(/^SET\s+/i, '').split(/,(?![^(]*\))/);
    for (const assignment of assignments) {
      const [left, right] = assignment.split('=').map((part) => part.trim()) as [string, string];
      const name = resolveName(left, input.ExpressionAttributeNames);
      const ifNotExists = right.match(/^if_not_exists\(\s*([^,]+),\s*([^)]+)\)$/);
      if (ifNotExists) {
        if (item[name] === undefined) {
          item[name] = input.ExpressionAttributeValues?.[ifNotExists[2]!.trim()];
        }
      } else {
        item[name] = input.ExpressionAttributeValues?.[right];
      }
    }
    this.items.set(pk, item);
    return structuredClone(item);
  }
}

function resolveName(token: string, names: Names): string {
  return token.startsWith('#') ? (names?.[token] ?? token) : token;
}

/** Tiny recursive-descent evaluator for: attribute_not_exists(), =, <, AND, OR, parentheses. */
function evaluate(expression: string, item: Item | undefined, names: Names, values: Values): boolean {
  const tokens = expression.match(/attribute_not_exists|\(|\)|AND|OR|=|<|[#:]?[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  let position = 0;
  const peek = () => tokens[position];
  const next = () => tokens[position++]!;
  const operand = (token: string): unknown =>
    token.startsWith(':') ? values?.[token] : item?.[resolveName(token, names)];

  const primary = (): boolean => {
    const token = next();
    if (token === '(') {
      const result = or();
      next();
      return result;
    }
    if (token === 'attribute_not_exists') {
      next();
      const name = resolveName(next(), names);
      next();
      return item?.[name] === undefined;
    }
    const operator = next();
    const right = operand(next());
    const left = operand(token);
    if (operator === '=') return left !== undefined && left === right;
    if (operator === '<') return typeof left === 'number' && typeof right === 'number' && left < right;
    throw new Error(`unsupported operator ${operator}`);
  };
  const and = (): boolean => {
    let result = primary();
    while (peek() === 'AND') {
      next();
      const rhs = primary();
      result = result && rhs;
    }
    return result;
  };
  const or = (): boolean => {
    let result = and();
    while (peek() === 'OR') {
      next();
      const rhs = and();
      result = result || rhs;
    }
    return result;
  };
  return or();
}
