import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverRepositoryInventory, parsePackageSpec } from './repository.ts';

test('parses only exact npm package versions', () => {
  assert.deepEqual(parsePackageSpec('@scope/server@1.2.3'), {name:'@scope/server',version:'1.2.3'});
  assert.deepEqual(parsePackageSpec('server@latest'), {name:'server',version:null});
  assert.deepEqual(parsePackageSpec('server@^1.2.3'), {name:'server',version:null});
});

test('discovers repository configs and resolves unpinned npm packages from its lockfile', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-sec-repository-'));
  try {
    fs.mkdirSync(path.join(root, '.cursor'));
    fs.writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({mcpServers:{
      pinned:{command:'npx',args:['-y','@example/pinned@1.2.3']},
      locked:{command:'npx',args:['-y','locked-mcp@latest']},
      python:{command:'uvx',args:['python-mcp==0.4.0']},
      unknown:{command:'node',args:['./server.js']},
    }}));
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({lockfileVersion:3,packages:{
      'node_modules/locked-mcp':{version:'2.3.4'},
    }}));
    const inventory = discoverRepositoryInventory(root);
    assert.deepEqual(inventory.installations.map(({channel,identifier,version})=>({channel,identifier,version})), [
      {channel:'npm',identifier:'@example/pinned',version:'1.2.3'},
      {channel:'npm',identifier:'locked-mcp',version:'2.3.4'},
      {channel:'pypi',identifier:'python-mcp',version:'0.4.0'},
    ]);
    assert.equal(inventory.unresolved.length, 1);
    assert.equal(inventory.unresolved[0]?.configName, 'unknown');
  } finally {
    fs.rmSync(root, {recursive:true,force:true});
  }
});

test('does not inspect user-global MCP configuration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-sec-empty-repository-'));
  try {
    assert.deepEqual(discoverRepositoryInventory(root), {root,installations:[],unresolved:[]});
  } finally {
    fs.rmSync(root, {recursive:true,force:true});
  }
});
