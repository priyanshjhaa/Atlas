import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotionContextPage } from "@/components/features/notion-context";
import type {
  AtlasNotionCatchUpSnapshot,
  AtlasNotionReviewDocumentsResponse,
  AtlasWorkspace,
} from "@/lib/api-types";

const workspace: AtlasWorkspace = {
  id: "workspace-1",
  name: "Atlas",
  slug: "atlas",
  role: "member",
  repositoryCount: 2,
  onboardingCompletedAt: "2026-08-01T00:00:00.000Z",
};

const snapshot: AtlasNotionCatchUpSnapshot = {
  workspaceId: workspace.id,
  range: {
    from: "2026-08-13T05:00:00.000Z",
    through: "2026-08-20T05:00:00.000Z",
    firstVisit: true,
  },
  availability: "ready",
  counts: { documents: 1, newDocuments: 0, changedDocuments: 1 },
  documents: [
    {
      documentId: "document-1",
      resourceId: "resource-1",
      changeType: "changed",
      title: "ADR: Session rotation",
      url: "https://notion.so/session-rotation",
      currentRevision: "revision-2",
      previousRevision: "revision-1",
      changedAt: "2026-08-20T04:00:00.000Z",
      lastEditedAt: "2026-08-20T03:00:00.000Z",
      lastSyncedAt: "2026-08-20T04:00:00.000Z",
      truncated: false,
      baselineUnavailable: false,
      changedSections: [
        {
          heading: "Decision",
          changeType: "changed",
          excerpt: "Refresh tokens rotate after successful use.",
        },
      ],
      citationIds: ["notion-revision:version-2"],
    },
  ],
  citations: [
    {
      id: "notion-revision:version-2",
      provider: "notion",
      documentId: "document-1",
      resourceId: "resource-1",
      title: "ADR: Session rotation",
      url: "https://notion.so/session-rotation",
      sourceRevision: "revision-2",
      capturedAt: "2026-08-20T04:00:00.000Z",
      lastEditedAt: "2026-08-20T03:00:00.000Z",
      heading: "Decision",
      provenance: "notion_document_revision",
    },
  ],
  truncated: false,
};

const reviewDocuments: AtlasNotionReviewDocumentsResponse = {
  availability: "ready",
  documents: [
    {
      documentId: "document-1",
      resourceId: "resource-1",
      title: "ADR: Session rotation",
      url: "https://notion.so/session-rotation",
      lastSyncedAt: "2026-08-20T05:00:00.000Z",
      currentRevision: "revision-2",
      reviewable: true,
      revisions: [
        {
          id: "version-2",
          sourceRevision: "revision-2",
          capturedAt: "2026-08-20T05:00:00.000Z",
          truncated: false,
          isCurrent: true,
        },
        {
          id: "version-1",
          sourceRevision: "revision-1",
          capturedAt: "2026-08-19T05:00:00.000Z",
          truncated: false,
          isCurrent: false,
        },
      ],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NotionContextPage", () => {
  it("does not acknowledge a catch-up snapshot when the page opens", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<NotionContextPage workspace={workspace} initialSnapshot={snapshot} />);

    expect(screen.getByText("Documents in this catch-up")).toBeInTheDocument();
    expect(screen.getByText("ADR: Session rotation")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("advances the personal cursor only through the explicit action", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        acknowledgedThrough: snapshot.range.through,
        advanced: true,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<NotionContextPage workspace={workspace} initialSnapshot={snapshot} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark caught up" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Marked caught up" }),
      ).toBeDisabled(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notion/context/acknowledge",
      expect.objectContaining({
        body: JSON.stringify({
          workspaceId: workspace.id,
          acknowledgedThrough: snapshot.range.through,
        }),
      }),
    );
  });

  it("asks a Notion-only question and renders original-resource citations", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "generated",
        query: "What is the session policy?",
        answer: "Refresh tokens rotate after successful use.",
        lowConfidence: false,
        citationIds: ["notion-chunk:chunk-1"],
        citations: [
          {
            ...snapshot.citations[0],
            id: "notion-chunk:chunk-1",
            provenance: "indexed_notion_chunk",
          },
        ],
        suggestedQuestions: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<NotionContextPage workspace={workspace} initialSnapshot={snapshot} />);

    fireEvent.click(screen.getByRole("button", { name: "Ask — answers from Notion only" }));
    fireEvent.change(screen.getByLabelText("Your question"), {
      target: { value: "What is the session policy?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask Notion" }));

    expect(
      await screen.findByText("Refresh tokens rotate after successful use."),
    ).toBeInTheDocument();
    const citation = screen.getByRole("link", {
      name: /ADR: Session rotation/,
    });
    expect(citation).toHaveAttribute(
      "href",
      "https://notion.so/session-rotation",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notion/context/questions",
      expect.objectContaining({
        body: JSON.stringify({
          workspaceId: workspace.id,
          query: "What is the session policy?",
        }),
      }),
    );
  });

  it("keeps OAuth and resource selection in Sources", () => {
    render(
      <NotionContextPage
        workspace={workspace}
        initialSnapshot={{
          ...snapshot,
          availability: "not_connected",
          counts: { documents: 0, newDocuments: 0, changedDocuments: 0 },
          documents: [],
          citations: [],
        }}
      />,
    );

    expect(screen.getByRole("link", { name: /Manage Notion sources/ })).toHaveAttribute(
      "href",
      "/app/sources",
    );
  });

  it("runs an explicit revision review and renders grounded review sections", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "review-1",
        workspaceId: workspace.id,
        status: "generated",
        cached: false,
        createdAt: "2026-08-20T06:00:00.000Z",
        document: {
          documentId: "document-1",
          title: "ADR: Session rotation",
          url: "https://notion.so/session-rotation",
          currentRevision: "revision-2",
          previousRevision: "revision-1",
          currentCapturedAt: "2026-08-20T05:00:00.000Z",
          previousCapturedAt: "2026-08-19T05:00:00.000Z",
          sourceAvailable: true,
        },
        whatChanged: [
          {
            text: "The session policy now requires rotating refresh tokens.",
            citationIds: ["notion-review-current:version-2"],
          },
        ],
        decisionsAdded: [],
        decisionsRemoved: [],
        decisionsModified: [],
        contradictions: [],
        potentiallySuperseded: [],
        missingRationale: [],
        unresolvedQuestions: [],
        limitations: [],
        revisionComparison: {
          stats: { added: 1, removed: 1, unchanged: 1 },
          truncated: false,
          rows: [
            {
              kind: "unchanged",
              previousLine: 1,
              currentLine: 1,
              previousText: "# Decision",
              currentText: "# Decision",
              hiddenLines: 0,
            },
            {
              kind: "modified",
              previousLine: 2,
              currentLine: 2,
              previousText: "Refresh tokens remain persistent.",
              currentText: "Refresh tokens rotate after use.",
              hiddenLines: 0,
            },
          ],
        },
        citations: [
          {
            ...snapshot.citations[0],
            id: "notion-review-current:version-2",
            title: "ADR: Session rotation — current revision",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <NotionContextPage
        workspace={workspace}
        initialSnapshot={snapshot}
        initialReviewDocuments={reviewDocuments}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review — compare retained Notion revisions",
      }),
    );
    expect(screen.getByText("See how a decision changed—not merely that it changed.")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review selected revisions" }),
    );

    expect(
      await screen.findByText(
        "The session policy now requires rotating refresh tokens.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Contradictions")).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Changed Notion revision lines" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Refresh tokens remain persistent.")).toBeInTheDocument();
    expect(screen.getByText("Refresh tokens rotate after use.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open saved review/ }),
    ).toHaveAttribute("href", "/app/context/reviews/review-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notion/context/reviews",
      expect.objectContaining({
        body: JSON.stringify({
          workspaceId: workspace.id,
          documentId: "document-1",
          previousVersionId: "version-1",
        }),
      }),
    );
  });

  it("explains when synchronized documents do not yet have retained history", () => {
    render(
      <NotionContextPage
        workspace={workspace}
        initialSnapshot={snapshot}
        initialReviewDocuments={{
          availability: "ready",
          documents: [
            {
              ...reviewDocuments.documents[0],
              reviewable: false,
              revisions: [reviewDocuments.documents[0].revisions[0]],
            },
          ],
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review — compare retained Notion revisions",
      }),
    );
    expect(
      screen.getByText("No document has two retained revisions yet."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Check synchronization/ })).toHaveAttribute(
      "href",
      "/app/sources",
    );
  });

  it("keeps persisted reviews discoverable through stable workspace links", () => {
    render(
      <NotionContextPage
        workspace={workspace}
        initialSnapshot={snapshot}
        initialReviewDocuments={reviewDocuments}
        initialSavedReviews={[
          {
            id: "review-saved",
            status: "generated",
            createdAt: "2026-08-20T06:00:00.000Z",
            document: {
              documentId: "document-1",
              title: "ADR: Session rotation",
              url: "https://notion.so/session-rotation",
              currentRevision: "revision-2",
              previousRevision: "revision-1",
              sourceAvailable: true,
            },
            findingCount: 4,
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review — compare retained Notion revisions",
      }),
    );

    expect(screen.getByText("Return to an earlier reading")).toBeInTheDocument();
    expect(screen.getByText("4 findings")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open saved review/ }),
    ).toHaveAttribute("href", "/app/context/reviews/review-saved");
  });
});
