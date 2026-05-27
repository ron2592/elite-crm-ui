/**
 * Command Center — Company Config
 *
 * All branding strings live here.
 * Per-client deployment: set these in Vercel → Environment Variables.
 *
 * Usage:
 *   import { COMPANY } from "@/lib/config";
 *   <span>{COMPANY.name}</span>
 */

export const COMPANY = {
  /** Short name shown in sidebar logo and browser tab */
  name:     process.env.NEXT_PUBLIC_COMPANY_NAME     ?? "Elite Work",

  /** Shown under logo on login page */
  subtitle: process.env.NEXT_PUBLIC_COMPANY_SUBTITLE ?? "Home Improvement",

  /** Full name for page titles / meta */
  full:     process.env.NEXT_PUBLIC_COMPANY_FULL     ?? "Elite Work Home Improvement",

  /** Internal product name — shown on login screen */
  appName:  process.env.NEXT_PUBLIC_APP_NAME         ?? "Command Center",

  /** Browser tab: "<company.name> Command Center" */
  pageTitle: `${process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Elite Work"} Command Center`,

  /** Footer / legal line */
  legal:    process.env.NEXT_PUBLIC_COMPANY_LEGAL    ?? "Elite Work Home Improvement · Internal Use Only",
} as const;