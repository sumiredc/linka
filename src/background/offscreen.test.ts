import { describe, expect, it, vi } from "vitest";
import { createOffscreenEnsurer } from "./offscreen";

function fakeApi(initial = false) {
  let exists = initial;
  const api = {
    hasDocument: vi.fn(async () => exists),
    createDocument: vi.fn(async () => {
      await Promise.resolve();
      if (exists) throw new Error("Only a single offscreen document may be created.");
      exists = true;
    }),
    close: () => {
      exists = false;
    },
  };
  return api;
}

describe("createOffscreenEnsurer", () => {
  it("creates the document once when called concurrently", async () => {
    const api = fakeApi();
    const ensure = createOffscreenEnsurer(api);
    await Promise.all([ensure(), ensure(), ensure()]);
    expect(api.createDocument).toHaveBeenCalledTimes(1);
  });

  it("reuses a document that already exists", async () => {
    const api = fakeApi(true);
    await createOffscreenEnsurer(api)();
    expect(api.createDocument).not.toHaveBeenCalled();
  });

  it("creates the document again after it was closed", async () => {
    const api = fakeApi();
    const ensure = createOffscreenEnsurer(api);
    await ensure();
    api.close();
    await ensure();
    expect(api.createDocument).toHaveBeenCalledTimes(2);
  });

  it("succeeds when creation fails because another creation already made the document", async () => {
    const api = fakeApi();
    api.hasDocument.mockResolvedValueOnce(false).mockResolvedValue(true);
    api.createDocument.mockRejectedValueOnce(new Error("Only a single offscreen document"));
    await expect(createOffscreenEnsurer(api)()).resolves.toBeUndefined();
  });

  it("fails when creation fails and no document exists", async () => {
    const api = fakeApi();
    api.createDocument.mockRejectedValueOnce(new Error("blocked"));
    await expect(createOffscreenEnsurer(api)()).rejects.toThrow("blocked");
  });
});
