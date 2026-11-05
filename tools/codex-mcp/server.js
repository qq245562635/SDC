#!/usr/bin/env node
// 最小 MCP 服务：把 `codex exec` 暴露为工具，供 Claude Code 派活给 Codex。
// 注册：claude mcp add codex -- node <仓库>/tools/codex-mcp/server.js
// 零依赖，stdio 上按行收发 JSON-RPC。
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const DEFAULT_TIMEOUT_SEC = 900;

function codexCommand() {
  if (process.env.CODEX_JS) return [process.execPath, [process.env.CODEX_JS]];
  if (process.platform === 'win32' && process.env.APPDATA) {
    const js = path.join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (fs.existsSync(js)) return [process.execPath, [js]];
  }
  return ['codex', []];
}

const TOOL = {
  name: 'codex',
  description:
    '派一个任务给 Codex（主美）执行，阻塞直到完成，返回 Codex 的最终回复。' +
    '可用于出图：在 prompt 里写清楚要画什么、尺寸、透明底、保存路径。出图通常需要 1~3 分钟。',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '给 Codex 的完整指令' },
      cwd: { type: 'string', description: '工作目录，默认为 MCP 服务启动目录（项目根）' },
      sandbox: {
        type: 'string',
        enum: ['read-only', 'workspace-write'],
        description: '沙箱模式，默认 workspace-write（可写 cwd 内文件）',
      },
      timeout_sec: { type: 'number', description: `超时秒数，默认 ${DEFAULT_TIMEOUT_SEC}` },
    },
    required: ['prompt'],
  },
};

function runCodex({ prompt, cwd, sandbox, timeout_sec }) {
  return new Promise((resolve) => {
    const outFile = path.join(os.tmpdir(), `codex-mcp-${process.pid}-${Date.now()}.txt`);
    const [cmd, pre] = codexCommand();
    const args = [
      ...pre, 'exec', '--skip-git-repo-check',
      '--sandbox', sandbox || 'workspace-write',
      '-C', cwd || process.cwd(),
      '-o', outFile,
      '-',
    ];
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let log = '';
    const keep = (d) => { log = (log + d.toString()).slice(-4000); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => child.kill(), (timeout_sec || DEFAULT_TIMEOUT_SEC) * 1000);
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, text: `启动 codex 失败：${e.message}` }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      let last = '';
      try { last = fs.readFileSync(outFile, 'utf8').trim(); fs.unlinkSync(outFile); } catch {}
      if (code === 0 && last) resolve({ ok: true, text: last });
      else resolve({ ok: false, text: `codex 退出码 ${code}\n${last}\n--- 日志末尾 ---\n${log}` });
    });
    child.stdin.end(prompt);
  });
}

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

async function handle(req) {
  const { id, method, params } = req;
  if (id === undefined) return; // 通知，不回复
  switch (method) {
    case 'initialize':
      return send({ jsonrpc: '2.0', id, result: {
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'codex-exec-mcp', version: '0.1.0' },
      } });
    case 'ping':
      return send({ jsonrpc: '2.0', id, result: {} });
    case 'tools/list':
      return send({ jsonrpc: '2.0', id, result: { tools: [TOOL] } });
    case 'tools/call': {
      if (params?.name !== TOOL.name) {
        return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `未知工具 ${params?.name}` } });
      }
      const r = await runCodex(params.arguments || {});
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: r.text }], isError: !r.ok } });
    }
    default:
      return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `不支持的方法 ${method}` } });
  }
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return; }
  handle(req).catch((e) => send({ jsonrpc: '2.0', id: req.id, error: { code: -32603, message: String(e) } }));
});
