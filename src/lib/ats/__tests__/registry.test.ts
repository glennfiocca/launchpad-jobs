import { describe, it, expect, beforeEach } from "vitest";
import {
  registerProvider,
  getClient,
  getApplyStrategy,
  getDiscoveryValidator,
  getRegisteredProviders,
} from "../registry";
import type { AtsClient, AtsApplyStrategy, AtsDiscoveryValidator } from "../types";

// --- Stub factories ---

function makeStubClient(boardToken: string): AtsClient {
  return {
    provider: "GREENHOUSE",
    getBoard: async () => ({ name: boardToken, website: null, logoUrl: null }),
    getJobs: async () => [],
    getJobQuestions: async () => [],
  };
}

function makeStubApply(): AtsApplyStrategy {
  return {
    provider: "GREENHOUSE",
    apply: async () => ({ success: true }),
  };
}

function makeStubValidator(): AtsDiscoveryValidator {
  return {
    provider: "GREENHOUSE",
    validate: async () => ({ valid: true }),
  };
}

// --- Tests ---

describe("ATS Provider Registry", () => {
  beforeEach(() => {
    // Register a known provider for each test
    registerProvider("GREENHOUSE", {
      client: makeStubClient,
      apply: makeStubApply,
      validator: makeStubValidator,
    });
  });

  describe("registerProvider + getClient", () => {
    it("returns a client for a registered provider", () => {
      const client = getClient("GREENHOUSE", "acme-corp");
      expect(client.provider).toBe("GREENHOUSE");
    });

    it("passes boardToken through to the factory", async () => {
      const client = getClient("GREENHOUSE", "my-board");
      const board = await client.getBoard();
      expect(board.name).toBe("my-board");
    });
  });

  describe("getApplyStrategy", () => {
    it("returns an apply strategy for a registered provider", () => {
      const strategy = getApplyStrategy("GREENHOUSE");
      expect(strategy.provider).toBe("GREENHOUSE");
    });

    it("throws for an unregistered provider", () => {
      expect(() => getApplyStrategy("ASHBY" as never)).toThrow(
        /No apply strategy registered/
      );
    });
  });

  describe("getDiscoveryValidator", () => {
    it("returns a validator for a registered provider", () => {
      const validator = getDiscoveryValidator("GREENHOUSE");
      expect(validator.provider).toBe("GREENHOUSE");
    });

    it("throws for an unregistered provider", () => {
      expect(() => getDiscoveryValidator("ASHBY" as never)).toThrow(
        /No discovery validator registered/
      );
    });
  });

  describe("error on unregistered provider", () => {
    it("throws when getClient is called with an unregistered provider", () => {
      expect(() => getClient("ASHBY" as never, "foo")).toThrow(
        /No ATS client registered for provider: ASHBY/
      );
    });
  });

  describe("getRegisteredProviders", () => {
    it("returns an array containing the registered provider", () => {
      const providers = getRegisteredProviders();
      expect(providers).toContain("GREENHOUSE");
    });

    it("includes ASHBY after registration", () => {
      registerProvider("ASHBY", {
        client: (token: string) => ({
          ...makeStubClient(token),
          provider: "ASHBY",
        }),
        apply: () => ({ ...makeStubApply(), provider: "ASHBY" }),
        validator: () => ({ ...makeStubValidator(), provider: "ASHBY" }),
      });

      const providers = getRegisteredProviders();
      expect(providers).toContain("ASHBY");
      expect(providers).toContain("GREENHOUSE");
    });
  });
});
