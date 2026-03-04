export default function HomePage() {
  return (
    <div className="grid" style={{ gap: 18 }}>
      <section className="card">
        <h1 style={{ marginTop: 0 }}>Realtime AI Comment Copilot</h1>
        <p>
          Standalone creator workflow for TikTok and Instagram comments with
          context-first generation, mandatory owner approval, and complete audit
          trails.
        </p>
      </section>

      <section className="grid grid-3">
        <article className="card">
          <div className="label">Pipeline</div>
          <div className="value">4 stages</div>
          <p>Context Builder {"->"} Intent {"->"} Draft {"->"} Human Review</p>
        </article>
        <article className="card">
          <div className="label">Posting mode</div>
          <div className="value">Approval-first</div>
          <p>Replies are posted only after approve or edit-and-send.</p>
        </article>
        <article className="card">
          <div className="label">Style skills</div>
          <div className="value">Versioned</div>
          <p>
            Combines generated <code>response_style_skill.md</code> and custom
            style injections.
          </p>
        </article>
      </section>
    </div>
  );
}
