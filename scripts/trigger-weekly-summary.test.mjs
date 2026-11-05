import test from 'node:test';
import assert from 'node:assert/strict';
import { interpret, main, readConfig, report, triggerSummary } from './trigger-weekly-summary.mjs';
const secret='test-secret';
const config={endpoint:'https://api.example/internal/weekly-difficulty-summary',secret};
const counts={smtp_accepted:2,received:0,teachers_skipped:0,failed_deliveries:0,unknown_deliveries:0,processing_deliveries:0};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});

test('HTTPS e credenciais somente no cabeçalho, sem redirects', async()=>{
  assert.equal(readConfig({WEEKLY_SUMMARY_API_URL:'https://api.example/api/?x=1',WEEKLY_SUMMARY_CRON_SECRET:secret}).endpoint,'https://api.example/api/internal/weekly-difficulty-summary');
  assert.throws(()=>readConfig({WEEKLY_SUMMARY_API_URL:'http://api.example',WEEKLY_SUMMARY_CRON_SECRET:secret}),/HTTPS/);
  assert.throws(()=>readConfig({WEEKLY_SUMMARY_API_URL:'https://user:pass@api.example',WEEKLY_SUMMARY_CRON_SECRET:secret}),/credenciais/);
  let calls=0;
  const result=await triggerSummary(config,{fetchImpl:async(url,init)=>{
    calls++;
    assert.ok(!url.includes(secret));
    assert.equal(init.headers['X-Cron-Secret'],secret);
    assert.equal(init.redirect,'error');
    return reply({...counts,status:'smtp_accepted'});
  }});
  assert.equal(calls,1);
  assert.equal(result.ok,true);
  assert.match(report(result),/Aceitos pelo SMTP: 2/);
});

test('nenhuma repetição em gateway ou perda de rede',async()=>{
  for(const status of [502,504,503]) {
    let calls=0;
    const result=await triggerSummary(config,{fetchImpl:async()=>{calls++; return reply({},status);}});
    assert.equal(result.ok,false);
    assert.equal(calls,1);
  }
  let calls=0;
  const result=await triggerSummary(config,{fetchImpl:async()=>{calls++;throw new Error(secret);}});
  assert.equal(calls,1);
  assert.equal(result.outcome,'unknown');
  assert.ok(!report(result).includes(secret));
});

test('recusa resultados ambíguos, contrato legado e contagens inválidas',()=>{
  for(const status of ['unknown','processing','failed','sent','already_sent']) assert.equal(interpret(200,{...counts,status}).ok,false);
  assert.equal(interpret(200,{...counts,status:'smtp_accepted',unknown_deliveries:1}).ok,false);
  assert.equal(interpret(200,{...counts,status:'smtp_accepted',failed_deliveries:1}).ok,false);
  assert.equal(interpret(200,{...counts,status:'smtp_accepted',smtp_accepted:-1}).ok,false);
  assert.equal(interpret(200,{status:'smtp_accepted'}).ok,false);
  assert.equal(interpret(200,{...counts,status:'no_deliveries',smtp_accepted:0}).ok,true);
});

test('resposta remota não pode injetar dados no comprovante',()=>{
  const result=interpret(403,{detail:secret,status:secret});
  assert.ok(!report(result).includes(secret));
});

test('configuração ausente encerra com erro',async()=>{
  assert.equal(await main({}),1);
});
