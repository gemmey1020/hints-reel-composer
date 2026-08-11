import { describe, expect, it } from "vitest";
import { parseRenderRequest } from "../server/renderRequest.ts";

describe("render request contract", () => {
  it("accepts a complete supported request", () => {
    expect(parseRenderRequest({ projectId: "project-one", sequenceId: "sequence-one", preset: "delivery" }))
      .toEqual({ projectId: "project-one", sequenceId: "sequence-one", preset: "delivery" });
  });

  it.each([
    [{ sequenceId: "sequence-one", preset: "draft" }, "project"],
    [{ projectId: "project-one", preset: "draft" }, "sequence"],
    [{ projectId: "project-one", sequenceId: "sequence-one", preset: "unknown" }, "preset"],
    [{ projectId: "../escape", sequenceId: "sequence-one", preset: "draft" }, "project"]
  ])("rejects malformed requests as client errors", (payload, message) => {
    try {
      parseRenderRequest(payload);
      throw new Error("Expected parseRenderRequest to reject.");
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 400 });
      expect((error as Error).message.toLowerCase()).toContain(message);
    }
  });
});
