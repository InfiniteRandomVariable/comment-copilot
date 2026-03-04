import {
  sendCandidateAction,
  rejectCandidateAction
} from "./actions";
import { getConvexServerClient } from "../api/_lib/convexServer";
import Link from "next/link";

const PAGE_SIZE = 50;

type InboxItem = {
  task: {
    _id: string;
    createdAt: number;
    _creationTime: number;
  };
  candidate: {
    _id: string;
    text: string;
    intentLabel?: string;
    intentConfidence?: number;
    messageId?: string;
    personalizationSignals?: string[];
    contextSnapshotJson?: string;
    createdAt: number;
  };
  comment: {
    _id: string;
    text: string;
    status: string;
    platform: "instagram" | "tiktok";
    platformCommentId: string;
    platformPostId: string;
    commenterUsername?: string;
    sourceVideoTitle?: string;
  };
};

type AccountRecord = {
  _id: string;
  ownerUserId: string;
  handle: string;
  displayName: string;
};

function formatTimestamp(ts: number) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(ts));
}

function formatPercent(value?: number) {
  if (typeof value !== "number") return "-";
  return `${Math.round(value * 100)}%`;
}

function parseContextSummary(contextSnapshotJson?: string) {
  if (!contextSnapshotJson) {
    return "No context snapshot available.";
  }

  try {
    const parsed = JSON.parse(contextSnapshotJson) as {
      sourceVideoTitle?: string;
      creatorThemeSummary?: string;
      commenterProfileSummary?: { username?: string; bio?: string } | null;
      commenterLatestVideoSummary?: { title?: string } | null;
    };

    const segments = [
      parsed.sourceVideoTitle ? `Source: ${parsed.sourceVideoTitle}` : null,
      parsed.creatorThemeSummary
        ? `Creator theme: ${parsed.creatorThemeSummary}`
        : null,
      parsed.commenterProfileSummary?.username
        ? `Commenter: @${parsed.commenterProfileSummary.username}`
        : null,
      parsed.commenterLatestVideoSummary?.title
        ? `Commenter latest video: ${parsed.commenterLatestVideoSummary.title}`
        : null
    ].filter(Boolean);

    return segments.length > 0
      ? segments.join(" | ")
      : "Context snapshot captured.";
  } catch {
    return "Context snapshot captured.";
  }
}

function buildSourceVideoUrl(
  platform: "instagram" | "tiktok",
  accountHandle: string,
  platformPostId: string
) {
  if (!platformPostId) return null;
  if (platform === "tiktok") {
    return `https://www.tiktok.com/@${accountHandle}/video/${platformPostId}`;
  }
  return `https://www.instagram.com/p/${platformPostId}/`;
}

