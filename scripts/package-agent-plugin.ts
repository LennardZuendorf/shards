#!/usr/bin/env node
/** Build native per-host plugins without installation or trust. Node 24.15+. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
type Options={source:string;output:string;host:'claude'|'codex';binary:string};
function noSymlinks(input:string):string {
 const absolute=path.resolve(input);let item=absolute;
 for(;;) {try {if(fs.lstatSync(item).isSymbolicLink())throw Error('symlink path refused: '+item);}catch(e:any){if(e.code!=='ENOENT')throw e;}const parent=path.dirname(item);if(parent===item)break;item=parent;}
 return absolute;
}
function regular(input:string):Buffer {
 const file=noSymlinks(input);if(!fs.lstatSync(file).isFile())throw Error('package input must be a regular file: '+file);return fs.readFileSync(file);
}
function nativeTarget(data:Buffer):{os:string;arch:string} {
 // Accept only executable native formats and known CPU identities, never scripts.
 if(data.length>=32 && (data.readUInt32LE(0)===0xfeedfacf || data.readUInt32BE(0)===0xfeedfacf)) {
  const read=data.readUInt32LE(0)===0xfeedfacf?(offset:number)=>data.readUInt32LE(offset):(offset:number)=>data.readUInt32BE(offset);
  if(read(12)!==2)throw Error('native binary must be a Mach-O executable');
  const arch=read(4)===0x0100000c?'aarch64':read(4)===0x01000007?'x86_64':null;
  if(!arch)throw Error('unsupported native architecture');return {os:'darwin',arch};
 }
 if(data.length>=64 && data.subarray(0,4).equals(Buffer.from([127,69,76,70]))) {
  if(data[4]!==2 || ![1,2].includes(data[5]))throw Error('unsupported ELF class or byte order');
  const read=data[5]===1?(offset:number)=>data.readUInt16LE(offset):(offset:number)=>data.readUInt16BE(offset);
  if(![2,3].includes(read(16)))throw Error('native binary must be an ELF executable');
  const arch=read(18)===183?'aarch64':read(18)===62?'x86_64':null;
  if(!arch)throw Error('unsupported native architecture');return {os:'linux',arch};
 }
 throw Error('unsupported native executable format');
}
export function packagePlugin(options:Options):string[] {
 const {host}=options;if(!['claude','codex'].includes(host))throw Error('host must be claude or codex');
 const source=noSymlinks(options.source),output=noSymlinks(options.output),binary=noSymlinks(options.binary);
 if(fs.existsSync(output)||!fs.statSync(path.dirname(output)).isDirectory())throw Error('output must be absent and its parent must exist: '+output);
 const binaryData=regular(binary);if((fs.statSync(binary).mode&0o111)===0)throw Error('native binary must be executable');
 const target=nativeTarget(binaryData);
 const inputs=new Map<string,Buffer>();inputs.set('bin/shards-harness',binaryData);
 inputs.set('native-target.json',Buffer.from(JSON.stringify({...target,sha256:createHash('sha256').update(binaryData).digest('hex')},null,2)+'\n'));
 for(const name of ['shards','using-shards']) {const relative=`skills/${name}/SKILL.md`;inputs.set(relative,regular(path.join(source,relative)));}
 const bytes=regular(path.join(source,'.claude-plugin/plugin.json'));const manifest=JSON.parse(bytes.toString('utf8'));
 if(manifest?.name!=='shards'||manifest?.version!=='0.2.0')throw Error('preserve the Shards 0.2.0 package identity');
 if(host==='claude')inputs.set('.claude-plugin/plugin.json',bytes);
 else inputs.set('.codex-plugin/plugin.json',Buffer.from(JSON.stringify({...manifest,hooks:'./hooks/codex.json',mcpServers:'./mcp.json',skills:'./skills/'},null,2)+'\n'));
 for(const relative of host==='claude'?['.mcp.json','hooks/hooks.json']:['mcp.json','hooks/codex.json']) {
  const data=regular(path.join(source,relative));JSON.parse(data.toString('utf8'));inputs.set(relative,data);
 }
 // Every read/validation precedes exclusive output creation.
 fs.mkdirSync(output,{mode:0o755});
 try {for(const [relative,data] of [...inputs].sort(([a],[b])=>a<b?-1:a>b?1:0)) {const destination=path.join(output,relative);fs.mkdirSync(path.dirname(destination),{recursive:true});const fd=fs.openSync(destination,'wx',relative==='bin/shards-harness'?0o755:0o644);try {fs.writeFileSync(fd,data);fs.fchmodSync(fd,relative==='bin/shards-harness'?0o755:0o644);}finally{fs.closeSync(fd);}}}
 catch(error){fs.rmSync(output,{recursive:true,force:true});throw error;}
 return [...inputs.keys()].sort();
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try {
  const options:Record<string,string>={source:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../plugins/shards')};
  for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];if(!['--host','--source','--output','--binary'].includes(key)||!process.argv[i+1]||process.argv[i+1].startsWith('--')||options[key.slice(2)] && key!=='--source')throw Error('expected --host claude|codex --output DIR --binary EXECUTABLE [--source DIR]');options[key.slice(2)]=process.argv[i+1];}
  if(!options.host||!options.output||!options.binary)throw Error('--host, --output and --binary are required');
  const files=packagePlugin(options as Options);console.log(JSON.stringify({host:options.host,output:path.resolve(options.output),files}));
 }catch(error){console.error('plugin packaging failed: '+(error as Error).message);process.exitCode=1;}
}
