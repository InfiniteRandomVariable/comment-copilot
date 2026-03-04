export default function SkillsPage() {
  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1 style={{ margin: 0 }}>Skill Versions</h1>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>How it works</h2>
        <ol>
          <li>Owner saves persona controls (expertise, personality, age range).</li>
          <li>System analyzes titles and historical interactions.</li>
          <li>Compiler creates a draft `SKILL.md` version.</li>
          <li>Owner approves or rejects. Only approved version becomes active.</li>
        </ol>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Current active sections</h2>
        <p>
          Agent Identity, Brand Voice, Expertise Scope, Intent Playbook, Safety
          Guardrails, Escalation Rules, Example Responses, Prohibited Content.
        </p>
      </section>
    </div>
  );
}