export default async function InboxPage({
  searchParams
}: {
  searchParams: Promise<{
    accountId?: string;
    cursor?: string;
    history?: string;
    result?: string;
    error?: string;
  }>;
}) {
  const { accountId, cursor, history, result, error } = await searchParams;
  const parsedCursor = Number(cursor ?? "");
  const beforeCreationTime =
    Number.isFinite(parsedCursor) && parsedCursor > 0
      ? parsedCursor
      : undefined;
  const historyTokens = (history ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(
      (entry) =>
        entry === "root" ||
        (entry.length > 0 &&
          Number.isFinite(Number(entry)) &&
          Number(entry) > 0)
    );
  const currentCursorToken = beforeCreationTime
    ? String(beforeCreationTime)
    : "root";

  let items: InboxItem[] = [];
  let visibleItems: InboxItem[] = [];
  let account: AccountRecord | null = null;
  let loadError: string | null = null;
  let hasNextPage = false;
  let nextCursor: number | null = null;

  if (accountId) {
    try {
      const client = getConvexServerClient();
      const [resolvedAccount, pendingItems] = await Promise.all([
        client.query("accounts:getAccountById" as never, {
          accountId
        } as never) as Promise<AccountRecord | null>,
        client.query("reviews:listPendingCandidates" as never, {
          accountId,
          limit: PAGE_SIZE + 1,
          beforeCreationTime
        } as never) as Promise<InboxItem[]>
      ]);

      account = resolvedAccount;
      items = pendingItems;
      visibleItems = items.slice(0, PAGE_SIZE);
      hasNextPage = items.length > PAGE_SIZE;
      nextCursor =
        hasNextPage && visibleItems.length > 0
          ? visibleItems[visibleItems.length - 1].task._creationTime
          : null;
    } catch (loadErr) {
      loadError =
        loadErr instanceof Error
          ? loadErr.message
          : "Unable to load pending candidates.";
    }
  }

  const nextHistoryTokens = [...historyTokens, currentCursorToken];
  const nextHistoryParam = nextHistoryTokens.join(",");
  const hasPreviousPage = historyTokens.length > 0 || Boolean(beforeCreationTime);
  const previousCursorToken =
    historyTokens.length > 0 ? historyTokens[historyTokens.length - 1] : "root";
  const previousHistoryTokens =
    historyTokens.length > 0 ? historyTokens.slice(0, -1) : [];
  const previousHistoryParam = previousHistoryTokens.join(",");

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1 style={{ margin: 0 }}>Inbox Review Queue</h1>
      <p style={{ marginTop: 0 }}>
        Every draft remains in <code>pending_review</code> until you approve,
        edit and send, or reject.
      </p>

      <section className="card">
        <form method="get" style={{ display: "grid", gap: 10 }}>
          <label className="label" htmlFor="accountId">
            Account ID
          </label>
          <input
            id="accountId"
            name="accountId"
            type="text"
            defaultValue={accountId ?? ""}
            placeholder="j5746ef9..."
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d8dedf",
              fontSize: 14
            }}
          />

          <button className="btn" type="submit" style={{ width: "fit-content" }}>
            Load Pending Queue
          </button>
        </form>

        {!accountId ? (
          <p style={{ marginTop: 12, color: "#59636e" }}>
            Enter an account ID to load the review queue.
          </p>
        ) : null}

        {result ? (
          <p style={{ marginTop: 12, color: "#0a7d40" }}>
            Last action succeeded: <strong>{result}</strong>
          </p>
        ) : null}

        {error ? (
          <p style={{ marginTop: 12, color: "#9f1239" }}>
            Action failed: {error}
          </p>
        ) : null}

        {loadError ? (
          <p style={{ marginTop: 12, color: "#9f1239" }}>
            Queue load failed: {loadError}
          </p>
        ) : null}
      </section>

      {account ? (
        <section className="grid grid-3">
          <article className="card">
            <div className="label">Account</div>
            <div className="value" style={{ fontSize: 18 }}>
              {account.displayName}
            </div>
            <p style={{ marginBottom: 0 }}>@{account.handle}</p>
          </article>
          <article className="card">
            <div className="label">Pending Candidates (Loaded)</div>
            <div className="value" style={{ fontSize: 24 }}>
              {visibleItems.length}
            </div>
            <p style={{ marginBottom: 0 }}>
              Most recent first ({PAGE_SIZE} per page)
            </p>
          </article>
          <article className="card">
            <div className="label">Owner User ID</div>
            <div style={{ fontSize: 12, wordBreak: "break-all", marginTop: 8 }}>
              {account.ownerUserId}
            </div>
          </article>
        </section>
      ) : null}

      {account && visibleItems.length === 0 ? (
        <section className="card">
          <p style={{ margin: 0 }}>
            No pending candidates for this account yet.
          </p>
        </section>
      ) : null}

      {account
        ? visibleItems.map((item) => (
            <section className="card" key={item.candidate._id}>
              <div
                style={{
                  display: "grid",
                  gap: 10
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    flexWrap: "wrap"
                  }}
                >
                  <div style={{ fontSize: 12, color: "#59636e" }}>
                    {item.comment.commenterUsername
                      ? `@${item.comment.commenterUsername}`
                      : "unknown commenter"}{" "}
                    | messageId: {item.candidate.messageId ?? "-"} | intent:{" "}
                    {item.candidate.intentLabel ?? "unknown"} (
                    {formatPercent(item.candidate.intentConfidence)})
                  </div>
                  <div style={{ fontSize: 12, color: "#59636e" }}>
                    {formatTimestamp(item.candidate.createdAt)}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#59636e" }}>
                  {buildSourceVideoUrl(
                    item.comment.platform,
                    account.handle,
                    item.comment.platformPostId
                  ) ? (
                    <a
                      href={
                        buildSourceVideoUrl(
                          item.comment.platform,
                          account.handle,
                          item.comment.platformPostId
                        ) ?? "#"
                      }
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#005f73", textDecoration: "underline" }}
                    >
                      Open source video
                    </a>
                  ) : (
                    "Source video link unavailable"
                  )}
                  <span> | </span>
                  <span>{parseContextSummary(item.candidate.contextSnapshotJson)}</span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    gridTemplateColumns: "minmax(0, 1fr)",
                    alignItems: "start",
                    marginTop: 2
                  }}
                >
                  <div>
                    <div className="label">Comment</div>
                    <div
                      style={{
                        marginTop: 6,
                        background: "#f7fbfc",
                        border: "1px solid #d8dedf",
                        borderRadius: 10,
                        padding: 10
                      }}
                    >
                      {item.comment.text}
                    </div>
                  </div>

                  <form action={sendCandidateAction} className="grid" style={{ gap: 8 }}>
                    <input type="hidden" name="accountId" value={account._id} />
                    <input
                      type="hidden"
                      name="cursor"
                      value={beforeCreationTime ? String(beforeCreationTime) : ""}
                    />
                    <input type="hidden" name="history" value={historyTokens.join(",")} />
                    <input
                      type="hidden"
                      name="ownerUserId"
                      value={account.ownerUserId}
                    />
                    <input
                      type="hidden"
                      name="candidateId"
                      value={item.candidate._id}
                    />
                    <input
                      type="hidden"
                      name="originalText"
                      value={item.candidate.text}
                    />
                    <label className="label" htmlFor={`reply-${item.candidate._id}`}>
                      Reply (click and edit directly)
                    </label>
                    <textarea
                      id={`reply-${item.candidate._id}`}
                      name="editedText"
                      defaultValue={item.candidate.text}
                      rows={4}
                      style={{
                        width: "100%",
                        borderRadius: 10,
                        border: "1px solid #d8dedf",
                        padding: 10,
                        fontFamily: "inherit",
                        fontSize: 14
                      }}
                    />
                    <button className="btn" type="submit">
                      Send Reply
                    </button>
                  </form>

                  <form action={rejectCandidateAction}>
                    <input type="hidden" name="accountId" value={account._id} />
                    <input
                      type="hidden"
                      name="cursor"
                      value={beforeCreationTime ? String(beforeCreationTime) : ""}
                    />
                    <input type="hidden" name="history" value={historyTokens.join(",")} />
                    <input
                      type="hidden"
                      name="ownerUserId"
                      value={account.ownerUserId}
                    />
                    <input
                      type="hidden"
                      name="candidateId"
                      value={item.candidate._id}
                    />
                    <button
                      type="submit"
                      style={{
                        border: "1px solid #ef4444",
                        background: "#fff1f2",
                        color: "#9f1239",
                        padding: "10px 14px",
                        borderRadius: 10,
                        fontWeight: 600
                      }}
                    >
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            </section>
          ))
        : null}

      {account && visibleItems.length > 0 ? (
        <section className="card" style={{ display: "flex", gap: 10 }}>
          {hasPreviousPage ? (
            <Link
              href={
                previousCursorToken === "root"
                  ? previousHistoryParam
                    ? `/inbox?accountId=${account._id}&history=${previousHistoryParam}`
                    : `/inbox?accountId=${account._id}`
                  : previousHistoryParam
                    ? `/inbox?accountId=${account._id}&cursor=${previousCursorToken}&history=${previousHistoryParam}`
                    : `/inbox?accountId=${account._id}&cursor=${previousCursorToken}`
              }
              className="btn secondary"
            >
              Previous
            </Link>
          ) : (
            <button className="btn secondary" disabled>
              Previous
            </button>
          )}
          {hasNextPage && nextCursor ? (
            <Link
              href={`/inbox?accountId=${account._id}&cursor=${nextCursor}&history=${nextHistoryParam}`}
              className="btn"
            >
              Next
            </Link>
          ) : (
            <button className="btn" disabled>
              Next
            </button>
          )}
        </section>
      ) : null}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Rules</h2>
        <ul>
          <li>No AI direct posting without approval.</li>
          <li>Approve or edit-and-send posts reply to the original message ID.</li>
          <li>Post-send like action runs automatically after successful send.</li>
        </ul>
      </section>
    </div>
  );
}
