import { readFile, writeFile, mkdir } from "node:fs/promises";
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
const validation = (await readFile("src/lib/validation.ts", "utf8")).replace(
  '"zod"',
  '"npm:zod@4.6.7"',
);
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
    await readFile("src/lib/model.ts", "utf8"),
  );
  await writeFile(`${directory}/handler.ts`, handler);
  await writeFile(`${directory}/server.ts`, edgeServer);
  await writeFile(`${directory}/validation.ts`, validation);
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
console.log("Prepared two authenticated/token-scoped Supabase Edge Functions.");
