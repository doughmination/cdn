// Text-module imports (see "rules" in wrangler.jsonc).
declare module "*.md" {
  const text: string;
  export default text;
}
