import { AsyncLocalStorage } from 'node:async_hooks';
import type { Transaction } from '../audit/writer.js';
const transactions = new AsyncLocalStorage<Transaction>();
export function currentTransaction() {
  return transactions.getStore();
}
export function requireTransaction() {
  const transaction = currentTransaction();
  if (!transaction) throw new Error('Business transaction required');
  return transaction;
}
export function inTransaction<T>(transaction: Transaction, work: () => Promise<T>) {
  return transactions.run(transaction, work);
}
