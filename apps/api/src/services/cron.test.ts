import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cronMatches, nextCronRun, parseCron } from '@hako/shared'

test('cron parses fields and rejects bad ones', () => {
  assert.equal(parseCron('0 5 * * *')?.hour.has(5), true)
  assert.deepEqual([...parseCron('*/15 * * * *')!.minute], [0, 15, 30, 45])
  assert.deepEqual([...parseCron('0 0 * * 1-5/2')!.weekday], [1, 3, 5])
  assert.equal(parseCron('0 0 * * 7')!.weekday.has(0), true)
  for (const bad of ['', '* * * *', '60 * * * *', '5-1 * * * *', 'a * * * *', '*/0 * * * *']) assert.equal(parseCron(bad), null, bad)
})

test('day of month and weekday match like cron', () => {
  const both = parseCron('0 5 1 * 1')!
  assert.equal(cronMatches(both, new Date(2026, 10, 1, 5, 0)), true)
  assert.equal(cronMatches(both, new Date(2026, 10, 2, 5, 0)), true)
  assert.equal(cronMatches(both, new Date(2026, 10, 3, 5, 0)), false)
  assert.equal(nextCronRun('30 4 * * *', new Date(2026, 10, 22, 5, 0))?.getTime(), new Date(2026, 10, 23, 4, 30).getTime())
  assert.equal(nextCronRun('0 0 30 2 *'), null)
})
