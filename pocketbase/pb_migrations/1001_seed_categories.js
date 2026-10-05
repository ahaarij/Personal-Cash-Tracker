/// <reference path="../types.d.ts" />

// Seed default categories — these are created per-user on first sign-in via hook.
// This migration only ensures the seed list is version-controlled.

migrate((_db) => {
  // No-op: category seeding happens in the post-auth hook (pb_hooks/seed.pb.js)
  // so each user gets their own copy. This file serves as the authoritative list.
}, (_db) => {
  // no-op
})

// Exported for use by seed hook
const DEFAULT_CATEGORIES = [
  { name: "Food & Drink",    colour: "#E87040" },
  { name: "Transport",       colour: "#3B82F6" },
  { name: "Shopping",        colour: "#8B5CF6" },
  { name: "Bills",           colour: "#6B7280" },
  { name: "Health",          colour: "#10B981" },
  { name: "Entertainment",   colour: "#F59E0B" },
  { name: "Travel",          colour: "#EC4899" },
  { name: "Other",           colour: "#9CA3AF" },
]
