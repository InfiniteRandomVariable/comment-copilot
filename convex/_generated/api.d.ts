/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as agentRuns from "../agentRuns.js";
import type * as auditLogs from "../auditLogs.js";
import type * as autopilot from "../autopilot.js";
import type * as billing from "../billing.js";
import type * as comments from "../comments.js";
import type * as context from "../context.js";
import type * as crons from "../crons.js";
import type * as devSeed from "../devSeed.js";
import type * as drafts from "../drafts.js";
import type * as engagement from "../engagement.js";
import type * as intent from "../intent.js";
import type * as lib_auditLogPurge from "../lib/auditLogPurge.js";
import type * as lib_auditRetention from "../lib/auditRetention.js";
import type * as lib_draftCandidateRouting from "../lib/draftCandidateRouting.js";
import type * as lib_messageCleanup from "../lib/messageCleanup.js";
import type * as lib_usageDashboard from "../lib/usageDashboard.js";
import type * as notifications from "../notifications.js";
import type * as persona from "../persona.js";
import type * as reviews from "../reviews.js";
import type * as skillTemplate from "../skillTemplate.js";
import type * as skills from "../skills.js";
import type * as socialAccounts from "../socialAccounts.js";
import type * as styleSkills from "../styleSkills.js";
import type * as usageDashboard from "../usageDashboard.js";
import type * as users from "../users.js";
import type * as utils from "../utils.js";
import type * as wallets from "../wallets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  agentRuns: typeof agentRuns;
  auditLogs: typeof auditLogs;
  autopilot: typeof autopilot;
  billing: typeof billing;
  comments: typeof comments;
  context: typeof context;
  crons: typeof crons;
  devSeed: typeof devSeed;
  drafts: typeof drafts;
  engagement: typeof engagement;
  intent: typeof intent;
  "lib/auditLogPurge": typeof lib_auditLogPurge;
  "lib/auditRetention": typeof lib_auditRetention;
  "lib/draftCandidateRouting": typeof lib_draftCandidateRouting;
  "lib/messageCleanup": typeof lib_messageCleanup;
  "lib/usageDashboard": typeof lib_usageDashboard;
  notifications: typeof notifications;
  persona: typeof persona;
  reviews: typeof reviews;
  skillTemplate: typeof skillTemplate;
  skills: typeof skills;
  socialAccounts: typeof socialAccounts;
  styleSkills: typeof styleSkills;
  usageDashboard: typeof usageDashboard;
  users: typeof users;
  utils: typeof utils;
  wallets: typeof wallets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
