#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const STAGES = [
  {
    id: "stage-1",
    boundaryDoc: "docs/dev-phase-ops-hardening.md",
    evidenceDoc: "docs/ops/stage-1-evidence.md",
    items: 4
  },
  {
    id: "stage-2",
    boundaryDoc: "docs/dev-phase-stage-2-beta-readiness.md",
    evidenceDoc: "docs/ops/stage-2-evidence.md",
    items: 4
  },
  {
    id: "stage-3",
    boundaryDoc: "docs/dev-phase-stage-3-controlled-beta.md",
    evidenceDoc: "docs/ops/stage-3-evidence.md",
    items: 4
  },
  {
    id: "stage-4",
    boundaryDoc: "docs/dev-phase-stage-4-scale-launch.md",
    evidenceDoc: "docs/ops/stage-4-evidence.md",
    items: 4
  }
];

const REQUIRED_STAGE_SECTIONS = [
  "## Entry Gate",
  "## Phase Scope (Only)",
  "## Out Of Scope (Blocked During This Phase)",
  "## Autonomous Agent Rules",
  "## Required Test Gate (Must Pass)",
  "## Evidence Required",
  "## Definition Of Done",
  "## Exit Gate",
  "## Promotion Rule",
  "## Status Tracker",
  "## Deferred Work"
];

const STATUS_VALUES = new Set(["pending", "in progress", "done"]);
const TRACKER_BOOL_VALUES = new Set(["yes", "no", "partial", "n/a"]);
const EVIDENCE_PASS_VALUES = new Set(["PASS", "FAIL", "PENDING"]);

function readUtf8(baseDir, relPath) {
  const filePath = path.resolve(baseDir, relPath);
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${relPath}: ${message}`);
  }
}

function parsePolicy(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim();
  }

  const required = [
    "ACTIVE_STAGE_ID",
    "ACTIVE_BOUNDARY_DOC",
    "ACTIVE_EVIDENCE_DOC",
    "STAGE_SEQUENCE"
  ];

  for (const key of required) {
    if (!values[key]) {
      throw new Error(`Missing ${key} in docs/dev-phase-policy.md`);
    }
  }

  return {
    activeStageId: values.ACTIVE_STAGE_ID,
    activeBoundaryDoc: values.ACTIVE_BOUNDARY_DOC,
    activeEvidenceDoc: values.ACTIVE_EVIDENCE_DOC,
    stageSequence: values.STAGE_SEQUENCE.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  };
}

function normalizeStageStatus(value) {
  return value.trim().toLowerCase();
}

function parseStageDoc(text, stage, errors) {
  for (const section of REQUIRED_STAGE_SECTIONS) {
    if (!text.includes(section)) {
      errors.push(`${stage.id}: missing required section \`${section}\` in ${stage.boundaryDoc}`);
    }
  }

  if (!text.includes("`pnpm ci:check`")) {
    errors.push(`${stage.id}: missing required baseline command \`pnpm ci:check\` in ${stage.boundaryDoc}`);
  }
  if (!text.includes("`pnpm verify:phase-boundary`")) {
    errors.push(
      `${stage.id}: missing required policy command \`pnpm verify:phase-boundary\` in ${stage.boundaryDoc}`
    );
  }

  const stageStatusMatch = text.match(/^- Stage Status:\s*(.+)$/m);
  if (!stageStatusMatch) {
    errors.push(`${stage.id}: missing \`- Stage Status:\` in ${stage.boundaryDoc}`);
  }
  const stageStatus = stageStatusMatch ? normalizeStageStatus(stageStatusMatch[1]) : "pending";
  if (!STATUS_VALUES.has(stageStatus)) {
    errors.push(
      `${stage.id}: invalid Stage Status \`${stageStatusMatch ? stageStatusMatch[1] : ""}\` in ${stage.boundaryDoc}`
    );
  }

  const items = new Map();
  const itemRegex =
    /^- Item\s+(\d+)\s*\([^)]*\):\s*(Pending|In Progress|Done)\s*\|\s*Tests Passed:\s*(Yes|No|Partial|N\/A)\s*\|\s*Evidence Linked:\s*(Yes|No|Partial|N\/A)\s*\|\s*Owner Signoff:\s*(Yes|No|Partial|N\/A)\s*$/gm;

  let match = itemRegex.exec(text);
  while (match) {
    const itemNumber = Number.parseInt(match[1], 10);
    const status = normalizeStageStatus(match[2]);
    const testsPassed = match[3].toLowerCase();
    const evidenceLinked = match[4].toLowerCase();
    const ownerSignoff = match[5].toLowerCase();

    items.set(itemNumber, {
      status,
      testsPassed,
      evidenceLinked,
      ownerSignoff
    });

    if (!TRACKER_BOOL_VALUES.has(testsPassed)) {
      errors.push(`${stage.id}: item ${itemNumber} has invalid Tests Passed value \`${match[3]}\``);
    }
    if (!TRACKER_BOOL_VALUES.has(evidenceLinked)) {
      errors.push(`${stage.id}: item ${itemNumber} has invalid Evidence Linked value \`${match[4]}\``);
    }
    if (!TRACKER_BOOL_VALUES.has(ownerSignoff)) {
      errors.push(`${stage.id}: item ${itemNumber} has invalid Owner Signoff value \`${match[5]}\``);
    }

    if (status === "done") {
      if (testsPassed !== "yes" || evidenceLinked !== "yes" || ownerSignoff !== "yes") {
        errors.push(
          `${stage.id}: item ${itemNumber} is Done but tests/evidence/signoff are not all Yes in ${stage.boundaryDoc}`
        );
      }
    }

    match = itemRegex.exec(text);
  }

  for (let i = 1; i <= stage.items; i += 1) {
    if (!items.has(i)) {
      errors.push(`${stage.id}: missing status tracker row for item ${i} in ${stage.boundaryDoc}`);
    }
  }

  if (stageStatus === "done") {
    for (let i = 1; i <= stage.items; i += 1) {
      const item = items.get(i);
      if (!item) continue;
      if (item.status !== "done") {
        errors.push(`${stage.id}: Stage Status is Done but item ${i} is ${item.status}`);
      }
    }
  }

  return {
    stageStatus,
    items
  };
}

