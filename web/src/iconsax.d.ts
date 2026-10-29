// <iconsax-icon> is registered by `import "iconsax"` in main.ts
declare module "svelte/elements" {
  export interface SvelteHTMLElements {
    "iconsax-icon": HTMLAttributes<HTMLElement> & {
      name: string;
      type?: "bold" | "broken" | "bulk" | "linear" | "outline" | "twotone";
      size?: number | string;
      color?: string;
      pro?: boolean;
    };
  }
}

export {};
