export type PersonalityStyle =
  | "educator"
  | "witty"
  | "friendly"
  | "direct"
  | "luxury"
  | "playful";

export type AgeRange = "gen_z" | "young_adult" | "adult" | "mixed";

export type CommentIntent =
  | "praise"
  | "question"
  | "objection"
  | "spam"
  | "harassment"
  | "lead";

export type RiskLevel = "low" | "medium" | "high";

export type ReplyAction = "auto_send" | "require_approval" | "ignore" | "report";

export type SkillStatus = "draft" | "approved" | "rejected" | "active";

export interface PersonaProfile {
  accountId: string;
  expertiseTags: string[];
  personalityStyle: PersonalityStyle;
  ageRange: AgeRange;
}

export interface SkillVersion {
  accountId: string;
  version: number;
  status: SkillStatus;
  markdown: string;
  sourceSummary: {
    titleSignals: string[];
    interactionSignals: string[];
    generatedAt: string;
  };
}

export interface ReplyRoutingDecision {
  commentId: string;
  confidenceScore: number;
  riskScore: number;
  riskLevel: RiskLevel;
  action: ReplyAction;
  rationale: string;
}
