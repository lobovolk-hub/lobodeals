// Explicit local-only PostgreSQL/WASM runner; never reads application credentials.
// External tool dependency, not part of the application or deployment.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { STORE_SLUGS } from '../supabase/functions/campaign-monitoring/_shared/types.ts'

const { PGlite } = await import(pathToFileURL(process.env.LOBO_QA_PGLITE_MODULE).href)
const logs = []
const db = new PGlite({ onNotice: n => logs.push(n.message) })
const sql = file => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')
await db.exec(`set timezone='UTC'; create role anon; create role authenticated; create role service_role bypassrls;
  create schema cron; create schema net; create schema vault;
  create table cron.job(jobid bigint primary key,jobname text,schedule text,command text,active boolean default true);
  create function cron.schedule(job_name text,schedule text,command text) returns bigint language plpgsql as $$
  begin insert into cron.job values(9,job_name,schedule,command,true); return 9; end $$;
  create function cron.unschedule(bigint) returns boolean language sql as $$select false$$;
  create function cron.alter_job(job_id bigint,schedule text default null,command text default null,
    database text default null,username text default null,active boolean default null)
    returns void language sql as $$update cron.job set command=$3 where jobid=$1$$;
  create table vault.decrypted_secrets(name text,decrypted_secret text);
  insert into vault.decrypted_secrets values('campaign_monitor_token','local-only-token');
  create table net.test_requests(id bigserial,url text,body jsonb,params jsonb,headers jsonb,timeout integer);
  create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,
    headers jsonb default '{}'::jsonb,timeout_milliseconds integer default 5000)
    returns bigint language plpgsql as $$declare result bigint; begin
    if current_setting('qa.fail_store',true)=body->'stores'->>0 then raise exception 'Injected enqueue failure'; end if;
    insert into net.test_requests(url,body,params,headers,timeout) values($1,$2,$3,$4,$5) returning id into result;
    return result; end $$;`)
for (const file of ['20260826034405_create_sales_backend.sql', '20260827040859_campaign_artwork.sql',
  '20261007223743_epic_public_snapshot.sql', '20261012185056_sales_operational_visibility.sql',
  '20260826195308_schedule_campaign_monitoring.sql', '20261023160029_campaign_monitor_store_admission.sql',
  '20261023160058_campaign_monitor_store_dispatch.sql']) await db.exec(await sql(file))
const cycle = (await db.query(`select date_bin(interval '4 hours',clock_timestamp(),timestamptz '2000-01-01')::text value`)).rows[0].value
const claim = async (store, id, cycle = null) => (await db.query(
  'select public.claim_campaign_monitor_store($1,$2,$3) value', [store,id,cycle])).rows[0].value
const release = async (store,id) => (await db.query(
  'select public.release_campaign_monitor_store($1,$2) value',[store,id])).rows[0].value
