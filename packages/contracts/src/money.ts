import { z } from 'zod';

// SRS p.47: arithmetic and persistence use integer paisa.
export type Money = bigint & { readonly __money: unique symbol };
const MAX_TRANSPORT_PAISA = BigInt(Number.MAX_SAFE_INTEGER);
export const moneyJsonSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export function money(paisa: bigint): Money {
  if (paisa < 0n) throw new RangeError('Money must be nonnegative integer paisa');
  return paisa as Money;
}
// API contract §1: conversion is exact; all arithmetic stays bigint.
export function moneyFromJson(value: unknown): Money {
  return money(BigInt(moneyJsonSchema.parse(value)));
}
export function moneyToJson(value: Money): number {
  if (value > MAX_TRANSPORT_PAISA) throw new RangeError('Money exceeds JSON safe integer range');
  return Number(value);
}
export function addMoney(left: Money, right: Money): Money {
  return money(left + right);
}
export function subtractMoney(left: Money, right: Money): Money {
  return money(left - right);
}
// Hermes (Android) Intl cannot format BigInt; group the exact digits without number conversion.
export function formatMoney(value: Money): string {
  return 'PKR ' + String(value / 100n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// FIN-001 / PAY-008: financial documents disclose every paisa; arithmetic stays bigint.
export function formatExactMoney(value: Money): string {
  return formatMoney(value) + '.' + String(value % 100n).padStart(2, '0');
}
