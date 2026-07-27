import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedIdentity } from "../src/auth/auth.types";
import type { SyncJobsRepository } from "../src/sync/sync-jobs.repository";
import { SyncJobsService } from "../src/sync/sync-jobs.service";
import type { SyncQueueService } from "../src/sync/sync-queue.service";

const identity: AuthenticatedIdentity = {
  sessionId: "session-1",
  user: {
    id: "user-1",
    name: "Atlas User",
    email: "atlas@example.com",
    image: null,
  },
};

describe("SyncJobsService", () => {
  it("enqueues only newly persisted jobs and returns duplicates safely", async () => {
    const enqueue = vi.fn(async () => undefined);
    const jobs = {
      listActiveRepositories: vi.fn(async () => [
        { id: "15c54d8c-2222-4444-8888-84ef31cf03ce" },
        { id: "25c54d8c-2222-4444-8888-84ef31cf03ce" },
      ]),
      createQueued: vi
        .fn()
        .mockResolvedValueOnce({
          job: { id: "job-1", status: "queued" },
          created: true,
        })
        .mockResolvedValueOnce({
          job: { id: "job-2", status: "running" },
          created: false,
        }),
    } as unknown as SyncJobsRepository;
    const queue = {
      enqueue,
    } as unknown as SyncQueueService;
    const service = new SyncJobsService(jobs, queue);

    const result = await service.enqueue(
      "workspace-1",
      undefined,
      "request-1",
      identity,
    );

    expect(enqueue).toHaveBeenCalledOnce();
    expect(result).toEqual([
      { id: "job-1", status: "queued", deduplicated: false },
      { id: "job-2", status: "running", deduplicated: true },
    ]);
  });

  it("removes a waiting queue job before marking it cancelled", async () => {
    const remove = vi.fn(async () => undefined);
    const markCancelled = vi.fn(async () => undefined);
    const jobs = {
      find: vi.fn(async () => ({ id: "job-1", status: "queued" })),
      requestCancellation: vi.fn(async () => true),
      markCancelled,
    } as unknown as SyncJobsRepository;
    const queue = {
      getJob: vi.fn(async () => ({
        getState: vi.fn(async () => "waiting"),
        remove,
      })),
    } as unknown as SyncQueueService;
    const service = new SyncJobsService(jobs, queue);

    await expect(
      service.cancel("workspace-1", "job-1", identity),
    ).resolves.toEqual({ id: "job-1", status: "cancelled" });
    expect(remove).toHaveBeenCalledOnce();
    expect(markCancelled).toHaveBeenCalledWith("job-1", "user-1");
  });
});
