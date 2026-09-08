import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceRoot = path.resolve(process.argv[2] || ".");

async function replaceOnce(relativePath, expected, replacement) {
  const filePath = path.join(sourceRoot, relativePath);
  const source = await readFile(filePath, "utf8");
  if (!source.includes(expected)) {
    throw new Error(`Could not find the expected source block in ${relativePath}`);
  }
  await writeFile(filePath, source.replace(expected, replacement), "utf8");
}

await replaceOnce(
  "conf.lua",
  '    t.version="11.5"',
  '    t.version=system=="Web" and "11.4" or "11.5"',
);

await replaceOnce(
  "Zframework/init.lua",
  "WS=         require'Zframework.websocket'",
  "WS=         require(SYSTEM=='Web' and 'Zframework.websocket_web' or 'Zframework.websocket')",
);

await replaceOnce(
  "parts/net.lua",
  "function NET.login(auto)\n    if not TASK.lock('login') then return end",
  "function NET.login(auto)\n    if SYSTEM=='Web' then\n        NET.ws_connect()\n        SCN.go('net_menu')\n        return\n    end\n    if not TASK.lock('login') then return end",
);

await replaceOnce(
  "parts/net.lua",
  "function NET.getUserInfo(uid)\n    TASK.new(function()",
  "function NET.getUserInfo(uid)\n    if SYSTEM=='Web' then return end\n    TASK.new(function()",
);

await replaceOnce(
  "parts/net.lua",
  "function NET.getAvatar(uid)\n    TASK.new(function()",
  "function NET.getAvatar(uid)\n    if SYSTEM=='Web' then return end\n    TASK.new(function()",
);

await replaceOnce(
  "parts/net.lua",
  "function NET.launchNotice()\n    TASK.new(function()",
  "function NET.launchNotice()\n    if SYSTEM=='Web' then return end\n    TASK.new(function()",
);

await replaceOnce(
  "parts/net.lua",
  "        for _,p in next,body.data.players do\n            NETPLY.add{",
  "        for _,p in next,body.data.players do\n            if SYSTEM=='Web' and p.username then\n                USERS.updateUserData{id=p.playerId,username=p.username,motto='',avatar_hash=''}\n            end\n            NETPLY.add{",
);

await replaceOnce(
  "parts/net.lua",
  "        local p=body.data\n        if NETPLY.exist(p.playerId) then",
  "        local p=body.data\n        if SYSTEM=='Web' and p.username then\n            USERS.updateUserData{id=p.playerId,username=p.username,motto='',avatar_hash=''}\n        end\n        if NETPLY.exist(p.playerId) then",
);

const netPath = path.join(sourceRoot, "parts/net.lua");
let netSource = await readFile(netPath, "utf8");
const uidStart = "    do-- Get UID\n";
const uidEnd = "\n    -- Initialize player setting";
const startIndex = netSource.indexOf(uidStart);
const endIndex = netSource.indexOf(uidEnd, startIndex);

if (startIndex < 0 || endIndex < 0) {
  throw new Error("Could not find the UID bootstrap block in parts/net.lua");
}

const nativeUidBlock = netSource.slice(startIndex, endIndex);
const webUidBlock = [
  "    if SYSTEM=='Web' then",
  "        local waitTime=0",
  "        while not USER.uid and waitTime<6.26 do",
  "            TEST.yieldT(.01)",
  "            WS.update(.01)",
  "            waitTime=waitTime+.01",
  "        end",
  "        if not USER.uid then",
  "            WS.close('game')",
  "            TEST.yieldUntilNextScene()",
  "            GAME.playing=false",
  "            SCN.backTo('main')",
  "            return",
  "        end",
  "    else",
  nativeUidBlock,
  "    end",
].join("\n");

netSource = netSource.slice(0, startIndex) + webUidBlock + netSource.slice(endIndex);
await writeFile(netPath, netSource, "utf8");
