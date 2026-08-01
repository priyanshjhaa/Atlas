"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  GitBranch,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import { AtlasGraph } from "@/components/atlas-graph";
import {
  MetricCard,
  PageHeader,
  StatusDot,
  type Metric,
} from "@/components/app/shared";
import type {
  AtlasGraph as AtlasGraphData,
  AtlasRepository,
  AtlasSyncJob,
  AtlasWorkspace,
} from "@/lib/api-types";

export function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatJobTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DashboardPage({
  userName,
  workspace,
  repositories,
  jobs,
  graph,
}: {
  userName: string;
  workspace: AtlasWorkspace;
  repositories: AtlasRepository[];
  jobs: AtlasSyncJob[];
  graph: AtlasGraphData | null;
}) {
  const firstName = userName.trim().split(/\s+/)[0] || userName;
  const [greeting, setGreeting] = useState("Welcome");

  useEffect(() => {
    const updateGreeting = () =>
      setGreeting(greetingForHour(new Date().getHours()));
    updateGreeting();
    const interval = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const activeRepositories = repositories.filter(
    (repository) => repository.isActive,
  );
  const indexedRepositories = activeRepositories.filter(
    (repository) => repository.lastSyncedAt,
  );
  const runningJobs = jobs.filter((job) =>
    ["queued", "running"].includes(job.status),
  );
  const completedJobs = jobs.filter((job) => job.status === "completed");
  const coverage = activeRepositories.length
    ? Math.round(
        (indexedRepositories.length / activeRepositories.length) * 100,
      )
    : 0;
  const metrics: Metric[] = [
    {
      label: "Repositories",
      value: String(repositories.length),
      change: `${activeRepositories.length} active`,
      tone: "orange",
    },
    {
      label: "Index coverage",
      value: `${coverage}%`,
      change: `${indexedRepositories.length} synchronized`,
      tone: "lime",
    },
    {
      label: "Active syncs",
      value: String(runningJobs.length),
      change: runningJobs.length ? "processing now" : "queue clear",
      tone: "violet",
    },
    {
      label: "Completed syncs",
      value: String(completedJobs.length),
      change: `${jobs.length} recent jobs`,
      tone: "cyan",
    },
  ];
  const suggestedQuestions = useMemo(() => {
    const names = indexedRepositories.map((repository) => repository.name);
    if (!names.length) {
      return [
        "Which repository should we synchronize first?",
        "What context is missing from this workspace?",
        "How can we prepare the first impact analysis?",
      ];
    }
    return [
      `What depends on ${names[0]}?`,
      names[1]
        ? `How does ${names[0]} connect to ${names[1]}?`
        : `Which public APIs does ${names[0]} expose?`,
      `What changed most recently in ${workspace.name}?`,
    ];
  }, [indexedRepositories, workspace.name]);

  return (
    <>
      <PageHeader
        eyebrow="Workspace overview"
        title={`${greeting}, ${firstName}.`}
        detail={`${workspace.name} has ${repositories.length} ${
          repositories.length === 1 ? "repository" : "repositories"
        }, with ${indexedRepositories.length} synchronized and ready for analysis.`}
        action={
          <Link className="button button--primary" href="/app/impact/new">
            <Zap size={16} /> Analyze a change
          </Link>
        }
      />
      <div className="metrics-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel panel--graph">
          <div className="panel-heading">
            <div>
              <span>Live system map</span>
              <h2>Connected architecture</h2>
            </div>
            <Link href="/app/graph">
              Open graph <ArrowRight size={14} />
            </Link>
          </div>
          <AtlasGraph
            compact
            graph={graph}
            repositories={activeRepositories}
          />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span>Suggested investigations</span>
              <h2>Ask Atlas</h2>
            </div>
            <Sparkles size={18} />
          </div>
          <div className="question-list">
            {suggestedQuestions.map((question, index) => (
              <Link
                href={index === 0 ? "/app/impact/new" : "/app/search"}
                key={question}
              >
                <span>0{index + 1}</span>
                <p>{question}</p>
                <ArrowRight size={15} />
              </Link>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span>Repository coverage</span>
              <h2>Sources to inspect</h2>
            </div>
            <GitBranch size={18} />
          </div>
          <div className="pr-list">
            {activeRepositories.slice(0, 4).map((repository) => (
              <article key={repository.id}>
                <StatusDot
                  state={repository.lastSyncedAt ? "ready" : "warning"}
                />
                <div>
                  <b>
                    {repository.owner}/{repository.name}
                  </b>
                  <p>
                    {repository.defaultBranch ?? "No default branch"} ·{" "}
                    {repository.lastSyncedAt
                      ? `indexed ${new Intl.DateTimeFormat("en", {
                          dateStyle: "medium",
                        }).format(new Date(repository.lastSyncedAt))}`
                      : "not synchronized"}
                  </p>
                </div>
              </article>
            ))}
            {!activeRepositories.length && (
              <div className="empty-state">
                <GitBranch size={20} />
                <h2>No repositories connected</h2>
                <p>Connect GitHub to populate the workspace overview.</p>
              </div>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span>Repository intelligence</span>
              <h2>Index activity</h2>
            </div>
            <Link href="/app/activity">View all</Link>
          </div>
          <div className="timeline timeline--compact">
            {jobs.slice(0, 3).map((job) => (
              <div key={job.id}>
                <StatusDot
                  state={
                    ["queued", "running"].includes(job.status)
                      ? "running"
                      : job.status === "failed"
                        ? "warning"
                        : "ready"
                  }
                />
                <span>{formatJobTime(job.createdAt)}</span>
                <p>
                  <b>
                    {job.repositoryOwner}/{job.repositoryName}
                  </b>
                  <small>
                    {job.stage.replaceAll("_", " ")} · {job.progress}%
                  </small>
                </p>
              </div>
            ))}
            {!jobs.length && (
              <div className="empty-state">
                <RefreshCw size={20} />
                <h2>No synchronization activity</h2>
                <p>Queued repository jobs will appear here.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
