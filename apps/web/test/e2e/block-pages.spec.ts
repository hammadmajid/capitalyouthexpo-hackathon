import { and, eq } from 'drizzle-orm';
import { inventoryBlocks, inventoryClaims } from '@hsm/db';
import { test, expect } from './fixture';
import { blockPagesData } from './block-pages-data';
test('ACC-001/004 / SEC-003: real paged block target, persisted claim and historical release', async ({
  page,
  context,
  stack,
}) => {
  const data = await blockPagesData(stack.database.db);
  const reads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().includes('/inventory'))
      reads.push(request.url());
  });
  await page.goto('/login');
  await page.getByLabel('Email or mobile number').fill(data.email);
  await page.getByLabel('Password').fill(data.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(stack.origin + '/app');
  await page.goto('/app/owner');
  await page.getByRole('combobox', { name: 'Your branch', exact: true }).selectOption(data.branchA);
  const blocks = page.getByRole('region', { name: 'Branch inventory blocks', exact: true });
  await blocks.getByRole('button', { name: 'New inventory block', exact: true }).click();
  const picker = blocks.getByRole('region', { name: 'Block target inventory', exact: true });
  await expect(picker.getByRole('option', { name: 'Block 1', exact: true })).toHaveCount(1);
  await picker.getByLabel('Blocked from').fill(data.start);
  await picker.getByLabel('Available again on').fill(data.end);
  await picker.getByLabel('Private block reason').fill('Private browser repair reason');
  await picker.getByRole('combobox', { name: 'Block category' }).selectOption('maintenance');
  await picker.getByRole('button', { name: 'Next block rooms page', exact: true }).click();
  await expect(picker.getByRole('option', { name: 'Block 21', exact: true })).toHaveCount(1);
  await expect(picker.getByLabel('Private block reason')).toHaveValue(
    'Private browser repair reason',
  );
  await expect(picker.getByLabel('Blocked from')).toHaveValue(data.start);
  await picker.getByLabel('Room to block').selectOption(data.roomId);
  await picker.getByLabel('Block target').selectOption('bed');
  await picker.getByRole('button', { name: 'Next block beds page', exact: true }).click();
  await expect(picker.getByRole('option', { name: 'Bed 21 (number 21)', exact: true })).toHaveCount(
    1,
  );
  await picker.getByLabel('Bed to block').selectOption(data.bedId);
  await picker.getByRole('button', { name: 'Create block', exact: true }).click();
  await expect(blocks.getByText('Block created.', { exact: true })).toBeVisible();
  const [block] = await stack.database.db
    .select()
    .from(inventoryBlocks)
    .where(and(eq(inventoryBlocks.branchId, data.branchA), eq(inventoryBlocks.seatId, data.bedId)));
  expect(block).toMatchObject({
    roomId: data.roomId,
    seatId: data.bedId,
    reason: 2,
    moveInDate: data.start,
    moveOutDate: data.end,
    releasedAt: null,
    createdByUserId: data.ownerId,
  });
  if (!block) throw new Error('Browser persisted block missing');
  const [claim] = await stack.database.db
    .select()
    .from(inventoryClaims)
    .where(eq(inventoryClaims.blockId, block.id));
  expect(claim).toMatchObject({
    roomId: data.roomId,
    seatId: data.bedId,
    seatOrdinal: 21,
    releasedAt: null,
  });
  expect(
    (
      await context.request.get(
        '/api/v1/branches/' +
          data.branchB +
          '/inventory/pages/rooms/' +
          data.roomId +
          '/seats?limit=20',
      )
    ).status(),
  ).toBe(404);
  await blocks
    .getByRole('button', {
      name: 'Release block for room Block 21 from ' + data.start,
      exact: true,
    })
    .click();
  await blocks.getByLabel('Release reason').fill('Browser repair complete');
  await blocks.getByRole('button', { name: 'Confirm release', exact: true }).click();
  await expect(blocks.getByText('Block released.', { exact: true })).toBeVisible();
  const [historical] = await stack.database.db
    .select()
    .from(inventoryBlocks)
    .where(eq(inventoryBlocks.id, block.id));
  expect(historical?.releasedAt).toBeInstanceOf(Date);
  const [released] = await stack.database.db
    .select()
    .from(inventoryClaims)
    .where(eq(inventoryClaims.blockId, block.id));
  expect(released?.releasedAt).toBeInstanceOf(Date);
  await blocks.getByLabel('Block history filter').selectOption('released');
  await expect(
    blocks.getByRole('heading', { name: 'Room Block 21, bed Bed 21', exact: true }),
  ).toBeVisible();
  expect(reads.length).toBeGreaterThan(0);
  expect(reads.some((url) => /\/inventory(?:\?|$)/.test(url))).toBe(false);
  for (const url of reads.filter(
    (value) => value.includes('/inventory/pages/') && !value.includes('/access'),
  ))
    expect(new URL(url).searchParams.get('limit')).toBe('20');
});
