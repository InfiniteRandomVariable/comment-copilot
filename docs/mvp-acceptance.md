# MVP Acceptance Criteria

1. Duplicate webhook deliveries do not create duplicate comment records.
2. Worker creates one reply candidate per processed comment.
3. Low-risk/high-confidence candidates auto-route to send.
4. Higher-risk candidates create pending approval tasks.
5. Reply approval creates a sent reply record and resolves task.
6. Unapproved skill versions are never used at runtime.
7. All workflow stages are logged to `agentRuns`.
8. Token reservations are created before generation and finalized after generation.
9. Free accounts receive warning events at 8k and hard-stop at >10k tokens.
10. After a message/comment is sent or rejected, Convex data for that message is deleted while minimal audit metadata is retained.
