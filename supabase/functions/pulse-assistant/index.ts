import { POST } from "./handler.ts";
Deno.serve((request:Request)=>request.method==="POST"?POST(request):Response.json({error:"Method not allowed."},{status:405,headers:{Allow:"POST"}}));
