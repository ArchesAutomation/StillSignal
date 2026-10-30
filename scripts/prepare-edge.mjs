import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
async function writeServer(path, source) {
  const previous = await readFile(path, "utf8").catch(() => "");
  await writeFile(
    path,
    previous.includes("\r\n") ? source.replace(/\r?\n/g, "\r\n") : source,
  );
}
const common = await readFile("src/lib/server.ts", "utf8");
const edgeServer = common
  .replace('"@supabase/supabase-js"', '"npm:@supabase/supabase-js@2.117.3"')
  .replace(
    /process\.env\.NEXT_PUBLIC_SUPABASE_URL/g,
    'Deno.env.get("SUPABASE_URL")',
  )
  .replace(
    /process\.env\.SUPABASE_SECRET_KEY\s*\|\|\s*process\.env\.SUPABASE_SERVICE_ROLE_KEY/g,
    '(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))',
  );
const validation = (await readFile("src/lib/validation.ts", "utf8"))
  .replace('"./blueprint-schema"', '"./blueprint-schema.ts"')
  .replace('"zod"', '"npm:zod@4.6.7"');
for (const [name, source] of [
  ["pulse-data", "data"],
  ["pulse-tradingview", "tradingview"],
]) {
  const directory = `supabase/functions/${name}`;
  await mkdir(directory, { recursive: true });
  const handler = (await readFile(`src/lib/handlers/${source}.ts`, "utf8"))
    .replace('"@/lib/validation"', '"./validation.ts"')
    .replace('"@/lib/server"', '"./server.ts"')
    .replace('"@/lib/tradingview"', '"./tradingview.ts"');
  const tradingview = (await readFile("src/lib/tradingview.ts", "utf8"))
    .replace('"@js-temporal/polyfill"', '"npm:@js-temporal/polyfill@0.5.1"')
    .replace('"./model"', '"./model.ts"')
    .replace('"./validation"', '"./validation.ts"');
  await writeFile(`${directory}/tradingview.ts`, tradingview);
  await writeFile(
    `${directory}/model.ts`,
    (await readFile("src/lib/model.ts", "utf8")).replace(
      '"./blueprint-schema"',
      '"./blueprint-schema.ts"',
    ),
  );
  await writeFile(`${directory}/handler.ts`, handler);
  await writeServer(`${directory}/server.ts`, edgeServer);
  await writeFile(`${directory}/validation.ts`, validation);
  await writeFile(
    `${directory}/blueprint-schema.ts`,
    (await readFile("src/lib/blueprint-schema.ts", "utf8")).replace(
      '"zod"',
      '"npm:zod@4.6.7"',
    ),
  );
  await writeFile(
    `${directory}/index.ts`,
    'import {POST} from "./handler.ts";\nDeno.serve((request:Request)=>{if(request.method!=="POST")return Response.json({error:"Method not allowed."},{status:405,headers:{Allow:"POST"}});return POST(request);});\n',
  );
  await writeFile(
    `${directory}/deno.json`,
    JSON.stringify(
      { compilerOptions: { strict: true }, nodeModulesDir: "auto" },
      null,
      2,
    ) + "\n",
  );
}
// New broker/market handlers are generated from the same reviewed source tree.
for (const [name, source] of [
  ["pulse-brokers", "brokers"],
  ["pulse-market", "market"],
  ["pulse-broker-webhook", "broker-webhook"],
  ["pulse-extension", "extension"],
  ["pulse-process", "process"],
]) {
  const directory = "supabase/functions/" + name;
  await mkdir(directory, { recursive: true });
  const edge = (text, relative = ".") =>
    text
      .replace(
        /from ["']@\/lib\/([^"']+)["']/g,
        (_, path) => 'from "' + relative + "/" + path + '.ts"',
      )
      .replace(
        /from ["'](\.{1,2}\/[^"']+)["']/g,
        (_, path) =>
          'from "' + (path.endsWith(".ts") ? path : path + ".ts") + '"',
      )
      .replace(
        /import\(["'](\.{1,2}\/[^"']+)["']\)/g,
        (_, path) => 'import("' + path + '.ts")',
      )
      .replace(
        /process\.env\.([A-Z_]+)/g,
        (_, key) => 'Deno.env.get("' + key + '")',
      )
      .replace(/process\.env/g, "Deno.env.toObject()")
      .replace('"zod"', '"npm:zod@4.6.7"');
  await writeFile(
    directory + "/handler.ts",
    edge(await readFile("src/lib/handlers/" + source + ".ts", "utf8")),
  );
  await writeServer(directory + "/server.ts", edgeServer);
  for (const file of source === "process"
    ? [
        "model.ts",
        "validation.ts",
        "blueprint-schema.ts",
        "trade-context.ts",
        "smart-journal.ts",
        "analytics.ts",
      ]
    : source === "extension"
      ? ["model.ts", "validation.ts", "blueprint-schema.ts", "journal-command.ts"]
      : ["model.ts", "validation.ts", "blueprint-schema.ts", "analytics.ts", "trade-context.ts"])
    await writeFile(
      directory + "/" + file,
      edge(await readFile("src/lib/" + file, "utf8")),
    );
  for (const sub of source === "process"
    ? ["process", "environment"]
    : source === "extension"
      ? []
      : ["brokers", "market"]) {
    await mkdir(directory + "/" + sub, { recursive: true });
    for (const file of await readdir("src/lib/" + sub)) {
      if (
        !file.endsWith(".ts") ||
        (source === "process" && file === "storage.ts")
      )
        continue;
      await writeFile(
        directory + "/" + sub + "/" + file,
        edge(await readFile("src/lib/" + sub + "/" + file, "utf8"), ".."),
      );
    }
  }
  await writeFile(
    directory + "/index.ts",
    'import { POST } from "./handler.ts";\nDeno.serve((request:Request)=>request.method==="POST"?POST(request):Response.json({error:"Method not allowed."},{status:405,headers:{Allow:"POST"}}));\n',
  );
  await writeFile(
    directory + "/deno.json",
    JSON.stringify(
      { compilerOptions: { strict: true }, nodeModulesDir: "auto" },
      null,
      2,
    ) + "\n",
  );
}
console.log("Prepared seven source-generated Supabase Edge Functions.");
