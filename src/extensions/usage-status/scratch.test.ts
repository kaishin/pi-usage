import { beforeEach, expect, it, vi } from "vitest";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import usageStatusExtension from "./index.js";
import { fetchProviderQuotas, configLoader } from "../../config.js";

vi.mock("../../config.js", async (importOriginal) => await importOriginal());
// reuse the same mocks as index.test.ts by importing its setup? Instead re-mock:
