"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  FileText,
  GitBranch,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  AtlasGitHubConnector,
  AtlasNotionConnector,
  AtlasNotionResource,
  AtlasNotionSyncJob,
  AtlasRepository,
  AtlasSyncJob,
  AtlasWorkspace,
} from "@/lib/api-types";

type PendingAction = "github" | "notion" | "complete" | null;

function resultMessage(result: {
  github?: string;
  notion?: string;
}): { tone: "success" | "error"; text: string } | null {
  if (result.notion === "connected") {
    return {
      tone: "success",
      text: "Notion is connected. Review the shared context below, then enter Atlas.",
    };
  }
  if (result.github === "connected") {
    return {
      tone: "success",
      text: "GitHub repository access is connected. Atlas is ready to synchronize selected repositories.",
    };
  }
  if (result.notion === "cancelled" || result.github === "cancelled") {
    return {
      tone: "error",
      text: "Connection was cancelled. Nothing was changed, and you can try again when ready.",
    };
  }
  if (result.notion === "error" || result.github === "error") {
    return {
      tone: "error",
      text: "Atlas could not complete the connection. Check the provider configuration and try again.",
    };
  }
  return null;
}

export function OnboardingPage({
  workspace,
  repositories,
  githubConnectors,
  notionConnectors,
  notionResources,
  githubJobs,
  notionJobs,
  githubConfigured,
  notionConfigured,
  result,
}: {
  workspace: AtlasWorkspace;
  repositories: AtlasRepository[];
  githubConnectors: AtlasGitHubConnector[];
  notionConnectors: AtlasNotionConnector[];
  notionResources: AtlasNotionResource[];
  githubJobs: AtlasSyncJob[];
  notionJobs: AtlasNotionSyncJob[];
  githubConfigured: boolean;
  notionConfigured: boolean;
  result: { github?: string; notion?: string };
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState("");
  const githubConnector = githubConnectors.find(
    (connector) => connector.status === "active",
  );
  const notionConnector = notionConnectors.find(
    (connector) => connector.status === "active",
  );
  const activeRepositories = repositories.filter(
    (repository) => repository.isActive,
  );
  const selectedNotionResources = notionResources.filter(
    (resource) => resource.isActive && resource.isSelected,
  );
  const latestGitHubJob = githubJobs[0];
  const latestNotionJob = notionJobs[0];
  const notice = resultMessage(result);

  function connect(provider: "github" | "notion") {
    setPending(provider);
    const path = provider === "github" ? "/api/github/install" : "/api/notion/install";
    window.location.assign(
      `${path}?workspaceId=${encodeURIComponent(workspace.id)}&returnTo=onboarding`,
    );
  }

  async function complete() {
    setPending("complete");
    setError("");
    const response = await fetch("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(body?.message ?? "Atlas could not complete workspace setup.");
      setPending(null);
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <div className="onboarding-page">
      <header className="onboarding-intro">
        <div>
          <span><Sparkles size={14} /> Workspace setup</span>
          <h1>Bring code and decisions into one living map.</h1>
          <p>
            GitHub authenticated your Atlas identity. Now choose the engineering
            sources {workspace.name} may use. Repository and Notion access stay
            separate, explicit, and revocable.
          </p>
        </div>
        <div className="onboarding-principle">
          <ShieldCheck size={20} />
          <div><b>Read-only by design</b><span>You control every connected source.</span></div>
        </div>
      </header>

      {notice && (
        <p className={`onboarding-notice onboarding-notice--${notice.tone}`} role="status">
          {notice.text}
        </p>
      )}
      {error && <p className="onboarding-notice onboarding-notice--error" role="alert">{error}</p>}

      <section className="onboarding-steps" aria-label="Workspace setup progress">
        <div className="is-complete"><i><Check size={12} /></i><span>Identity</span><b>GitHub sign-in</b></div>
        <div className={githubConnector ? "is-complete" : ""}><i>{githubConnector ? <Check size={12} /> : "2"}</i><span>Code context</span><b>Repositories</b></div>
        <div className={notionConnector ? "is-complete" : ""}><i>{notionConnector ? <Check size={12} /> : "3"}</i><span>Decision context</span><b>Notion · optional</b></div>
      </section>

      <div className="onboarding-source-grid">
        <article className={`onboarding-source ${githubConnector ? "is-connected" : ""}`}>
          <div className="onboarding-source__top"><i><GitBranch size={20} /></i><span>{githubConnector ? "Connected" : "Recommended"}</span></div>
          <h2>GitHub repositories</h2>
          <p>Map packages, files, symbols, pull requests, history, and dependency paths using a dedicated GitHub App.</p>
          <dl>
            <div><dt>Repositories</dt><dd>{activeRepositories.length}</dd></div>
            <div><dt>Last activity</dt><dd>{latestGitHubJob?.status ?? "Not synchronized"}</dd></div>
          </dl>
          <button className="button button--primary" onClick={() => connect("github")} disabled={pending !== null || !githubConfigured}>
            {pending === "github" ? <LoaderCircle className="spin" size={15} /> : <GitBranch size={15} />}
            {githubConnector ? "Review GitHub access" : githubConfigured ? "Connect repositories" : "GitHub App not configured"}
          </button>
        </article>

        <article className={`onboarding-source onboarding-source--notion ${notionConnector ? "is-connected" : ""}`}>
          <div className="onboarding-source__top"><i><FileText size={20} /></i><span>{notionConnector ? "Connected" : "Optional context"}</span></div>
          <h2>Notion workspace</h2>
          <p>Bring specifications, ADRs, technical designs, runbooks, and team decisions beside the code they explain.</p>
          <dl>
            <div><dt>Selected resources</dt><dd>{selectedNotionResources.length}</dd></div>
            <div><dt>Last activity</dt><dd>{latestNotionJob?.status ?? "Not synchronized"}</dd></div>
          </dl>
          <button className="button button--ghost" onClick={() => connect("notion")} disabled={pending !== null || !notionConfigured}>
            {pending === "notion" ? <LoaderCircle className="spin" size={15} /> : <span className="notion-button-mark">N</span>}
            {notionConnector ? "Review Notion access" : notionConfigured ? "Connect Notion" : "Notion OAuth not configured"}
          </button>
        </article>
      </div>

      <footer className="onboarding-footer">
        <div>
          <span>Setup is flexible</span>
          <p>You can change source access, selected resources, and synchronization from Sources at any time.</p>
        </div>
        <div className="onboarding-footer__actions">
          <Link href="/app/sources">Open source settings</Link>
          <button className="button button--primary" onClick={() => void complete()} disabled={pending !== null}>
            {pending === "complete" ? <LoaderCircle className="spin" size={15} /> : null}
            {githubConnector || notionConnector ? "Finish setup" : "Skip for now"}
            {pending !== "complete" && <ArrowRight size={15} />}
          </button>
        </div>
      </footer>
    </div>
  );
}