function parseEvidenceMetadata(text, key) {
  const regex = new RegExp(`^- ${key}:\\s*(.+)$`, "m");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

function parseEvidenceDoc(text, stage, errors) {
  const stageId = parseEvidenceMetadata(text, "Stage ID");
  const boundaryDoc = parseEvidenceMetadata(text, "Boundary Doc");
  const stageStatusRaw = parseEvidenceMetadata(text, "Stage Status");
  const exitGateApprovedRaw = parseEvidenceMetadata(text, "Exit Gate Approved");
  const ownerRaw = parseEvidenceMetadata(text, "Owner");
  const overallSignoffRaw = parseEvidenceMetadata(text, "Overall Signoff");

  if (!stageId) errors.push(`${stage.id}: missing Stage ID in ${stage.evidenceDoc}`);
  if (!boundaryDoc) errors.push(`${stage.id}: missing Boundary Doc in ${stage.evidenceDoc}`);
  if (!stageStatusRaw) errors.push(`${stage.id}: missing Stage Status in ${stage.evidenceDoc}`);
  if (!exitGateApprovedRaw) {
    errors.push(`${stage.id}: missing Exit Gate Approved in ${stage.evidenceDoc}`);
  }
  if (!ownerRaw) errors.push(`${stage.id}: missing Owner in ${stage.evidenceDoc}`);
  if (!overallSignoffRaw) {
    errors.push(`${stage.id}: missing Overall Signoff in ${stage.evidenceDoc}`);
  }

  if (stageId && stageId !== stage.id) {
    errors.push(`${stage.id}: Stage ID mismatch in ${stage.evidenceDoc} (found ${stageId})`);
  }
  if (boundaryDoc && boundaryDoc !== stage.boundaryDoc) {
    errors.push(
      `${stage.id}: Boundary Doc mismatch in ${stage.evidenceDoc} (found ${boundaryDoc}, expected ${stage.boundaryDoc})`
    );
  }

  const stageStatus = normalizeStageStatus(stageStatusRaw || "pending");
  if (stageStatusRaw && !STATUS_VALUES.has(stageStatus)) {
    errors.push(`${stage.id}: invalid Stage Status \`${stageStatusRaw}\` in ${stage.evidenceDoc}`);
  }

  const exitGateApproved = exitGateApprovedRaw.toLowerCase();
  if (exitGateApprovedRaw && exitGateApproved !== "yes" && exitGateApproved !== "no") {
    errors.push(
      `${stage.id}: Exit Gate Approved must be Yes/No in ${stage.evidenceDoc}, found \`${exitGateApprovedRaw}\``
    );
  }

  const overallSignoff = overallSignoffRaw.toLowerCase();
  if (
    overallSignoffRaw &&
    overallSignoff !== "approved" &&
    overallSignoff !== "pending" &&
    overallSignoff !== "rejected"
  ) {
    errors.push(
      `${stage.id}: Overall Signoff must be Approved/Pending/Rejected in ${stage.evidenceDoc}, found \`${overallSignoffRaw}\``
    );
  }

  const rowRegex =
    /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm;
  const rows = new Map();
  let rowMatch = rowRegex.exec(text);
  while (rowMatch) {
    const itemNumber = Number.parseInt(rowMatch[1], 10);
    const passFail = rowMatch[2].trim().toUpperCase();
    const requiredTests = rowMatch[3].trim();
    const artifacts = rowMatch[4].trim();
    const ownerSignoff = rowMatch[5].trim();
    const notes = rowMatch[6].trim();

    rows.set(itemNumber, {
      passFail,
      requiredTests,
      artifacts,
      ownerSignoff,
      notes
    });

    if (!EVIDENCE_PASS_VALUES.has(passFail)) {
      errors.push(`${stage.id}: item ${itemNumber} has invalid Pass/Fail value \`${passFail}\``);
    }

    if (!requiredTests || requiredTests.toLowerCase() === "pending") {
      errors.push(`${stage.id}: item ${itemNumber} has missing Required Tests in ${stage.evidenceDoc}`);
    }

    if (passFail === "PASS") {
      if (!artifacts || artifacts.toLowerCase() === "pending") {
        errors.push(
          `${stage.id}: item ${itemNumber} is PASS but Artifacts/Links is missing or Pending in ${stage.evidenceDoc}`
        );
      }
      if (ownerSignoff.toLowerCase() !== "approved") {
        errors.push(
          `${stage.id}: item ${itemNumber} is PASS but Owner Signoff is not Approved in ${stage.evidenceDoc}`
        );
      }
    }

    rowMatch = rowRegex.exec(text);
  }

  for (let i = 1; i <= stage.items; i += 1) {
    if (!rows.has(i)) {
      errors.push(`${stage.id}: missing evidence table row for item ${i} in ${stage.evidenceDoc}`);
    }
  }

  if (stageStatus === "done") {
    for (let i = 1; i <= stage.items; i += 1) {
      const row = rows.get(i);
      if (!row) continue;
      if (row.passFail !== "PASS") {
        errors.push(`${stage.id}: Stage Status is Done but evidence item ${i} is ${row.passFail}`);
      }
    }

    if (exitGateApproved !== "yes") {
      errors.push(`${stage.id}: Stage Status is Done but Exit Gate Approved is not Yes`);
    }
    if (overallSignoff !== "approved") {
      errors.push(`${stage.id}: Stage Status is Done but Overall Signoff is not Approved`);
    }
  }

  return {
    stageStatus,
    exitGateApproved,
    overallSignoff,
    rows
  };
}

function main() {
  const baseDir = process.cwd();
  const errors = [];

  let policy;
  try {
    const policyText = readUtf8(baseDir, "docs/dev-phase-policy.md");
    policy = parsePolicy(policyText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Phase boundary check failed: ${message}`);
    process.exit(2);
  }

  const stageById = new Map(STAGES.map((stage) => [stage.id, stage]));

  if (policy.stageSequence.join(",") !== STAGES.map((stage) => stage.id).join(",")) {
    errors.push(
      `docs/dev-phase-policy.md STAGE_SEQUENCE mismatch: expected ${STAGES.map((stage) => stage.id).join(",")}`
    );
  }

  const activeStage = stageById.get(policy.activeStageId);
  if (!activeStage) {
    errors.push(`Unknown ACTIVE_STAGE_ID in docs/dev-phase-policy.md: ${policy.activeStageId}`);
  } else {
    if (policy.activeBoundaryDoc !== activeStage.boundaryDoc) {
      errors.push(
        `ACTIVE_BOUNDARY_DOC mismatch: expected ${activeStage.boundaryDoc}, found ${policy.activeBoundaryDoc}`
      );
    }
    if (policy.activeEvidenceDoc !== activeStage.evidenceDoc) {
      errors.push(
        `ACTIVE_EVIDENCE_DOC mismatch: expected ${activeStage.evidenceDoc}, found ${policy.activeEvidenceDoc}`
      );
    }
  }

  const parsed = new Map();

  for (const stage of STAGES) {
    let stageText = "";
    let evidenceText = "";
    try {
      stageText = readUtf8(baseDir, stage.boundaryDoc);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      continue;
    }
    try {
      evidenceText = readUtf8(baseDir, stage.evidenceDoc);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      continue;
    }

    const stageParsed = parseStageDoc(stageText, stage, errors);
    const evidenceParsed = parseEvidenceDoc(evidenceText, stage, errors);

    if (stageParsed.stageStatus !== evidenceParsed.stageStatus) {
      errors.push(
        `${stage.id}: stage status mismatch between ${stage.boundaryDoc} (${stageParsed.stageStatus}) and ${stage.evidenceDoc} (${evidenceParsed.stageStatus})`
      );
    }

    for (let i = 1; i <= stage.items; i += 1) {
      const tracker = stageParsed.items.get(i);
      const evidence = evidenceParsed.rows.get(i);
      if (!tracker || !evidence) continue;

      if (tracker.status === "done" && evidence.passFail !== "PASS") {
        errors.push(
          `${stage.id}: item ${i} is Done in ${stage.boundaryDoc} but Pass/Fail is ${evidence.passFail} in ${stage.evidenceDoc}`
        );
      }

      if (evidence.passFail === "PASS" && tracker.status !== "done") {
        errors.push(
          `${stage.id}: item ${i} is PASS in ${stage.evidenceDoc} but not Done in ${stage.boundaryDoc}`
        );
      }
    }

    parsed.set(stage.id, {
      stage: stageParsed,
      evidence: evidenceParsed
    });
  }

  const activeIndex = STAGES.findIndex((stage) => stage.id === policy.activeStageId);
  if (activeIndex === -1) {
    errors.push(`Active stage not found in stage definitions: ${policy.activeStageId}`);
  } else {
    for (let i = 0; i < STAGES.length; i += 1) {
      const stageId = STAGES[i].id;
      const entry = parsed.get(stageId);
      if (!entry) continue;

      if (i < activeIndex) {
        if (entry.stage.stageStatus !== "done") {
          errors.push(`${stageId}: prior stage must be Done before ${policy.activeStageId} can be active`);
        }
        if (entry.evidence.exitGateApproved !== "yes") {
          errors.push(`${stageId}: prior stage evidence must have Exit Gate Approved: Yes`);
        }
        if (entry.evidence.overallSignoff !== "approved") {
          errors.push(`${stageId}: prior stage evidence must have Overall Signoff: Approved`);
        }
      }

      if (i > activeIndex && entry.stage.stageStatus === "done") {
        errors.push(
          `${stageId}: future stage cannot be Done while ${policy.activeStageId} remains active`
        );
      }
    }
  }

  if (errors.length > 0) {
    console.error("Phase boundary check failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `Phase boundary check passed for active stage ${policy.activeStageId} (${policy.activeBoundaryDoc})`
  );
}

main();
