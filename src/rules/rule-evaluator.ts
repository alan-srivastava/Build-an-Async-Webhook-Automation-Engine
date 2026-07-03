import { Condition } from './schemas/rule.schema';

/** Resolves a dot-path like "customer.total_price" against a payload object. */
function getByPath(obj: Record<string, any>, path: string): any {
  return path
    .split('.')
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/**
 * Three operators, deliberately: equals, gt, contains. Enough to express
 * real rules ("amount > 500", "status equals paid", "tags contains vip")
 * without building a general-purpose expression language nobody asked for.
 */
export function evaluateCondition(
  payload: Record<string, any>,
  condition: Condition,
): boolean {
  const actual = getByPath(payload, condition.field);

  switch (condition.operator) {
    case 'equals':
      return actual === condition.value;
    case 'gt':
      return typeof actual === 'number' && actual > Number(condition.value);
    case 'contains':
      if (typeof actual === 'string') {
        return actual.includes(String(condition.value));
      }
      if (Array.isArray(actual)) {
        return actual.includes(condition.value);
      }
      return false;
    default:
      return false;
  }
}

/** A rule matches when ALL of its conditions match (logical AND). */
export function ruleMatches(
  payload: Record<string, any>,
  conditions: Condition[],
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => evaluateCondition(payload, c));
}
