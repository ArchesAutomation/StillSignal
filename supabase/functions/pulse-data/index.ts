import {POST} from "./handler.ts";
Deno.serve((request:Request)=>{if(request.method!=="POST")return Response.json({error:"Method not allowed."},{status:405,headers:{Allow:"POST"}});return POST(request);});
