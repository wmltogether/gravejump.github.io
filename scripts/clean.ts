import { cleanOutput } from "./output.ts";
await cleanOutput();
console.log("Cleared generated dist/. Source files and dependencies were preserved.");
