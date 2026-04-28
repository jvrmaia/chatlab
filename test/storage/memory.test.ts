import { MemoryAdapter } from "../../src/storage/memory.js";
import { runStorageBattery } from "./_battery.js";

runStorageBattery("memory", () => new MemoryAdapter());
