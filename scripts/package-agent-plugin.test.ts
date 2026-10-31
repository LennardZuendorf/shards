import {test} from 'node:test';
import type {TestContext} from 'node:test';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {packagePlugin} from './package-agent-plugin.ts';
const source=path.resolve('plugins/shards');
function setup(t:TestContext) {
 const root=fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()),'shards-package-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const binary=path.join(root,'shards-harness');const data=Buffer.alloc(32);data.writeUInt32LE(0xfeedfacf,0);data.writeUInt32LE(0x0100000c,4);data.writeUInt32LE(2,12);fs.writeFileSync(binary,data,{mode:0o755});return {root,binary};
}
test('per-host legacy layouts ship native executable, verified metadata and two skills',t=>{
 const {root,binary}=setup(t);
 for(const host of ['claude','codex'] as const) {
  const out=path.join(root,host);packagePlugin({source,output:out,host,binary});
  const manifest=JSON.parse(fs.readFileSync(path.join(out,`.${host}-plugin/plugin.json`),'utf8'));
  assert.equal(manifest.name,'shards');assert.equal(manifest.version,'0.2.0');assert.ok(!fs.existsSync(path.join(out,'plugin.json')));
  assert.deepEqual(fs.readdirSync(path.join(out,'skills')).sort(),['shards','using-shards']);assert.ok(!fs.existsSync(path.join(out,'scripts')));
  assert.equal(fs.statSync(path.join(out,'bin/shards-harness')).mode&0o777,0o755);
  const metadata=JSON.parse(fs.readFileSync(path.join(out,'native-target.json'),'utf8'));assert.equal(metadata.os,'darwin');assert.equal(metadata.arch,'aarch64');assert.equal(metadata.sha256,createHash('sha256').update(fs.readFileSync(binary)).digest('hex'));
  const mcp=JSON.parse(fs.readFileSync(path.join(out,host==='claude'?'.mcp.json':'mcp.json'),'utf8')).mcpServers.shards;
  assert.equal(mcp.command,host==='claude'?'${CLAUDE_PLUGIN_ROOT}/bin/shards-harness':'${PLUGIN_ROOT}/bin/shards-harness');assert.deepEqual(mcp.args,['--mcp']);
  assert.ok(!fs.existsSync(path.join(out,host==='claude'?'.codex-plugin':'.claude-plugin')));
 }
});
test('deterministic artifacts and exclusive output',t=>{
 const {root,binary}=setup(t);const a=path.join(root,'a'),b=path.join(root,'b');
 const files=packagePlugin({source,output:a,host:'codex',binary});packagePlugin({source,output:b,host:'codex',binary});
 for(const file of files)assert.deepEqual(fs.readFileSync(path.join(a,file)),fs.readFileSync(path.join(b,file)));
 assert.throws(()=>packagePlugin({source,output:a,host:'codex',binary}),/absent/);
});
test('invalid binaries fail before output creation',t=>{
 const {root,binary}=setup(t);
 for(const mutation of ['missing','symlink','script','wrong-arch','not-executable','not-executable-type']) {
  const candidate=path.join(root,mutation);const data=fs.readFileSync(binary);
  if(mutation==='symlink')fs.symlinkSync(binary,candidate);
  else if(mutation!=='missing') {if(mutation==='wrong-arch')data.writeUInt32LE(99,4);if(mutation==='not-executable-type')data.writeUInt32LE(6,12);fs.writeFileSync(candidate,mutation==='script'?'#!/bin/sh\n':data,{mode:mutation==='not-executable'?0o644:0o755});}
  const output=path.join(root,'out-'+mutation);assert.throws(()=>packagePlugin({source,output,host:'claude',binary:candidate}));assert.ok(!fs.existsSync(output));
 }
});
test('symlinked input and output ancestors and missing inputs fail without partial output',t=>{
 const {root,binary}=setup(t);const copy=path.join(root,'source');fs.cpSync(source,copy,{recursive:true});
 const skill=path.join(copy,'skills/shards/SKILL.md');fs.unlinkSync(skill);fs.symlinkSync(path.join(source,'skills/shards/SKILL.md'),skill);
 assert.throws(()=>packagePlugin({source:copy,output:path.join(root,'bad'),host:'claude',binary}),/symlink/);assert.ok(!fs.existsSync(path.join(root,'bad')));
 const alias=path.join(root,'alias');fs.symlinkSync(root,alias);assert.throws(()=>packagePlugin({source,output:path.join(alias,'escape'),host:'codex',binary}),/symlink/);
 fs.unlinkSync(skill);assert.throws(()=>packagePlugin({source:copy,output:path.join(root,'missing'),host:'claude',binary}));assert.ok(!fs.existsSync(path.join(root,'missing')));
});
test('package identity cannot change and malformed JSON fails before output',t=>{
 const {root,binary}=setup(t);const copy=path.join(root,'identity-source');fs.cpSync(source,copy,{recursive:true});const manifest=path.join(copy,'.claude-plugin/plugin.json');
 for(const text of [JSON.stringify({name:'other',version:'0.2.0'}),JSON.stringify({name:'shards',version:'9.0.0'}),'[]','invalid']) {
  fs.writeFileSync(manifest,text);const output=path.join(root,'identity');assert.throws(()=>packagePlugin({source:copy,output,host:'codex',binary}));assert.ok(!fs.existsSync(output));
 }
});
test('ELF target comes from binary headers rather than packaging machine',t=>{
 const {root,binary}=setup(t);const data=Buffer.alloc(64);Buffer.from([127,69,76,70,2,1]).copy(data);data.writeUInt16LE(3,16);data.writeUInt16LE(62,18);fs.writeFileSync(binary,data);
 const output=path.join(root,'linux');packagePlugin({source,output,host:'codex',binary});const meta=JSON.parse(fs.readFileSync(path.join(output,'native-target.json'),'utf8'));assert.equal(meta.os,'linux');assert.equal(meta.arch,'x86_64');
});
test('CLI requires binary and creates concrete reviewable native artifact',t=>{
 const {root,binary}=setup(t);const output=path.join(root,'cli');const script=path.resolve('scripts/package-agent-plugin.ts');
 const missing=spawnSync(process.execPath,[script,'--host','codex','--output',output],{encoding:'utf8'});assert.equal(missing.status,1);assert.match(missing.stderr,/--binary are required/);assert.ok(!fs.existsSync(output));
 const result=spawnSync(process.execPath,[script,'--host','codex','--output',output,'--binary',binary],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).host,'codex');assert.ok(fs.existsSync(path.join(output,'bin/shards-harness')));
});