const command = (await db.query('select command from cron.job where jobid=9')).rows[0].command
async function scenario(name, fn) {
  await test(name, async () => { await db.exec('begin'); try { await fn() } finally { await db.exec('rollback') } })
}
try {
  await scenario('actual scheduled SQL constructs ten unique dispatches with Vault token and correlation', async () => {
    await db.exec(command)
    const requests = (await db.query('select * from net.test_requests order by id')).rows
    assert.equal(requests.length, 10)
    assert.deepEqual(requests.map(r => r.body.stores[0]), [...STORE_SLUGS])
    assert.equal(new Set(requests.map(r => r.body.cycleId)).size, 1)
    for (const r of requests) {
      assert.equal(r.body.stores.length, 1); assert.equal(r.body.mode, 'persist')
      assert.equal(r.headers['x-campaign-monitor-token'], 'local-only-token')
      assert.equal(r.params.cycle_id, r.body.cycleId); assert.equal(r.params.store, r.body.stores[0])
      assert.equal(r.timeout, 120000)
    }
    assert.equal((await db.query('select count(*)::int n from cron.job')).rows[0].n, 1)
    assert.doesNotMatch(logs.join('\n'), /local-only-token/)
  })
  await test('enqueue exception rolls the entire batch back, never commits a silent subset', async () => {
    await db.exec('begin; set local qa.fail_store = \'gog\';')
    await assert.rejects(db.exec(command), /Injected enqueue failure/)
    await db.exec('rollback')
    assert.equal((await db.query('select count(*)::int n from net.test_requests')).rows[0].n, 0)
  })
  await scenario('manual duplicate admission, wrong release and other-store isolation', async () => {
    const owner = randomUUID(), other = randomUUID()
    assert.equal(await claim('gog',owner), 'acquired')
    assert.equal(await claim('gog',owner), 'acquired')
    assert.equal(await claim('gog',other), 'busy')
    assert.equal(await claim('steam',other), 'acquired')
    assert.equal(await release('gog',other), false)
    assert.equal(await claim('gog',other), 'busy')
    assert.equal(await release('gog',owner), true)
    assert.equal(await claim('gog',other), 'acquired')
  })
  await scenario('scheduled duplicate remains rejected after release; interrupted lease can expire', async () => {
    // Freeze only the database clock in this transaction-local fixture. Keep all
    // admission predicates and durations unchanged, irrespective of test time.
    const admission = await sql('20261023160029_campaign_monitor_store_admission.sql')
    const definition = admission.slice(admission.indexOf('create function public.claim'), admission.indexOf('create function public.release'))
      .replace('create function', 'create or replace function')
      .replace('current_time_utc timestamptz := clock_timestamp()', `current_time_utc timestamptz := timestamptz '${cycle}' + interval '5 minutes'`)
    await db.exec(definition)
    const owner = randomUUID(), other = randomUUID()
    assert.equal(await claim('gog',owner,cycle), 'acquired')
    await release('gog',owner)
    assert.equal(await claim('gog',other,cycle), 'duplicate-cycle')
    assert.equal(await claim('gog',other), 'acquired')
    await db.query("update public.sales_source_health set monitor_lease_until=$1::timestamptz where store_slug='gog'", [cycle])
    assert.equal(await claim('gog',owner), 'acquired')
    assert.equal(await release('gog',other), false)
  })
  await scenario('real admission rejects stale/future/non-slot cycles without mutating health', async () => {
    for (const value of ['2020-01-01T00:00:00Z','2099-01-01T00:00:00Z','2026-10-23T17:01:00Z']) {
      assert.equal(await claim('gog',randomUUID(),value), 'stale-cycle')
    }
    assert.equal((await db.query("select monitor_invocation from public.sales_source_health where store_slug='gog'")).rows[0].monitor_invocation,null)
  })
  await scenario('admission and release remain service-role only', async () => {
    for (const role of ['anon','authenticated']) {
      const grants = (await db.query(`select has_function_privilege($1,'public.claim_campaign_monitor_store(text,uuid,timestamptz)','execute') allowed`,[role])).rows[0]
      assert.equal(grants.allowed, false)
    }
    await db.exec('set local role service_role')
    const id = randomUUID(); assert.equal(await claim('gog',id), 'acquired'); assert.equal(await release('gog',id),true)
  })
  await scenario('Epic and PlayStation reservation RPCs remain idempotent and preserve unknown absences', async () => {
    const epic = (await db.query('select public.reserve_epic_public_scan() value')).rows[0].value
    const publishEpic = () => db.query('select public.finalize_epic_public_scan($1,$2,$3,$4,clock_timestamp()) value',
      [epic.generation,epic.base_pointer,'[]',[]])
    assert.equal((await publishEpic()).rows[0].value,'published')
    assert.equal((await publishEpic()).rows[0].value,'already-published')
    const ps = (await db.query("select public.reserve_sales_visibility_scan('playstation-store') value")).rows[0].value
    const publishPS = () => db.query("select public.finalize_sales_visibility_scan('playstation-store',$1,$2,$3,$4,$5,clock_timestamp()) value",
      [ps.generation,ps.base_pointer,'[]',[],[]])
    const published = (await publishPS()).rows[0].value
    assert.equal(published.status,'published'); assert.equal(published.hidden,0); assert.equal(published.ended,0)
    assert.equal((await publishPS()).rows[0].value.status,'already-published')
  })
  await scenario('rollback restores the exact original command without replacing the job or deleting data', async () => {
    await db.exec(await readFile(new URL('../supabase/rollback/campaign_monitor_store_dispatch.sql', import.meta.url),'utf8'))
    const job = (await db.query('select jobid,active,schedule,md5(command) hash from cron.job')).rows
    assert.deepEqual(job,[{ jobid:9,active:true,schedule:'0 */4 * * *',hash:'e48e9f74aee2ebfc6944a3aad721314a' }])
    assert.equal((await db.query('select count(*)::int n from public.sales_source_health')).rows[0].n,10)
  })
} finally { await db.close() }
