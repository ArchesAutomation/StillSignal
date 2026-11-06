// Hybrid browser/Worker app: use generated binding types without introducing
// Workers' DOM globals into the React/JSDOM TypeScript program.
declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}
