import { mount } from "svelte";
import App from "./App.svelte";
// Registers <iconsax-icon>, the icon set doughmination.gay uses
import "iconsax";

mount(App, { target: document.getElementById("app")! });
